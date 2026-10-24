import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useOffline } from '../offline/context';
import { useRide } from '../ride/context';
import { historyService } from './service';
import type { HistoryDetail } from './detail-types';
import { comparisonService } from '../comparison/service';
import { videoRepository } from '../video/repository';
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
            <input
              type="checkbox"
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
              <input
                type="checkbox"
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
            <input
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Descrição
            <textarea
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Visibilidade
            <select
              aria-label="Visibilidade da atividade salva"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'public' | 'private')
              }
            >
              <option value="public">Pública</option>
              <option value="private">Privada</option>
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Salvar alterações
          </button>
        </div>
      </details>
      <p>
        O resumo público usa título neutro, data sem horário, distância e
        duração aproximadas. Trajeto, locais de início/fim, descrição e
        telemetria detalhada não são publicados.
      </p>
      <div className="history-actions">
        <button className="button" disabled={busy} onClick={() => void share()}>
          Copiar link público
        </button>
        {typeof navigator.share === 'function' && (
          <button
            className="button"
            disabled={busy}
            onClick={() => void share(true)}
          >
            Compartilhar
          </button>
        )}
        {allowed && (
          <Link className="text-link" to={`/compartilhar/rides/${ride.id}`}>
            Abrir resumo público
          </Link>
        )}
        <button
          className="button"
          disabled={busy}
          onClick={() => void remove()}
        >
          Excluir atividade
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
