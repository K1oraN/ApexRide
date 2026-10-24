import { ChoiceSelect } from '../components/design-system';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { comparisonService } from '../comparison/service';
import { Button, Checkbox, Input, Textarea } from '../components/design-system';
import { useOffline } from '../offline/context';
import { useRide } from '../ride/context';
import { videoRepository } from '../video/repository';
import type { HistoryDetail } from './detail-types';
import { historyService } from './service';
export function RidePrivacyControls({
  ride,
  onSaved,
}: {
  ride: HistoryDetail;
  onSaved: () => void;
}) {
  const { user } = useAuth(),
    offline = useOffline(),
    { controller, snapshot } = useRide(),
    navigate = useNavigate();
  const [title, setTitle] = useState(ride.title),
    [description, setDescription] = useState(ride.description),
    [visibility, setVisibility] = useState(ride.visibility),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [comparisonChoice, setComparisonChoice] = useState<{
    enabled: boolean;
    technical: boolean;
  } | null>(null);
  const allowed =
    ride.visibility === 'public' &&
    user?.privacy.profileVisibility === 'public';
  const url = new URL(`/compartilhar/rides/${ride.id}`, window.location.origin)
    .href;
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await historyService.update(ride.id, { title, description, visibility });
      onSaved();
      setMessage('Alterações salvas.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function comparison(enabled: boolean, technical: boolean) {
    setBusy(true);
    setMessage('');
    try {
      await comparisonService.privacy(ride.id, enabled, technical);
      setComparisonChoice({ enabled, technical });
      setMessage(
        enabled
          ? 'Participação em comparações atualizada.'
          : 'Participação revogada. Novas consultas deixam de usar esta atividade.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share(native = false) {
    if (!allowed) {
      setMessage(
        'O compartilhamento exige atividade e perfil públicos. Altere a privacidade explicitamente se desejar.',
      );
      return;
    }
    try {
      if (native && navigator.share)
        await navigator.share({
          title: 'Apex Ride · resumo público',
          text: 'Resumo de atividade no Apex Ride, sem trajeto GPS.',
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link público copiado.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setMessage('Não foi possível copiar. Use o link Abrir resumo público.');
    }
  }
  async function remove() {
    if (
      !window.confirm(
        'Excluir esta atividade do histórico e das estatísticas, incluindo os vídeos locais associados? O link público deixará de funcionar. Rotas cadastradas serão preservadas.',
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      await historyService.remove(ride.id);
      if (user) {
        if (controller.video)
          await controller.video.discard(user.id, ride.client_id);
        else await videoRepository.remove(user.id, ride.client_id);
      }
      const local = offline
        .getSnapshot()
        .sessions.find((s) => s.payload.clientId === ride.client_id);
      if (local?.confirmation) await offline.cleanup(ride.client_id);
      if (
        snapshot.state === 'saved' &&
        snapshot.activity?.payload.clientId === ride.client_id
      )
        controller.reset();
      navigate('/historico');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel history-panel"
      aria-label="Editar e compartilhar atividade"
    >
      <h2>Atividade e privacidade</h2>
      {
        <div className="history-edit comparison-privacy">
          <label>
            <Checkbox
              checked={
                comparisonChoice?.enabled ?? ride.comparison_enabled ?? false
              }
              disabled={busy}
              onChange={(e) => void comparison(e.target.checked, false)}
            />
            Autorizar participação em comparações comunitárias protegidas
          </label>
          <p>
            Opcional e desativada inicialmente. Exige perfil e atividade
            públicos. Em vias comuns, apenas estatísticas agregadas são
            utilizadas.
          </p>
          {ride.route_snapshot?.kind === 'circuit' && ride.mode === 'pista' && (
            <label>
              <Checkbox
                checked={
                  comparisonChoice?.technical ??
                  ride.comparison_technical ??
                  false
                }
                disabled={
                  busy ||
                  !(comparisonChoice?.enabled ?? ride.comparison_enabled)
                }
                onChange={(e) => void comparison(true, e.target.checked)}
              />
              Autorizar também telemetria e voltas em circuito fechado
              verificado, sem coordenadas GPS ou horários absolutos
            </label>
          )}
        </div>
      }
      <details>
        <summary>Editar título, descrição e visibilidade</summary>
        <div className="history-edit">
          <label>
            Título
            <Input
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Descrição
            <Textarea
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div>
            <span>Visibilidade</span>
            <ChoiceSelect
              aria-label="Visibilidade da atividade salva"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'public' | 'private')
              }
            >
              <option value="public">Pública</option>
              <option value="private">Privada</option>
            </ChoiceSelect>
          </div>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Salvar alterações
          </Button>
        </div>
      </details>
      <p>
        O resumo público usa título neutro, data sem horário, distância e
        duração aproximadas. Trajeto, locais de início/fim, descrição e
        telemetria detalhada não são publicados.
      </p>
      <div className="history-actions">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void share()}
        >
          Copiar link público
        </Button>
        {typeof navigator.share === 'function' && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void share(true)}
          >
            Compartilhar
          </Button>
        )}
        {allowed && (
          <Link
            className="text-link action-link"
            to={`/compartilhar/rides/${ride.id}`}
          >
            Abrir resumo público
          </Link>
        )}
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => void remove()}
        >
          Excluir atividade
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
