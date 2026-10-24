import { reliableSpeed } from '@apex-ride/ride-core';
/** Retains extrema and discontinuities; display reduction never modifies storage. */
export function chartSeries(input, gapMs, limit = 600) {
  const valid = [];
  let previous = null,
    segment = 0;
  for (const p of input) {
    if (
      !Number.isFinite(p.timestamp) ||
      (previous && p.timestamp <= previous.timestamp)
    ) {
      segment++;
      continue;
    }
    if (
      !previous ||
      p.timestamp - previous.timestamp > gapMs ||
      p.segment !== previous.segment ||
      previous.value === null
    )
      segment++;
    previous = p;
    if (p.value === null || !Number.isFinite(p.value)) {
      segment++;
      continue;
    }
    valid.push({ timestamp: p.timestamp, value: p.value, segment });
  }
  if (valid.length <= limit) return valid;
  const selected = new Map();
  const size = Math.ceil(valid.length / Math.max(1, Math.floor(limit / 4)));
  for (let i = 0; i < valid.length; i += size) {
    const bucket = valid.slice(i, i + size);
    let min = bucket[0],
      max = min;
    for (const p of bucket) {
      if (p.value < min.value) min = p;
      if (p.value > max.value) max = p;
    }
    for (const p of [bucket[0], min, max, bucket.at(-1)])
      selected.set(p.timestamp, p);
  }
  return [...selected.values()].sort((a, b) => a.timestamp - b.timestamp);
}
export function gpsChart(points) {
  return chartSeries(
    points.map((p, i) => ({
      timestamp: p.timestamp,
      value: reliableSpeed(p, points[i - 1]),
      segment: p.segment,
    })),
    1500,
  );
}
export function assistedChart(samples, start, points) {
  const segments = points
    ? new Map(points.map((p) => [p.timestamp, p.segment]))
    : null;
  return chartSeries(
    samples.map((s) => ({
      timestamp: start + s.relativeMs,
      value:
        s.source === 'assisted' &&
        (!segments || segments.has(s.gpsTimestamp ?? -1))
          ? s.speedMps === null
            ? null
            : s.speedMps * 3.6
          : null,
      segment: segments?.get(s.gpsTimestamp ?? -1) ?? 0,
    })),
    500,
  );
}
export function motionChart(samples, start, kind) {
  return chartSeries(
    samples.map((s) => ({
      timestamp: start + s.relativeMs,
      value:
        s.quality === 'limited' && s.source === 'browser-linear'
          ? kind === 'force'
            ? s.longitudinal === null ||
              s.accelerationG === null ||
              s.brakingG === null
              ? null
              : s.accelerationG - s.brakingG
            : s.lean
          : null,
      segment: s.segment,
    })),
    1500,
  );
}
