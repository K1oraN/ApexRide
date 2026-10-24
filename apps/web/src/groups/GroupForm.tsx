import { ChoiceSelect } from '../components/design-system';
import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Checkbox,
  Input,
  Select,
  Textarea,
} from '../components/design-system';
import { social, uploadPhoto } from '../social/service';
import type { Group } from './types';
const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
    ' ',
  );
export function GroupForm({
  group,
  onSaved,
  onCancel,
}: {
  group?: Group;
  onSaved?: (g: Group) => void;
  onCancel?: () => void;
}) {
  const navigate = useNavigate(),
    creation = useRef(crypto.randomUUID());
  const [name, setName] = useState(group?.name ?? ''),
    [description, setDescription] = useState(group?.description ?? '');
  const [privacy, setPrivacy] = useState(group?.privacy_type ?? 'public'),
    [discovery, setDiscovery] = useState(group?.discovery_mode ?? 'listed');
  const [city, setCity] = useState(group?.city ?? ''),
    [state, setState] = useState(group?.state ?? ''),
    [cats, setCats] = useState(group?.categories ?? []);
  const [rules, setRules] = useState((group?.rules ?? []).join('\n')),
    [join, setJoin] = useState(group?.join_policy ?? 'immediate');
  const [posting, setPosting] = useState(group?.posting_policy ?? 'members'),
    [invites, setInvites] = useState(group?.members_can_invite ?? false);
  const [confirm, setConfirm] = useState(false),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [photos, setPhotos] = useState<{ avatar?: File; cover?: File }>({}),
    [remove, setRemove] = useState<{ avatar?: boolean; cover?: boolean }>({});
  const [saved, setSaved] = useState<Group | undefined>(undefined);
  const uploaded = useRef<Record<string, string>>({});
  const isOwner = !group || group.role === 'owner';
  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = {
        name,
        description,
        privacyType: privacy,
        discoveryMode: privacy === 'public' ? 'listed' : discovery,
        city,
        state,
        categories: cats,
        rules: rules
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        joinPolicy: join,
        postingPolicy: posting,
        membersCanInvite: invites,
        confirmPrivacy: confirm,
        creationKey: creation.current,
      };
      const targetId = group?.id ?? saved?.id;
      const result = (
        await social<{ group: Group }>(
          targetId ? `/groups/${targetId}` : '/groups',
          targetId ? 'PATCH' : 'POST',
          body,
        )
      ).group;
      setSaved(result);
      const media: Record<string, string | null> = {};
      for (const slot of ['avatar', 'cover'] as const) {
        const file = photos[slot];
        if (file) {
          if (!uploaded.current[slot])
            uploaded.current[slot] = (await uploadPhoto(file)).media.id;
          media[slot] = uploaded.current[slot]!;
        } else if (remove[slot]) media[slot] = null;
      }
      if (Object.keys(media).length)
        await social(`/groups/${result.id}/images`, 'PATCH', media);
      if (onSaved) onSaved(result);
      else navigate(`/comunidade/grupos/${result.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel social-composer">
      <h2>{group ? 'Configurações do grupo' : 'Criar grupo'}</h2>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!preview) setPreview(true);
          else void save();
        }}
      >
        <fieldset className="account-form" disabled={busy}>
          <label className="account-field">
            Nome do grupo
            <Input
              required
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPreview(false);
              }}
            />
          </label>
          <label className="account-field">
            Descrição pública
            <Textarea
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="account-field">
            <span>Privacidade</span>
            <ChoiceSelect
              aria-label="Privacidade"
              disabled={!isOwner}
              value={privacy}
              onChange={(e) => {
                setPrivacy(e.target.value as typeof privacy);
                setConfirm(false);
              }}
            >
              <option value="public">Público</option>
              <option value="private">Privado</option>
            </ChoiceSelect>
          </div>
          {privacy === 'private' && (
            <div className="account-field">
              <span>Descoberta</span>
              <ChoiceSelect
                aria-label="Descoberta"
                disabled={!isOwner}
                value={discovery}
                onChange={(e) =>
                  setDiscovery(e.target.value as typeof discovery)
                }
              >
                <option value="listed">Descobrível</option>
                <option value="unlisted">
                  Não listado · somente por convite
                </option>
              </ChoiceSelect>
            </div>
          )}
          <p>
            {privacy === 'public'
              ? 'Apresentação e posts públicos podem ser consultados.'
              : 'Posts e membros ficam restritos aos participantes autorizados.'}
          </p>
          {group &&
            (privacy !== group.privacy_type ||
              (privacy === 'private' &&
                discovery !== group.discovery_mode)) && (
              <label>
                <Checkbox
                  required
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                Confirmo a alteração de privacidade. Posts históricos privados
                permanecerão restritos.
              </label>
            )}
          <label className="account-field">
            Cidade (opcional)
            <Input
              maxLength={100}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label className="account-field">
            Estado (opcional)
            <Select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Todo o Brasil</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </label>
          <fieldset className="group-categories">
            <legend>Interesses de motocicleta (opcionais)</legend>
            {BIKE_CATEGORIES.map((c) => (
              <label key={c}>
                <Checkbox
                  checked={cats.includes(c)}
                  onChange={(e) =>
                    setCats((old) =>
                      e.target.checked
                        ? [...old, c]
                        : old.filter((x) => x !== c),
                    )
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
          <label className="account-field">
            Regras (uma por linha, até 20)
            <Textarea
              rows={5}
              maxLength={10020}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
          </label>
          <div className="account-field">
            <span>Entrada</span>
            <ChoiceSelect
              aria-label="Entrada"
              value={join}
              onChange={(e) => setJoin(e.target.value as typeof join)}
            >
              <option value="immediate">
                Público: imediata / Privado: aprovação
              </option>
              <option value="approval">Aprovação prévia</option>
            </ChoiceSelect>
          </div>
          <div className="account-field">
            <span>Quem pode publicar</span>
            <ChoiceSelect
              aria-label="Quem pode publicar"
              value={posting}
              onChange={(e) => setPosting(e.target.value as typeof posting)}
            >
              <option value="members">Todos os membros</option>
              <option value="staff">Equipe de administração e moderação</option>
            </ChoiceSelect>
          </div>
          <label>
            <Checkbox
              checked={invites}
              onChange={(e) => setInvites(e.target.checked)}
            />
            Permitir convites por membros
          </label>
          {(['avatar', 'cover'] as const).map((slot) => (
            <div key={slot}>
              <label className="account-field">
                {slot === 'avatar' ? 'Imagem de perfil' : 'Imagem de capa'}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      setError('Use fotos de até 5 MiB.');
                      return;
                    }
                    setPhotos((old) => ({ ...old, [slot]: f }));
                    delete uploaded.current[slot];
                  }}
                />
              </label>
              {group?.images[slot] && (
                <label>
                  <Checkbox
                    checked={remove[slot] ?? false}
                    onChange={(e) =>
                      setRemove((old) => ({ ...old, [slot]: e.target.checked }))
                    }
                  />
                  Remover imagem atual
                </label>
              )}
            </div>
          ))}
        </fieldset>
        {preview && (
          <div className="social-summary" role="status">
            <h3>Revise o grupo</h3>
            <p>
              {name} · {privacy === 'public' ? 'Público' : 'Privado'}
            </p>
            <p className="post-text">{description}</p>
            <p>
              {[city, state].filter(Boolean).join(', ')} · {cats.join(', ')}
            </p>
            <p>
              Regras: {rules.split('\n').filter((s) => s.trim()).length}.
              Nenhuma pessoa será adicionada automaticamente.
            </p>
          </div>
        )}
        <div className="social-controls">
          <Button variant="primary" disabled={busy}>
            {busy
              ? 'Salvando…'
              : saved
                ? 'Tentar concluir fotografias'
                : preview
                  ? group
                    ? 'Salvar grupo'
                    : 'Confirmar criação'
                  : 'Revisar informações'}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
