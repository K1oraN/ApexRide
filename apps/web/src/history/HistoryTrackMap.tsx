import type { TrackPreview } from '@apex-ride/ride-core/history';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import { useMemo, useState } from 'react';
import { Checkbox } from '../components/design-system';
import { RideMap } from '../components/maps/RideMap';
import type { GpsSnapshot } from '../services/gps/preview';
export function HistoryTrackMap({
  track,
  plan,
}: {
  track: TrackPreview;
  plan: RoutePlan | null;
}) {
  const [planned, setPlanned] = useState(true);
  const gps = useMemo<GpsSnapshot>(() => {
    const segments = track.segments.map((g) =>
      g.points.map((p) => ({ ...p, altitudeAccuracy: null })),
    );
    return {
      overview: true,
      active: false,
      status: 'idle',
      message: 'Percurso histórico',
      reading: segments.at(-1)?.at(-1) ?? null,
      speedKmh: null,
      segments,
    };
  }, [track]);
  return (
    <section className="panel history-panel" aria-label="Trajeto salvo">
      <h2>Mapa do trajeto</h2>
      {plan && (
        <label>
          <Checkbox
            checked={planned}
            onChange={(e) => setPlanned(e.target.checked)}
          />
          Mostrar rota planejada · âmbar tracejado
        </label>
      )}
      {track.originalPoints ? (
        <RideMap gps={gps} plan={planned ? plan : null} />
      ) : (
        <p>Trajeto indisponível: nenhum ponto salvo.</p>
      )}
      <p>
        Vermelho: GPS registrado. {track.originalSegments} segmento(s) ·{' '}
        {track.originalPoints} pontos originais. Pausas e falhas não são
        conectadas.
      </p>
      {track.reduced && (
        <p>
          Prévia reduzida para exibição; os pontos originais foram preservados.
          {track.omittedSegments
            ? ` ${track.omittedSegments} segmento(s) omitido(s) da prévia.`
            : ''}
        </p>
      )}
      <details>
        <summary>Segmentos disponíveis</summary>
        <ol>
          {track.segments.map((g, i) => (
            <li key={i}>
              Segmento {i + 1}: {g.originalPoints} pontos ·{' '}
              {new Date(g.points[0]!.timestamp).toLocaleTimeString('pt-BR')}–
              {new Date(g.points.at(-1)!.timestamp).toLocaleTimeString('pt-BR')}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
