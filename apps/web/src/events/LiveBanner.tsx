import { Link } from 'react-router';
import { Button } from '../components/design-system';
import { useLiveLocation } from './live-context';
export function LiveBanner() {
  const { state, controller } = useLiveLocation();
  if (!state.session) return null;
  return (
    <div className="session-warning live-banner" role="status">
      <span>
        {state.lastAck && state.now - state.lastAck < 15000
          ? 'Compartilhando localização'
          : 'Aguardando posição atual'}{' '}
        · {state.eventTitle} ·{' '}
        {state.session.audience_scope === 'organizers'
          ? 'Somente organizadores'
          : 'Participantes confirmados'}{' '}
        ·{' '}
        {Math.max(
          0,
          Math.ceil((Date.parse(state.session.expires_at) - state.now) / 60000),
        )}{' '}
        min restantes
      </span>
      <Link
        className="text-link action-link"
        to={`/comunidade/eventos/${state.eventId}/mapa`}
      >
        Mapa social
      </Link>
      <Button variant="primary" onClick={() => controller.stop()}>
        Parar compartilhamento
      </Button>
    </div>
  );
}
