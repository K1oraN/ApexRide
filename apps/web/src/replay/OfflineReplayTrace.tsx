import { useMemo, useSyncExternalStore } from 'react';
import type { ReplayEngine } from './engine';
import { floorIndex, type ReplayTimeline } from './timeline';
/** Projected local trace without third-party tiles. Static paths are prepared once. */
export function OfflineReplayTrace({
  timeline,
  engine,
}: {
  timeline: ReplayTimeline;
  engine: ReplayEngine;
}) {
  const { time } = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const prepared = useMemo(() => {
    const ps = timeline.gps.map((s) => s.value),
      west = Math.min(...ps.map((p) => p.longitude)),
      south = Math.min(...ps.map((p) => p.latitude));
    const cosine = Math.cos((south * Math.PI) / 180),
      span = Math.max(
        (Math.max(...ps.map((p) => p.longitude)) - west) * cosine,
        Math.max(...ps.map((p) => p.latitude)) - south,
        0.0001,
      );
    const project = (p: { longitude: number; latitude: number }) => [
      20 + (((p.longitude - west) * cosine) / span) * 260,
      160 - ((p.latitude - south) / span) * 140,
    ];
    return {
      project,
      groups: timeline.groups.map((g) => {
        let length = 0;
        const samples = g.map((s, i) => {
          const xy = project(s.value),
            prev = i ? project(g[i - 1]!.value) : xy;
          length += Math.hypot(xy[0]! - prev[0]!, xy[1]! - prev[1]!);
          return { time: s.time, length };
        });
        return {
          path: g
            .map((s, i) => `${i ? 'L' : 'M'}${project(s.value).join(',')}`)
            .join(' '),
          samples,
          length,
        };
      }),
    };
  }, [timeline]);
  const position = timeline.frame(time).position,
    xy = position ? prepared.project(position) : null;
  return (
    <svg
      className="offline-trace"
      viewBox="0 0 300 180"
      role="img"
      aria-label="Replay local sem base cartográfica"
    >
      {prepared.groups.map((g, i) => {
        const index = floorIndex(g.samples, time),
          a = g.samples[index],
          b = g.samples[index + 1];
        const length = a
          ? b
            ? a.length +
              ((b.length - a.length) * (time - a.time)) / (b.time - a.time)
            : a.length
          : 0;
        return (
          <g key={i}>
            <path d={g.path} fill="none" stroke="#687079" strokeWidth="3" />
            <path
              d={g.path}
              fill="none"
              stroke="#ff202b"
              strokeWidth="3"
              strokeDasharray={`${length} ${g.length + 1}`}
            />
          </g>
        );
      })}
      {xy && (
        <circle
          cx={xy[0]}
          cy={xy[1]}
          r="5"
          fill="#fff"
          stroke="#ff202b"
          strokeWidth="2"
        />
      )}
      <text x="8" y="16" fill="#fff" fontSize="10">
        Sem base cartográfica · I início / F fim
      </text>
      {timeline.gps.length > 0 &&
        [timeline.gps[0]!, timeline.gps.at(-1)!].map((s, i) => {
          const p = prepared.project(s.value);
          return (
            <text key={i} x={p[0]} y={p[1]! - 8} fill="#fff" fontSize="12">
              {i ? 'F' : 'I'}
            </text>
          );
        })}
    </svg>
  );
}
