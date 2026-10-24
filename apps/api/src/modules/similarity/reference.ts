import { routeReference, type Range } from '@apex-ride/ride-core/comparison';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import type { Piece } from './engine.js';
import { alignmentRules } from './engine.js';
import { planFor } from './geometry.js';

export interface DerivedReference {
  version: string;
  classification: string;
  plan: RoutePlan;
  pieces: Piece[];
  windows: Record<string, Range[]>;
}
/** Pieces share a distance axis, never an invented connecting GPS line. */
export function derivedReference(
  input: DerivedReference,
): ReturnType<typeof routeReference> {
  let total = 0;
  const parts = input.pieces.map((p) => {
    const ref = routeReference(planFor(p.geometry), alignmentRules),
      offset = total;
    total += ref.total;
    return { ref, offset };
  });
  return {
    plan: input.plan,
    total,
    candidates(p) {
      return parts.flatMap(({ ref, offset }, i) =>
        ref.candidates(p).map((c) => ({
          ...c,
          along: c.along + offset,
          index: i * 100000 + c.index,
        })),
      );
    },
    section(range) {
      const part = parts.find(
        (p) =>
          range[0] >= p.offset - 0.01 &&
          range[1] <= p.offset + p.ref.total + 0.01,
      );
      if (!part) throw new Error('Trecho cruza interrupção geográfica.');
      return part.ref.section([range[0] - part.offset, range[1] - part.offset]);
    },
  };
}
export function splitRanges(ranges: Range[], input: DerivedReference): Range[] {
  let offset = 0;
  return input.pieces.flatMap((p) => {
    const end = offset + planFor(p.geometry).distanceMeters;
    const result = ranges.flatMap(([a, b]) =>
      Math.min(b, end) > Math.max(a, offset)
        ? [[Math.max(a, offset), Math.min(b, end)] as Range]
        : [],
    );
    offset = end;
    return result;
  });
}
