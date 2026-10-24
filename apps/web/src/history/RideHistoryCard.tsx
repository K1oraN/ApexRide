import { Link } from 'react-router';
import { Route, Timer, Gauge } from 'lucide-react';
import { formatDuration } from '../ride/format';
import { ModeIcon } from '../components/Brand';
import type { HistoryRide } from './types';
export function RideHistoryCard({
  ride,
  to,
  state = 'Sincronizada',
}: {
  ride: HistoryRide;
  to?: string;
  state?: string;
}) {
  return (
    <article className="panel history-card">
      <Link to={to ?? `/historico/${ride.id}`}>
        <span className="eyebrow">
          <ModeIcon mode={ride.mode} />
          {ride.mode} · {new Date(ride.started_at).toLocaleDateString('pt-BR')}
        </span>
        <h3>{ride.title}</h3>
        <p>
          {ride.motorcycle_snapshot
            ? `${ride.motorcycle_snapshot.brand} ${ride.motorcycle_snapshot.model}`
            : 'Moto histórica indisponível'}
          {ride.route_name ? ` · ${ride.route_name}` : ''}
        </p>
        <div className="ride-summary">
          <span>
            <Route />
            {(ride.distance_meters / 1000).toLocaleString('pt-BR', {
              maximumFractionDigits: 2,
            })}{' '}
            km
          </span>
          <span>
            <Timer />
            {formatDuration(ride.active_ms)}
          </span>
          <span>
            <Gauge />
            {ride.average_kmh === null ? '—' : ride.average_kmh.toFixed(1)} km/h
          </span>
        </div>
        <small>
          {ride.visibility === 'public' ? 'Pública' : 'Privada'} · {state}
        </small>
      </Link>
    </article>
  );
}
