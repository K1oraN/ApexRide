import {
  alignActivity,
  routeReference,
  COMPARISON_RULES,
  type Range,
} from '@apex-ride/ride-core/comparison';
import type { ActiveInterval } from '@apex-ride/ride-core';
import type { Line } from '@apex-ride/ride-core/routes';
import { RULES, searchLine, planFor, type Prepared } from './geometry.js';

export const alignmentRules = {
  ...COMPARISON_RULES,
  accuracyMeters: RULES.accuracy,
  corridorMeters: RULES.corridor,
};
export interface Piece {
  geometry: Line;
  a: Range;
  b: Range;
  direction: 'same' | 'opposite';
  meters: number;
}
export interface Match {
  version: string;
  classification:
    'full' | 'partial' | 'opposite' | 'limited' | 'none' | 'inconclusive';
  direction: 'same' | 'opposite' | 'mixed' | 'unknown';
  sharedMeters: number;
  coverageA: number;
  coverageB: number;
  pieces: Piece[];
  issues: string[];
}
const length = (ranges: Range[]) => {
  let end = -Infinity,
    total = 0;
  for (const [a, b] of ranges.sort((x, y) => x[0] - y[0])) {
    total += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return total;
};
export function recognize(
  a: Prepared,
  b: Prepared,
  intervalsB: ActiveInterval[],
  startB: number,
): Match {
  const out: Match = {
    version: RULES.version,
    classification: 'none',
    direction: 'unknown',
    sharedMeters: 0,
    coverageA: 0,
    coverageB: 0,
    pieces: [],
    issues: [],
  };
  if (a.reason || b.reason)
    return {
      ...out,
      classification: 'inconclusive',
      issues: [a.reason, b.reason].filter(Boolean) as string[],
    };
  const deadline = performance.now() + 6000;
  const coverageA: Range[] = [],
    coverageB: Range[] = [];
  let baseA = 0;
  const bOffsets = new Map<number, number>();
  let baseB = 0;
  for (const s of b.segments) {
    let n = baseB;
    bOffsets.set(s[0]!.timestamp, n);
    for (let i = 1; i < s.length; i++) {
      n += lineDistance(s[i - 1]!, s[i]!);
      bOffsets.set(s[i]!.timestamp, n);
    }
    baseB = n;
  }
  for (const segment of a.segments) {
    const original = searchLine(segment),
      forward = routeReference(planFor(original), alignmentRules);
    for (const direction of ['same', 'opposite'] as const) {
      if (performance.now() > deadline)
        throw new Error('Tempo de reconhecimento excedido.');
      const geometry =
        direction === 'same'
          ? original
          : { ...original, coordinates: [...original.coordinates].reverse() };
      const reference = routeReference(planFor(geometry), alignmentRules);
      const alignment = alignActivity(
        reference,
        {
          plan: reference.plan,
          points: b.segments.flat(),
          intervals: intervalsB,
          startedAt: startB,
        },
        alignmentRules,
      );
      // A run must be continuous in BOTH activities. Short intersections never
      // accumulate into a match. Ambiguous branches are rejected by the engine.
      const runs = new Map<number, typeof alignment.edges>();
      for (const e of alignment.edges) {
        const run = runs.get(e.a.chain) ?? [];
        run.push(e);
        runs.set(e.a.chain, run);
      }
      for (const edges of runs.values()) {
        const first = edges[0]!,
          last = edges.at(-1)!;
        const lo = first.a.along,
          hi = last.b.along;
        if (hi - lo < RULES.minMeters || edges.length < RULES.minPoints - 1)
          continue;
        const offsets = edges
          .map((e) =>
            Math.min(...reference.candidates(e.b.p).map((c) => c.offset)),
          )
          .sort((x, y) => x - y);
        if (offsets[Math.floor(offsets.length / 2)]! > 3) {
          out.issues.push(
            'Afastamento persistente entre vias próximas; identidade da via inconclusiva.',
          );
          continue;
        }
        const bStart = bOffsets.get(first.a.p.timestamp)!,
          bEnd = bOffsets.get(last.b.p.timestamp)!;
        const aLo = baseA + (direction === 'same' ? lo : reference.total - hi),
          aHi = baseA + (direction === 'same' ? hi : reference.total - lo);
        // One-to-one passage: overlapping assignments to either track are
        // inconclusive, never counted twice at loops or repeated passes.
        if (
          coverageA.some(
            ([x, y]) => Math.min(y, aHi) - Math.max(x, aLo) > 10,
          ) ||
          coverageB.some(
            ([x, y]) => Math.min(y, bEnd) - Math.max(x, bStart) > 10,
          )
        )
          continue;
        coverageA.push([aLo, aHi]);
        coverageB.push([bStart, bEnd]);
        const findTime = (meters: number) => {
          let along = 0;
          for (let i = 1; i < segment.length; i++) {
            const d = lineDistance(segment[i - 1]!, segment[i]!);
            if (along + d >= meters)
              return (
                segment[i - 1]!.timestamp +
                ((segment[i]!.timestamp - segment[i - 1]!.timestamp) *
                  (meters - along)) /
                  d
              );
            along += d;
          }
          return segment.at(-1)!.timestamp;
        };
        out.pieces.push({
          geometry: reference.section([lo, hi]),
          a: [findTime(aLo - baseA), findTime(aHi - baseA)],
          b: [first.a.p.timestamp, last.b.p.timestamp],
          direction,
          meters: hi - lo,
        });
      }
    }
    baseA += forward.total;
  }
  out.coverageA = Math.min(1, length(coverageA) / a.meters);
  out.coverageB = Math.min(1, length(coverageB) / b.meters);
  out.sharedMeters = Math.min(length(coverageA), length(coverageB));
  if (!out.pieces.length)
    return out.issues.length ? { ...out, classification: 'inconclusive' } : out;
  out.direction = out.pieces.every((p) => p.direction === 'same')
    ? 'same'
    : out.pieces.every((p) => p.direction === 'opposite')
      ? 'opposite'
      : 'mixed';
  const limited = a.rejected + b.rejected > 0 || a.interrupted || b.interrupted;
  out.classification =
    out.direction === 'opposite'
      ? 'opposite'
      : out.direction === 'mixed' || limited
        ? 'limited'
        : out.coverageA >= RULES.fullCoverage &&
            out.coverageB >= RULES.fullCoverage
          ? 'full'
          : 'partial';
  if (limited)
    out.issues.push(
      'GPS rejeitado, pausas ou lacunas: somente trechos contínuos observados.',
    );
  if (out.direction !== 'same')
    out.issues.push(
      'Comparação orientada indisponível para sentidos contrários ou mistos.',
    );
  return out;
}
import { distanceMeters as lineDistance } from '@apex-ride/ride-core';

/** Complete-link groups; a missing edge is never evidence of equivalence. */
export function personalGroups(
  pairs: { a: string; b: string; classification: string }[],
) {
  const full = pairs.filter((p) => p.classification === 'full'),
    links = new Set(full.flatMap((p) => [p.a + ':' + p.b, p.b + ':' + p.a]));
  const groups: string[][] = [];
  for (const id of [...new Set(full.flatMap((p) => [p.a, p.b]))].sort()) {
    const group = groups.find((g) =>
      g.every((member) => links.has(id + ':' + member)),
    );
    if (group) group.push(id);
    else groups.push([id]);
  }
  return groups.filter((g) => g.length > 1);
}
