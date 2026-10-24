import { RIDE_RULES } from './index.js';
/** Bounded presentation of actual samples; omitted sections never join their neighbours. */
export function trackPreview(points, limit = 1000) {
  const groups = [];
  let previous = null;
  for (const p of points) {
    if (
      !previous ||
      p.segment !== previous.segment ||
      p.timestamp - previous.timestamp >= RIDE_RULES.gapMs ||
      p.timestamp <= previous.timestamp
    )
      groups.push([]);
    groups.at(-1).push(p);
    previous = p;
  }
  const maxGroups = Math.max(1, Math.floor(limit / 2));
  const selected =
    groups.length > maxGroups
      ? Array.from(
          { length: maxGroups },
          (_, i) =>
            groups[
              Math.round((i * (groups.length - 1)) / Math.max(1, maxGroups - 1))
            ],
        )
      : groups;
  const total = selected.reduce((n, g) => n + g.length, 0),
    extra = Math.max(0, limit - selected.length * 2);
  const segments = selected.map((g) => {
    const budget = Math.min(
      g.length,
      limit,
      2 + Math.floor((extra * g.length) / Math.max(1, total)),
    );
    const samples =
      budget === 1
        ? [g[0]]
        : g.length <= budget
          ? g
          : Array.from(
              { length: budget },
              (_, i) => g[Math.round((i * (g.length - 1)) / (budget - 1))],
            );
    return { segment: g[0].segment, points: samples, originalPoints: g.length };
  });
  return {
    segments,
    originalPoints: points.length,
    originalSegments: groups.length,
    omittedSegments: groups.length - selected.length,
    reduced: segments.reduce((n, g) => n + g.points.length, 0) < points.length,
  };
}
