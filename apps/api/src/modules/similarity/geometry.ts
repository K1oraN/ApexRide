import {
  distanceMeters,
  validPoint,
  type RidePoint,
  type ActiveInterval,
} from '@apex-ride/ride-core';
import {
  lineLength,
  type Line,
  type RoutePlan,
} from '@apex-ride/ride-core/routes';

export const RULES = Object.freeze({
  version: 'similarity-1',
  accuracy: 10,
  corridor: 8,
  gapMs: 10000,
  minMeters: 300,
  minPoints: 6,
  maxPoints: 50000,
  maxSegments: 64,
  maxMeters: 300000,
  maxCandidates: 40,
  fullCoverage: 0.95,
});
export interface Prepared {
  segments: RidePoint[][];
  meters: number;
  rejected: number;
  interrupted: boolean;
  reason: string | null;
}
export function prepare(
  points: RidePoint[],
  intervals: ActiveInterval[],
): Prepared {
  const segments: RidePoint[][] = [];
  let previous: RidePoint | undefined,
    interval = -1,
    rejected = 0,
    interrupted = false;
  const active = [...intervals].sort((a, b) => a.start - b.start);
  if (
    active.some(
      (i, n) =>
        !Number.isFinite(i.start) ||
        !Number.isFinite(i.end) ||
        i.end < i.start ||
        (n > 0 && i.start < active[n - 1]!.end),
    )
  )
    return {
      segments,
      meters: 0,
      rejected: 0,
      interrupted: false,
      reason: 'Intervalos ativos inválidos.',
    };
  const intervalAt = (time: number) => {
    let lo = 0,
      hi = active.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (active[mid]!.start <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && time <= active[lo - 1]!.end ? lo - 1 : -1;
  };
  if (points.length > RULES.maxPoints)
    return {
      segments,
      meters: 0,
      rejected: 0,
      interrupted: false,
      reason: 'Trajeto excede 50.000 pontos.',
    };
  // Stable time ordering retains capture order as the tie breaker. Never sorts
  // across a rejected point into an invented continuous segment.
  const ordered = points
    .map((p, order) => ({ p, order }))
    .sort((a, b) => a.p.timestamp - b.p.timestamp || a.order - b.order);
  const reordered = ordered.some((p, i) => p.order !== i);
  for (const { p } of ordered) {
    const nextInterval = intervalAt(p.timestamp);
    if (
      !validPoint(p) ||
      Math.abs(p.latitude) > 85 ||
      p.accuracy > RULES.accuracy ||
      nextInterval < 0
    ) {
      previous = undefined;
      rejected++;
      interrupted = true;
      continue;
    }
    if (previous && p.timestamp === previous.timestamp) {
      if (
        p.latitude === previous.latitude &&
        p.longitude === previous.longitude
      )
        continue;
      previous = undefined;
      rejected++;
      interrupted = true;
      continue;
    }
    const distance = previous ? distanceMeters(previous, p) : 0;
    const jump =
      previous &&
      distance > ((p.timestamp - previous.timestamp) / 1000) * 100 + 10;
    if (jump) {
      previous = undefined;
      rejected++;
      interrupted = true;
      continue;
    }
    if (
      !previous ||
      p.segment !== previous.segment ||
      nextInterval !== interval ||
      p.timestamp - previous.timestamp >= RULES.gapMs ||
      reordered
    ) {
      segments.push([]);
      if (previous) interrupted = true;
    }
    segments.at(-1)!.push({ ...p, segment: segments.length - 1 });
    previous = p;
    interval = nextInterval;
  }
  const usable = segments.filter((s) => s.length >= 2);
  const meters = usable.reduce((n, s) => n + lineLength(line(s)), 0);
  const reason = reordered
    ? 'Ordem GPS inconsistente; continuidade inconclusiva.'
    : usable.length > RULES.maxSegments
      ? 'Excesso de segmentos GPS.'
      : points.length < RULES.minPoints
        ? 'Pontos GPS insuficientes.'
        : meters < RULES.minMeters
          ? 'Trajeto válido inferior a 300 m ou GPS impreciso.'
          : meters > RULES.maxMeters
            ? 'Trajeto válido superior a 300 km.'
            : null;
  return { segments: usable, meters, rejected, interrupted, reason };
}
export function line(points: RidePoint[]): Line {
  return {
    type: 'LineString',
    coordinates: points.map((p) => [p.longitude, p.latitude]),
  };
}
export function planFor(geometry: Line): RoutePlan {
  return {
    id: 'derived',
    version: 1,
    name: 'Trecho GPS comum',
    kind: 'route',
    geometry,
    distanceMeters: lineLength(geometry),
    direction: 1,
    startLine: null,
    verification: 'suggested',
  };
}

/** Bounded Douglas–Peucker, <=0.5 m planar deviation. Not used for metrics. */
export function searchLine(points: RidePoint[]): Line {
  const coordinates = line(points).coordinates,
    keep = new Set([0, coordinates.length - 1]);
  const scale = 111195 * Math.cos((points[0]!.latitude * Math.PI) / 180);
  const stack: [number, number][] = [[0, coordinates.length - 1]];
  let work = 0;
  while (stack.length) {
    const [a, b] = stack.pop()!,
      p = coordinates[a]!,
      q = coordinates[b]!;
    const dx = (q[0] - p[0]) * scale,
      dy = (q[1] - p[1]) * 111195,
      den = dx * dx + dy * dy;
    let far = 0.5,
      index = -1;
    for (let i = a + 1; i < b; i++) {
      if (++work > 5000000)
        throw new Error('Geometria excede orçamento de simplificação.');
      const x = (coordinates[i]![0] - p[0]) * scale,
        y = (coordinates[i]![1] - p[1]) * 111195;
      const t = den ? Math.max(0, Math.min(1, (x * dx + y * dy) / den)) : 0,
        d = Math.hypot(x - t * dx, y - t * dy);
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      stack.push([a, index], [index, b]);
    }
  }
  if (keep.size > 10000)
    throw new Error('Geometria complexa demais para referência.');
  return {
    type: 'LineString',
    coordinates: [...keep].sort((a, b) => a - b).map((i) => coordinates[i]!),
  };
}
