import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Route, Clock3, Gauge } from 'lucide-react';
import type { TrackPreview } from '@apex-ride/ride-core/history';
import type { HistoryRide } from './types';
import { historyService } from './service';
import { formatDuration } from '../ride/format';
export function LastRide({ ride }: { ride: HistoryRide }) {
  const [track, setTrack] = useState<TrackPreview | null>(null);
  useEffect(() => {
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
  }, [ride.id]);
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
