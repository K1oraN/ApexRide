import { distanceMeters, validPoint, reliableSpeed } from './index.js';
import { validLine } from './routes.js';

export const COMPARISON_RULES = Object.freeze({
  version: 'comparison-1',
  maxActivities: 4,
  minParticipants: 10,
  accuracyMeters: 20,
  corridorMeters: 35,
  gapMs: 10000,
  gridMeters: 25,
  maxSamples: 800,
  maxIndexEntries: 300000,
  maxProcessingMs: 2000,
});
export const BIKE_CATEGORIES = [
  'Naked',
  'Esportiva',
  'Trail/Adventure',
  'Touring',
  'Custom',
  'Scooter',
  'Outras',
  'Não classificada',
];
export const CC_BANDS = [
  [0, 250],
  [251, 500],
  [501, 750],
  [751, 1000],
  [1001, 100000],
];
export const COMPARISON_STATES = {
  full: 'Comparáveis integralmente',
  partial: 'Comparáveis parcialmente',
  limited: 'Comparabilidade limitada',
  none: 'Não comparáveis',
};
export function compatiblePlans(a, b) {
  return (
    !!a &&
    !!b &&
    a.id === b.id &&
    a.kind === b.kind &&
    a.direction === b.direction &&
    JSON.stringify(a.geometry) === JSON.stringify(b.geometry) &&
    JSON.stringify(a.startLine) === JSON.stringify(b.startLine)
  );
}
const asPoint = (p) => ({ longitude: p[0], latitude: p[1] });
const merge = (ranges) => {
  const out = [];
  for (const [a, b] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && a <= last[1] + 0.01) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
};
export function intersectRanges(lists) {
  if (!lists.length) return [];
  return lists.slice(1).reduce((out, ranges) => {
    const result = [];
    let i = 0,
      j = 0;
    while (i < out.length && j < ranges.length) {
      const a = Math.max(out[i][0], ranges[j][0]),
        b = Math.min(out[i][1], ranges[j][1]);
      if (b > a) result.push([a, b]);
      if (out[i][1] < ranges[j][1]) i++;
      else j++;
    }
    return result;
  }, lists[0]);
}

/** Spatial index plus chronological continuity. Ambiguous overlaps are rejected,
 * never assigned by proximity alone. Original GPS order is intentionally retained. */
export function routeReference(plan, rules = COMPARISON_RULES) {
  if (!validLine(plan.geometry))
    throw new Error('Geometria de referência inválida.');
  const coordinates = plan.geometry.coordinates,
    scale = 111195 * Math.cos((coordinates[0][1] * Math.PI) / 180),
    cell = 100;
  const origin = coordinates[0],
    xy = (p) => [(p[0] - origin[0]) * scale, (p[1] - origin[1]) * 111195];
  const cells = new Map(),
    segments = [];
  let total = 0,
    entries = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = xy(coordinates[i - 1]),
      b = xy(coordinates[i]),
      len = distanceMeters(
        asPoint(coordinates[i - 1]),
        asPoint(coordinates[i]),
      );
    if (len === 0) continue;
    const s = { a, b, len, along: total, index: i - 1 };
    total += len;
    segments.push(s);
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 50);
    if (steps > rules.maxIndexEntries)
      throw new Error('Rota excede o orçamento de alinhamento.');
    for (let j = 0; j <= steps; j++) {
      const x = Math.floor((a[0] + ((b[0] - a[0]) * j) / steps) / cell),
        y = Math.floor((a[1] + ((b[1] - a[1]) * j) / steps) / cell);
      const key = x + ':' + y;
      if (!cells.has(key)) cells.set(key, new Set());
      const bucket = cells.get(key);
      if (!bucket.has(s)) {
        bucket.add(s);
        if (++entries > rules.maxIndexEntries)
          throw new Error('Rota excede o orçamento de alinhamento.');
      }
    }
  }
  if (total < 1) throw new Error('Rota sem extensão válida.');
  return {
    plan,
    total,
    section(range) {
      const coords = [];
      for (const s of segments) {
        const lo = Math.max(range[0], s.along),
          hi = Math.min(range[1], s.along + s.len);
        if (hi <= lo) continue;
        const a = coordinates[s.index],
          b = coordinates[s.index + 1];
        for (const m of [lo, hi]) {
          const t = (m - s.along) / s.len,
            p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (
            !coords.length ||
            JSON.stringify(coords.at(-1)) !== JSON.stringify(p)
          )
            coords.push(p);
        }
      }
      return { type: 'LineString', coordinates: coords };
    },
    candidates(p) {
      const q = xy([p.longitude, p.latitude]),
        x = Math.floor(q[0] / cell),
        y = Math.floor(q[1] / cell),
        found = new Set();
      for (let i = x - 1; i <= x + 1; i++)
        for (let j = y - 1; j <= y + 1; j++)
          for (const s of cells.get(i + ':' + j) ?? []) found.add(s);
      if (found.size > 1000) return []; // pathological overlapping geometries fail closed
      return [...found]
        .map((s) => {
          const dx = s.b[0] - s.a[0],
            dy = s.b[1] - s.a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((q[0] - s.a[0]) * dx + (q[1] - s.a[1]) * dy) /
                  (dx * dx + dy * dy),
              ),
            );
          return {
            along: s.along + t * s.len,
            offset: Math.hypot(q[0] - s.a[0] - t * dx, q[1] - s.a[1] - t * dy),
            dx,
            dy,
            index: s.index,
          };
        })
        .filter((c) => c.offset <= rules.corridorMeters);
    },
  };
}

