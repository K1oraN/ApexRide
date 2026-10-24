import type { TrackPreview } from '@apex-ride/ride-core/history';
import { useEffect, useMemo, useState } from 'react';
import { ACTIVITY_COLORS } from '../comparison/colors';
import { Select } from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { historyService } from '../history/service';
import type { SimilarMatch } from './service';
export function MatchMap({ id, match }: { id: string; match: SimilarMatch }) {
  const [piece, setPiece] = useState(0);
  const [tracks, setTracks] = useState<TrackPreview[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void Promise.all([historyService.track(id), historyService.track(match.id)])
      .then((data) => {
        if (live) setTracks(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, match.id]);
  const shapes = useMemo(
    () => [
      ...match.pieces.map((p, i) => ({
        id: 'common:' + i,
        geometry: p.geometry,
        color: '#a5b4a5',
        width: 9,
      })),
      ...tracks.flatMap((t, i) =>
        t.segments
          .flatMap((s) => {
            const parts: (typeof s.points)[] = [];
            for (const p of s.points) {
              const previous = parts.at(-1)?.at(-1);
              if (
                !previous ||
                p.timestamp - previous.timestamp >= 10000 ||
                p.timestamp <= previous.timestamp ||
                p.accuracy > 10 ||
                previous.accuracy > 10
              )
                parts.push([]);
              if (p.accuracy <= 10) parts.at(-1)!.push(p);
            }
            return parts.map((points) => ({ ...s, points }));
          })
          .filter((s) => s.points.length >= 2)
          .map((s, j) => ({
            id: `${i}:${j}`,
            geometry: {
              type: 'LineString' as const,
              coordinates: s.points.map(
                (p) => [p.longitude, p.latitude] as [number, number],
              ),
            },
            color: ACTIVITY_COLORS[i]!,
            width: 3,
          })),
      ),
    ],
    [match, tracks],
  );
  return (
    <section className="panel history-panel">
      <h2>Mapa da correspondência</h2>
      {match.pieces.length > 1 && (
        <label className="account-field">
          Trecho comum
          <Select
            value={piece}
            onChange={(e) => setPiece(Number(e.target.value))}
          >
            {match.pieces.map((p, i) => (
              <option value={i} key={i}>
                Trecho {i + 1} · {(p.meters / 1000).toFixed(2)} km
              </option>
            ))}
          </Select>
        </label>
      )}
      {error ? (
        <p role="alert">{error}</p>
      ) : tracks.length ? (
        <RouteMap
          routes={shapes}
          selected={match.pieces.length ? 'common:' + piece : shapes[0]?.id}
          waypoints={
            match.pieces[piece]
              ? [
                  match.pieces[piece]!.geometry.coordinates[0]!,
                  match.pieces[piece]!.geometry.coordinates.at(-1)!,
                ]
              : []
          }
          description="Trajetos próprios e trechos comuns observados."
          caption="A1 e A2: GPS original · cinza claro: trecho comum"
        />
      ) : (
        <p role="status">Carregando trajetos…</p>
      )}
      <p>
        As duas atividades são próprias. Lacunas permanecem separadas. Início e
        fim aproximados são as extremidades dos trechos em cinza claro. Use
        centralizar e zoom para inspecionar.
      </p>
    </section>
  );
}
