import type { TrackPreview } from '@apex-ride/ride-core/history';
import { ChevronRight, Clock3, Gauge, Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDuration } from '../ride/format';
import { historyService } from './service';
import type { HistoryRide } from './types';
export function LastRide({
  ride,
  compact = false,
}: {
  ride: HistoryRide;
  compact?: boolean;
}) {
  const [track, setTrack] = useState<TrackPreview | null>(null);
  useEffect(() => {
    if (compact) return;
    let live = true;
    void historyService
      .track(ride.id)
      .then((t) => {
        if (live) setTrack(t);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ride.id, compact]);
  if (compact)
    return (
      <Link
        to={`/historico/${ride.id}`}
        className="last-ride home-recent-card panel"
      >
        <span className="home-recent-icon" aria-hidden>
          <Route size={28} />
        </span>
        <div>
          <h3>{ride.title}</h3>
          <p>
            {ride.motorcycle_snapshot
              ? `${ride.motorcycle_snapshot.brand} ${ride.motorcycle_snapshot.model}`
              : 'Moto histórica'}
            {ride.route_name ? ` · ${ride.route_name}` : ''}
          </p>
          <div className="home-recent-meta">
            <time dateTime={ride.started_at}>
              {new Date(ride.started_at).toLocaleDateString('pt-BR')}
            </time>
            <span>
              {(ride.distance_meters / 1000).toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              })}{' '}
              km
            </span>
            <span>
              <Clock3 size={15} aria-hidden />
              {formatDuration(ride.active_ms)}
            </span>
          </div>
        </div>
        <ChevronRight size={18} aria-hidden />
      </Link>
    );
  const points = track?.segments.flatMap((s) => s.points) ?? [];
  const xs = points.map((p) => p.longitude),
    ys = points.map((p) => p.latitude),
    west = Math.min(...xs),
    east = Math.max(...xs),
    south = Math.min(...ys),
    north = Math.max(...ys);
  const width = Math.max(0.00001, east - west),
    height = Math.max(0.00001, north - south),
    scale = Math.min(160 / width, 100 / height);
  return (
    <Link to={`/historico/${ride.id}`} className="last-ride panel">
      <div className="photo history-thumb">
        {points.length ? (
          <svg
            viewBox="0 0 180 120"
            role="img"
            aria-label="Miniatura do trajeto GPS registrado"
          >
            {track?.segments.map((s, i) => (
              <polyline
                key={i}
                points={s.points
                  .map(
                    (p) =>
                      `${10 + (p.longitude - west) * scale},${110 - (p.latitude - south) * scale}`,
                  )
                  .join(' ')}
                fill="none"
                stroke="#ff202d"
                strokeWidth="3"
              />
            ))}
          </svg>
        ) : (
          <span>Percurso nos detalhes</span>
        )}
      </div>
      <div>
        <h3>{ride.title}</h3>
        <p>
          {ride.motorcycle_snapshot
            ? `${ride.motorcycle_snapshot.brand} ${ride.motorcycle_snapshot.model}`
            : 'Moto histórica'}{' '}
          · {ride.mode}
          {ride.route_name ? ` · ${ride.route_name}` : ''}
        </p>
        <div className="ride-summary">
          <div>
            <Route />
            <span>
              <strong>
                {(ride.distance_meters / 1000).toFixed(2)} <small>km</small>
              </strong>
              <small>Distância</small>
            </span>
          </div>
          <div>
            <Clock3 />
            <span>
              <strong>{formatDuration(ride.active_ms)}</strong>
              <small>Tempo ativo</small>
            </span>
          </div>
          <div>
            <Gauge />
            <span>
              <strong>
                {ride.average_kmh === null ? '—' : ride.average_kmh.toFixed(1)}{' '}
                km/h
              </strong>
              <small>Vel. média</small>
            </span>
          </div>
        </div>
      </div>
      <ChevronRight className="last-ride-chevron" size={20} />
    </Link>
  );
}