export function alignActivity(reference, input, rules = COMPARISON_RULES) {
  const deadline = Date.now() + rules.maxProcessingMs;
  const issues = [],
    edges = [],
    observations = [];
  if (!compatiblePlans(reference.plan, input.plan))
    return {
      state: 'none',
      issues: ['Rota, versão de geometria, sentido ou largada incompatível.'],
      coverage: 0,
      ranges: [],
      edges: [],
      samples: [],
      observations: [],
    };
  let previous = null,
    lastSeen = null,
    chain = 0,
    reverse = 0,
    rejected = 0,
    gaps = 0;
  const intervals = input.intervals ?? [];
  for (const [index, p] of input.points.entries()) {
    if (index % 128 === 0 && Date.now() > deadline)
      throw new Error('Alinhamento excedeu o tempo de processamento.');
    const seen = lastSeen;
    if (seen && p.timestamp <= seen.timestamp) {
      previous = null;
      chain++;
      rejected++;
      continue;
    }
    lastSeen = p;
    if (!validPoint(p) || p.accuracy > rules.accuracyMeters) {
      previous = null;
      chain++;
      rejected++;
      continue;
    }
    const interval = intervals.findIndex(
      (i) => p.timestamp >= i.start && p.timestamp <= i.end,
    );
    if (interval < 0) {
      previous = null;
      chain++;
      rejected++;
      continue;
    }
    const continuous =
      previous &&
      p.segment === previous.p.segment &&
      p.timestamp - previous.p.timestamp < rules.gapMs &&
      interval === previous.interval;
    if (previous && !continuous) {
      previous = null;
      chain++;
      gaps++;
    }
    const movement = seen ? distanceMeters(seen, p) : 0;
    let candidates = reference.candidates(p);
    if (previous)
      candidates = candidates.flatMap((c) => {
        let along = c.along;
        if (reference.plan.kind === 'circuit')
          along +=
            Math.round((previous.along - along) / reference.total) *
            reference.total;
        const delta = along - previous.along;
        if (
          Math.abs(delta) >
          Math.min(
            (100 * (p.timestamp - previous.p.timestamp)) / 1000 + 20,
            distanceMeters(previous.p, p) * 1.8 + 30,
          )
        )
          return [];
        return [
          {
            ...c,
            along,
            score:
              c.offset + Math.abs(delta - distanceMeters(previous.p, p)) * 0.25,
          },
        ];
      });
    else
      candidates = candidates.map((c) => {
        let penalty = 0;
        if (
          seen &&
          p.segment === seen.segment &&
          p.timestamp - seen.timestamp < rules.gapMs &&
          movement > 8
        ) {
          const dx =
              (p.longitude - seen.longitude) *
              Math.cos((p.latitude * Math.PI) / 180),
            dy = p.latitude - seen.latitude;
          const cos =
            (dx * c.dx + dy * c.dy) /
            (Math.hypot(dx, dy) * Math.hypot(c.dx, c.dy));
          penalty = (1 - cos) * 40;
        }
        return { ...c, score: c.offset + penalty };
      });
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (
      !best ||
      candidates.some(
        (c) => Math.abs(c.along - best.along) > 60 && c.score < best.score + 8,
      )
    ) {
      previous = null;
      chain++;
      rejected++;
      continue;
    }
    if (previous && best.along < previous.along - 5) {
      reverse++;
      previous = null;
      chain++;
      continue;
    }
    const observation = {
      p,
      along: best.along,
      chain,
      interval,
      gps: reliableSpeed(p, seen ?? undefined),
    };
    if (previous && best.along >= previous.along)
      edges.push({ a: previous, b: observation });
    observations.push(observation);
    previous = observation;
  }
  const ranges = merge(
    edges.flatMap((e) => {
      const a =
          ((e.a.along % reference.total) + reference.total) % reference.total,
        len = e.b.along - e.a.along;
      return a + len > reference.total
        ? [
            [a, reference.total],
            [0, a + len - reference.total],
          ]
        : [[a, a + len]];
    }),
  );
  const coverage = ranges.reduce((s, [a, b]) => s + b - a, 0) / reference.total;
  const endpointTolerance = Math.min(50, Math.max(10, reference.total * 0.005));
  const endpoints =
    (ranges[0]?.[0] ?? Infinity) <= endpointTolerance &&
    (ranges.at(-1)?.[1] ?? 0) >= reference.total - endpointTolerance;
  if (reverse)
    issues.push(
      'Sentido inverso ou retorno detectado; trechos afetados excluídos.',
    );
  if (rejected)
    issues.push(
      `${rejected} pontos rejeitados, ambíguos, imprecisos ou fora da rota.`,
    );
  if (gaps) issues.push(`${gaps} interrupções por pausa ou lacuna GPS.`);
  if (coverage < 0.95 || !endpoints)
    issues.push(
      'Percurso incompleto: comparar somente trechos efetivamente observados.',
    );
  const chainStarts = new Map();
  for (const e of edges)
    if (!chainStarts.has(e.a.chain))
      chainStarts.set(e.a.chain, e.a.p.timestamp);
  const step = Math.max(rules.gridMeters, reference.total / rules.maxSamples),
    samples = [];
  for (const e of edges) {
    if (e.b.along - e.a.along < 0.1) continue;
    const lap = Math.floor(e.a.along / reference.total),
      from = e.a.along - lap * reference.total,
      to = e.b.along - lap * reference.total;
    for (
      let x = Math.ceil(from / step) * step;
      x <= Math.min(to, reference.total);
      x += step
    ) {
      const t = (x - from) / (to - from),
        timestamp = e.a.p.timestamp + t * (e.b.p.timestamp - e.a.p.timestamp);
      const speed =
        e.a.gps !== null && e.b.gps !== null
          ? e.a.gps + t * (e.b.gps - e.a.gps)
          : null;
      samples.push({
        meters: x,
        elapsedMs: timestamp - input.startedAt,
        segmentMs: timestamp - chainStarts.get(e.a.chain),
        gps: speed,
        chain: e.a.chain,
        lap,
      });
      if (samples.length > rules.maxSamples * 20) break;
    }
    if (samples.length > rules.maxSamples * 20) {
      issues.push('Limite de passagens para exibição atingido.');
      break;
    }
  }
  // One observed passage per position. Lap endpoint supplies one lap explicitly.
  const unique = new Map();
  for (const s of samples) if (!unique.has(s.meters)) unique.set(s.meters, s);
  const state =
    edges.length < 2 || coverage < 0.01
      ? 'none'
      : reverse > 2 && coverage < 0.5
        ? 'none'
        : rejected || reverse || gaps
          ? 'limited'
          : coverage >= 0.95 && endpoints
            ? 'full'
            : 'partial';
  return {
    state,
    issues,
    coverage,
    ranges,
    edges,
    samples: [...unique.values()].sort((a, b) => a.meters - b.meters),
    observations,
  };
}
export function timeOnRanges(alignment, ranges, total) {
  let ms = 0;
  // First passage only, matching the position series; do not count repeated laps.
  let remaining = ranges.map((r) => [...r]);
  for (const e of alignment.edges) {
    const base = Math.floor(e.a.along / total) * total,
      a = e.a.along - base,
      b = e.b.along - base;
    if (b - a < 0.1) {
      if (remaining.some(([lo, hi]) => a >= lo && a <= hi))
        ms += e.b.p.timestamp - e.a.p.timestamp;
      continue;
    }
    const next = [];
    for (const [lo, hi] of remaining) {
      const start = Math.max(a, lo),
        end = Math.min(b, hi);
      if (end > start) {
        ms += ((end - start) / (b - a)) * (e.b.p.timestamp - e.a.p.timestamp);
        if (lo < start) next.push([lo, start]);
        if (end < hi) next.push([end, hi]);
      } else next.push([lo, hi]);
    }
    remaining = next;
  }
  return ms;
}
