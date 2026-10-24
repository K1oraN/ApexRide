import { ChoiceSelect } from '../components/design-system';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, Input, Select, Textarea } from '../components/design-system';
import { useGarage } from '../garage/context';
import type { Group } from '../groups/types';
import { historyService } from '../history/service';
import type { HistoryRide } from '../history/types';
import { apiUrl } from '../services/auth';
import { savePost, social, uploadPhoto } from './service';
import type { Media, RideSummary, SocialPost } from './types';
import { usePage } from './usePage';
function LocalPhoto({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null),
    anchor = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    if (image.current) image.current.src = next;
    if (anchor.current) anchor.current.href = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <a ref={anchor} target="_blank" rel="noreferrer">
      <img ref={image} alt="Prévia local da fotografia" />
    </a>
  );
}
export function Composer({
  post,
  rideId: initialRide = '',
  onSaved,
  onCancel,
  groupId,
  initialText = '',
  achievementCode,
}: {
  post?: SocialPost;
  rideId?: string;
  onSaved: () => void;
  onCancel: () => void;
  groupId?: string | undefined;
  initialText?: string;
  achievementCode?: string;
}) {
  const { user } = useAuth(),
    { motorcycles } = useGarage();
  const groups = usePage<Group>('/groups/mine');
  const [destination, setDestination] = useState(
    groupId ?? post?.group_id ?? '',
  );
  const [text, setText] = useState(post?.text ?? initialText),
    [visibility, setVisibility] = useState(post?.visibility ?? 'followers'),
    [bike, setBike] = useState(post?.motorcycle_id ?? ''),
    [ride, setRide] = useState(post?.ride_id ?? initialRide);
  const [media, setMedia] = useState<Media[]>(post?.media ?? []),
    [files, setFiles] = useState<File[]>([]),
    [rides, setRides] = useState<HistoryRide[]>([]),
    [ridePage, setRidePage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState<RideSummary | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [rideError, setRideError] = useState('');
  useEffect(() => {
    let live = true;
    void historyService
      .list(
        new URLSearchParams({
          visibility: 'public',
          page: String(ridePage),
          limit: '20',
        }),
      )
      .then((r) => {
        if (live) {
          setRides((old) =>
            ridePage === 1
              ? r.rides
              : [
                  ...old,
                  ...r.rides.filter(
                    (item) => !old.some((p) => p.id === item.id),
                  ),
                ],
          );
          setHasMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (live) setRideError(e.message);
      });
    return () => {
      live = false;
    };
  }, [ridePage]);
  useEffect(() => {
    let live = true;
    if (ride)
      void social<{ summary: RideSummary }>(
        `/rides/${encodeURIComponent(ride)}/preview`,
      )
        .then((r) => {
          if (live) setSummary(r.summary);
        })
        .catch((e) => {
          if (live) setRideError(e.message);
        });
    return () => {
      live = false;
    };
  }, [ride]);
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let uploaded = [...media];
      let pending = [...files];
      // Keep each completed upload on failure so retry never sends it twice.
      while (pending.length) {
        const result = await uploadPhoto(pending[0]!);
        uploaded = [...uploaded, result.media];
        pending = pending.slice(1);
        setMedia(uploaded);
        setFiles(pending);
      }
      await savePost(
        {
          text,
          visibility,
          motorcycleId: bike || null,
          rideId: ride || null,
          mediaIds: uploaded.map((m) => m.id),
          achievementCode: achievementCode ?? post?.achievement_code ?? null,
        },
        post?.id,
        destination || undefined,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list);
    if (
      next.some(
        (f) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
          f.size > 5 * 1024 * 1024,
      ) ||
      next.length + files.length + media.length > 5
    ) {
      setError('Use até cinco fotos JPEG, PNG ou WebP de até 5 MiB cada.');
      return;
    }
    setFiles((old) => [...old, ...next]);
    setError('');
  }
  if (!user) return <Link to="/entrar">Entrar para publicar</Link>;
  return (
    <section
      className="panel social-composer"
      aria-label={post ? 'Editar publicação' : 'Criar publicação'}
    >
      <h3>{post ? 'Editar publicação' : 'Nova publicação'}</h3>
      {(achievementCode || post?.achievement_code) && (
        <p>
          Compartilhar apenas o reconhecimento da conquista, sem datas, eventos,
          rotas ou GPS de origem.
        </p>
      )}
      <fieldset disabled={busy} className="account-form">
        <label className="account-field">
          Texto da publicação
          <Textarea
            aria-label="Texto da publicação"
            maxLength={2000}
            rows={4}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(false);
            }}
          />
        </label>
        <small>{text.length}/2000</small>
        <label className="account-field">
          Fotografias
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              selectFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <div className="social-photo-previews">
          {media.map((m, i) => (
            <div key={m.id}>
              <a href={apiUrl(m.url)} target="_blank" rel="noreferrer">
                <img src={apiUrl(m.thumbnailUrl)} alt={`Fotografia ${i + 1}`} />
              </a>
              <Button
                variant="destructive"
                onClick={() => {
                  setMedia((old) => old.filter((p) => p.id !== m.id));
                  if (!post?.media.some((p) => p.id === m.id))
                    void social(`/media/${m.id}`, 'DELETE').catch(() => {});
                }}
              >
                Remover foto {i + 1}
              </Button>
            </div>
          ))}
          {files.map((f, i) => (
            <div key={`${f.name}:${i}`}>
              <LocalPhoto file={f} />
              <Button
                variant="destructive"
                onClick={() => setFiles((old) => old.filter((_, n) => n !== i))}
              >
                Remover foto local {i + 1}
              </Button>
            </div>
          ))}
        </div>
        <label className="account-field">
          Associar moto
          <Select
            aria-label="Associar moto"
            value={bike}
            onChange={(e) => setBike(e.target.value)}
          >
            <option value="">Sem moto</option>
            {motorcycles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brand} {m.model} · {m.year}
              </option>
            ))}
          </Select>
        </label>
        <label className="account-field">
          Associar Ride público
          <Select
            aria-label="Associar Ride público"
            value={ride}
            onChange={(e) => {
              setRide(e.target.value);
              setRideError('');
            }}
          >
            <option value="">Sem Ride</option>
            {ride && !rides.some((r) => r.id === ride) && (
              <option value={ride}>Ride selecionado no Histórico</option>
            )}
            {rides.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </label>
        {hasMore && (
          <Button variant="secondary" onClick={() => setRidePage((n) => n + 1)}>
            Carregar mais atividades
          </Button>
        )}
        <small>
          Somente atividades sincronizadas e públicas são elegíveis. Ajuste a
          privacidade conscientemente no <Link to="/historico">Histórico</Link>.
          Vídeos locais permanecem no aparelho.
        </small>
        {rideError && <p role="alert">{rideError}</p>}
        {!post && !groupId && (
          <label className="account-field">
            Destino
            <Select
              aria-label="Destino da publicação"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Meu perfil / Comunidade</option>
              {groups.data.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            {groups.data.nextCursor && (
              <Button variant="secondary" onClick={() => void groups.more()}>
                Mais grupos para compartilhar
              </Button>
            )}
            {groups.error && <small role="alert">{groups.error}</small>}
          </label>
        )}
        {destination ? (
          <p>
            Publicação no grupo. O acesso segue a privacidade do grupo e do seu
            perfil. O resumo do Ride continua sem GPS.
          </p>
        ) : (
          <div className="account-field">
            <span>Público da publicação</span>
            <ChoiceSelect
              aria-label="Público da publicação"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as SocialPost['visibility'])
              }
            >
              <option value="public">Público</option>
              <option value="followers">Seguidores autorizados</option>
              <option value="private">Somente eu</option>
            </ChoiceSelect>
          </div>
        )}
        {user.privacy.profileVisibility === 'private' && (
          <p>
            Seu perfil privado limita o acesso aos seguidores aprovados,
            inclusive para posts marcados como públicos.
          </p>
        )}
        <Button variant="secondary" onClick={() => setPreview(!preview)}>
          {preview ? 'Fechar prévia' : 'Visualizar prévia'}
        </Button>
        {preview && (
          <div className="social-summary">
            <p className="post-text">{text || 'Sem legenda'}</p>
            {(achievementCode || post?.achievement_code) && (
              <p>Conquista verificada pelo servidor · Sem detalhes de origem</p>
            )}
            <p>
              {media.length + files.length} fotografia(s) ·{' '}
              {visibility === 'public'
                ? 'Público'
                : visibility === 'private'
                  ? 'Somente eu'
                  : 'Seguidores'}
            </p>
            {bike && (
              <p>
                {motorcycles.find((m) => m.id === bike)?.model ??
                  'Moto indisponível'}
              </p>
            )}
            {summary?.id === ride && (
              <p>
                {summary.mode} · {summary.day} · {summary.distanceKm} km ·{' '}
                {summary.activeMinutes} min · Sem GPS
              </p>
            )}
            <small>
              Prévia. A publicação depende de confirmação do servidor.
            </small>
          </div>
        )}
        <div className="social-controls">
          <Button
            variant="primary"
            loading={busy}
            disabled={
              Boolean(ride && summary?.id !== ride) ||
              (!text.trim() && !media.length && !files.length && !bike && !ride)
            }
            onClick={() => void publish()}
          >
            {busy ? 'Enviando…' : post ? 'Salvar publicação' : 'Publicar'}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
