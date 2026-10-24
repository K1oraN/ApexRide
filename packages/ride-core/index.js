// Regras compartilhadas pelo navegador e servidor. Unidades: metros, ms, m/s.
export const RIDE_RULES = Object.freeze({
  maxPoints: 50_000,
  maxIntervals: 2_000,
  maxDurationMs: 48 * 60 * 60 * 1_000,
  gapMs: 15_000,
  accuracyMeters: 50,
  maxSpeedMps: 100,
  maxAccelerationMps2: 15,
  minMovementMeters: 3,
});

export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function validPoint(p) {
  return (
    p !== null &&
    typeof p === 'object' &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180 &&
    Number.isFinite(p.timestamp) &&
    p.timestamp > 0 &&
    Number.isFinite(p.accuracy) &&
    p.accuracy >= 0 &&
    p.accuracy <= RIDE_RULES.accuracyMeters &&
    Number.isInteger(p.segment) &&
    p.segment >= 0 &&
    (p.speed === null || (Number.isFinite(p.speed) && p.speed >= 0)) &&
    (p.heading === null ||
      (Number.isFinite(p.heading) && p.heading >= 0 && p.heading < 360)) &&
    (p.altitude === null || Number.isFinite(p.altitude))
  );
}
export function acceptablePoint(p, previous) {
  if (!validPoint(p)) return false;
  if (!previous) return true;
  const dt = p.timestamp - previous.timestamp;
  if (dt <= 0 || p.segment < previous.segment) return false;
  // Mesmo uma quebra de segmento não legitima um teletransporte instantâneo.
  return (
    distanceMeters(previous, p) - previous.accuracy - p.accuracy <=
    (dt / 1_000) * RIDE_RULES.maxSpeedMps
  );
}
export function reliableSpeed(p, previous) {
  if (p.speed === null || p.speed > RIDE_RULES.maxSpeedMps) return null;
  if (
    previous?.speed !== null &&
    previous?.speed !== undefined &&
    p.segment === previous.segment &&
    p.timestamp - previous.timestamp < RIDE_RULES.gapMs &&
    Math.abs(p.speed - previous.speed) >
      (RIDE_RULES.maxAccelerationMps2 * (p.timestamp - previous.timestamp)) /
        1_000
  )
    return null;
  return p.speed * 3.6;
}
/** Historical distance rule, exposed as prefixes for time-based visualizations. */
export function cumulativeDistances(points) {
  let distance = 0,
    anchor;
  return points.map((p, n) => {
    const previous = points[n - 1];
    if (
      !anchor ||
      !previous ||
      p.segment !== previous.segment ||
      p.timestamp - previous.timestamp >= RIDE_RULES.gapMs
    ) {
      anchor = p;
      return distance;
    }
    const meters = distanceMeters(anchor, p);
    const threshold = Math.max(
      RIDE_RULES.minMovementMeters,
      Math.min(5, (anchor.accuracy + p.accuracy) / 4),
    );
    if (meters >= threshold) {
      distance += meters;
      anchor = p;
    }
    return distance;
  });
}
export function calculateMetrics(start, end, intervals, points) {
  const elapsedMs = Math.max(0, end - start);
  const activeMs = Math.min(
    elapsedMs,
    intervals.reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0),
  );
  const distance = cumulativeDistances(points).at(-1) ?? 0;
  let maximumKmh = null;
  for (let n = 0; n < points.length; n++) {
    const p = points[n],
      previous = points[n - 1];
    const speed = reliableSpeed(p, previous);
    if (speed !== null) maximumKmh = Math.max(maximumKmh ?? 0, speed);
  }
  return {
    elapsedMs,
    activeMs,
    pausedMs: elapsedMs - activeMs,
    distanceMeters: distance,
    averageKmh:
      activeMs > 0 && points.length >= 2 ? (distance / activeMs) * 3_600 : null,
    maximumKmh,
  };
}
