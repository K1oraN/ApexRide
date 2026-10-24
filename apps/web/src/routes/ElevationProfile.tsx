import { useMemo, useState } from 'react';
import type { Coordinate } from '@apex-ride/ride-core/routes';
import { elevationProfile } from './elevation';
export function ElevationProfile({
  coordinates,
  altitudes,
  onPoint,
}: {
  coordinates: Coordinate[];
  altitudes?: (number | null)[] | undefined;
  onPoint?: (point: Coordinate) => void;
}) {
  const profile = useMemo(
    () => elevationProfile(coordinates, altitudes ?? []),
    [coordinates, altitudes],
  );
  const [selected, setSelected] = useState(0);
  if (!profile.sufficient)
    return (
      <section className="elevation-profile panel">
        <h2>Perfil de elevação</h2>
        <p>Dados de altitude insuficientes. Ganho e perda não disponíveis.</p>
      </section>
    );
  const span = Math.max(1, profile.max! - profile.min!),
    total = profile.points.at(-1)!.distance;
  let path = '',
    connected = false;
  for (const point of profile.points) {
    if (point.altitude === null) {
      connected = false;
      continue;
    }
    path += `${connected ? 'L' : 'M'}${((point.distance / Math.max(total, 1)) * 600).toFixed(2)},${(130 - ((point.altitude - profile.min!) / span) * 110).toFixed(2)} `;
    connected = true;
  }
  const point = profile.points[Math.min(selected, profile.points.length - 1)]!;
  return (
    <section className="elevation-profile panel">
      <h2>Perfil de elevação</h2>
      <p>
        Fonte: altitude informada no GPX · precisão desconhecida · método{' '}
        {profile.version}.
      </p>
      <svg
        viewBox="0 0 600 150"
        role="img"
        aria-label="Perfil de altitude do segmento, com lacunas preservadas"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent, #ff172b)"
          strokeWidth="3"
        />
        <line
          x1={(point.distance / Math.max(total, 1)) * 600}
          x2={(point.distance / Math.max(total, 1)) * 600}
          y1="0"
          y2="145"
          stroke="#fff"
          strokeDasharray="4 4"
        />
      </svg>
      <div className="elevation-summary">
        <span>
          Subida <strong>{Math.round(profile.ascent)} m</strong>
        </span>
        <span>
          Descida <strong>{Math.round(profile.descent)} m</strong>
        </span>
        <span>
          Altitude{' '}
          <strong>
            {Math.round(profile.min!)}–{Math.round(profile.max!)} m
          </strong>
        </span>
      </div>
      <label>
        Ponto do perfil
        <input
          type="range"
          min="0"
          max={coordinates.length - 1}
          value={Math.min(selected, coordinates.length - 1)}
          onChange={(e) => {
            const index = Number(e.target.value);
            setSelected(index);
            onPoint?.(coordinates[index]!);
          }}
        />
      </label>
      <p>
        {(point.distance / 1000).toLocaleString('pt-BR', {
          maximumFractionDigits: 2,
        })}{' '}
        km ·{' '}
        {point.altitude === null
          ? 'Altitude ausente'
          : `${Math.round(point.altitude)} m`}{' '}
        · estimativa filtrada, sem precisão certificada.
      </p>
    </section>
  );
}
