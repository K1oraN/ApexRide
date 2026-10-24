import { distanceMeters } from './index.js';
const point = (p) => ({ longitude: p[0], latitude: p[1] });
export const validCoordinate = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(Number.isFinite) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 85;
export const validLine = (l) =>
  !!l &&
  l.type === 'LineString' &&
  Array.isArray(l.coordinates) &&
  l.coordinates.length >= 2 &&
  l.coordinates.length <= 10000 &&
  l.coordinates.every(validCoordinate);
export const lineLength = (l) =>
  l.coordinates
    .slice(1)
    .reduce(
      (sum, p, i) => sum + distanceMeters(point(l.coordinates[i]), point(p)),
      0,
    );
// Local tangent plane per segment. Only projection uses metres; authoritative length is geodesic.
export function project(line, p, near = null) {
  let total = 0,
    best = { distance: Infinity, along: 0, total: 0 };
  for (let i = 1; i < line.coordinates.length; i++) {
    const a = line.coordinates[i - 1],
      b = line.coordinates[i];
    const len = distanceMeters(point(a), point(b));
    const scale = 111195 * Math.cos((p[1] * Math.PI) / 180);
    const ax = (a[0] - p[0]) * scale,
      ay = (a[1] - p[1]) * 111195;
    const dx = (b[0] - a[0]) * scale,
      dy = (b[1] - a[1]) * 111195;
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = Math.hypot(ax + t * dx, ay + t * dy),
      along = total + t * len;
    if (d < best.distance && (near === null || Math.abs(along - near) < 300))
      best = { distance: d, along, total: 0 };
    total += len;
  }
  return { ...best, total };
}

export class RouteTracker {
  constructor(plan) {
    this.plan = plan;
    this.total = lineLength(plan.geometry);
    this.previous = null;
    this.along = null;
    this.ranges = [];
    this.outSince = null;
    this.outCount = 0;
    this.result = {
      status: 'inaccurate',
      covered: 0,
      remaining: this.total,
      percent: 0,
      completed: false,
      determinate: false,
    };
  }
  snapshot() {
    return { ...this.result };
  }
  interrupt() {
    this.previous = null;
    this.along = null;
    this.outSince = null;
    this.outCount = 0;
    this.result = { ...this.result, status: 'inaccurate', determinate: false };
  }
  update(p) {
    if (this.previous && p.timestamp <= this.previous.timestamp)
      return this.snapshot();
    if (!Number.isFinite(p.accuracy) || p.accuracy > 20 || p.accuracy < 0) {
      this.interrupt();
      return this.snapshot();
    }
    const previous = this.previous;
    const continuous =
      previous &&
      p.segment === previous.segment &&
      p.timestamp - previous.timestamp < 10000;
    let projection = project(
      this.plan.geometry,
      [p.longitude, p.latitude],
      continuous ? this.along : null,
    );
    const cyclic = this.plan.kind === 'circuit';
    if (cyclic && continuous && this.along > this.total - 300) {
      const across = project(this.plan.geometry, [p.longitude, p.latitude]);
      if (across.along < 300 && across.distance < projection.distance)
        projection = across;
    }
    const tolerance = Math.max(25, 2 * p.accuracy);
    if (projection.distance > tolerance) {
      this.outSince ??= p.timestamp;
      this.outCount++;
      this.result = {
        ...this.result,
        status:
          this.outCount >= 3 && p.timestamp - this.outSince >= 5000
            ? 'off-route'
            : 'possible-deviation',
        determinate: true,
      };
      this.previous = null;
      this.along = null;
      return this.snapshot();
    }
    this.outSince = null;
    this.outCount = 0;
    const movement = previous ? distanceMeters(previous, p) : 0;
    const delta =
      this.along === null ? Infinity : Math.abs(projection.along - this.along);
    if (
      continuous &&
      this.along !== null &&
      (cyclic ? Math.min(delta, this.total - delta) : delta) <=
        movement + Math.max(20, p.accuracy + previous.accuracy) &&
      movement <= (100 * (p.timestamp - previous.timestamp)) / 1000
    ) {
      // A unique union of observed consecutive spans prevents repeated sections inflating completion.
      if (movement >= 2) {
        if (cyclic && delta > this.total / 2)
          this.ranges.push(
            [Math.max(this.along, projection.along), this.total],
            [0, Math.min(this.along, projection.along)],
          );
        else
          this.ranges.push([
            Math.min(this.along, projection.along),
            Math.max(this.along, projection.along),
          ]);
      }
      this.ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const range of this.ranges) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1] + 1)
          last[1] = Math.max(last[1], range[1]);
        else merged.push([...range]);
      }
      this.ranges = merged;
    }
    const covered = Math.min(
      this.total,
      this.ranges.reduce((n, r) => n + r[1] - r[0], 0),
    );
    this.result = {
      status: 'on-route',
      covered,
      remaining: Math.max(0, this.total - covered),
      percent: (100 * covered) / this.total,
      completed:
        this.result.completed ||
        (covered >= this.total * 0.95 &&
          projection.along >= this.total - Math.max(25, p.accuracy)),
      determinate: true,
    };
    this.previous = p;
    this.along = projection.along;
    return this.snapshot();
  }
}

function side(gate, p) {
  const a = gate.coordinates[0],
    b = gate.coordinates[1];
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}
export function gateCrossing(gate, a, b, direction) {
  const sa = side(gate, a),
    sb = side(gate, b);
  if (!(direction === 1 ? sa < 0 && sb >= 0 : sa > 0 && sb <= 0)) return null;
  const t = sa / (sa - sb);
  const x = a[0] + t * (b[0] - a[0]),
    y = a[1] + t * (b[1] - a[1]);
  const g = gate.coordinates[0],
    h = gate.coordinates[1],
    dx = h[0] - g[0],
    dy = h[1] - g[1];
  const u = ((x - g[0]) * dx + (y - g[1]) * dy) / (dx * dx + dy * dy);
  return u >= 0 && u <= 1 ? t : null;
}
export class LapDetector {
  constructor(plan, mode) {
    this.plan = plan;
    this.enabled =
      mode === 'pista' &&
      plan.kind === 'circuit' &&
      plan.verification === 'verified' &&
      validLine(plan.startLine) &&
      [1, -1].includes(plan.direction);
    this.previous = null;
    this.started = null;
    this.armed = true;
    this.tracker = null;
    this.maxAccuracy = 0;
    this.laps = [];
    this.inconclusive = 0;
  }
  interrupt() {
    if (this.started !== null) this.inconclusive++;
    this.started = null;
    this.previous = null;
    this.tracker = null;
    this.armed = true;
  }
  push(p) {
    if (!this.enabled) return;
    const previous = this.previous;
    if (!Number.isFinite(p.accuracy) || p.accuracy < 0 || p.accuracy > 15) {
      this.interrupt();
      return;
    }
    if (
      previous &&
      (p.timestamp <= previous.timestamp ||
        p.timestamp - previous.timestamp >= 5000 ||
        p.segment !== previous.segment ||
        distanceMeters(previous, p) >
          (100 * (p.timestamp - previous.timestamp)) / 1000)
    ) {
      this.interrupt();
      this.previous = p;
      return;
    }
    const projection = project(this.plan.geometry, [p.longitude, p.latitude]);
    if (projection.distance > Math.max(20, p.accuracy * 2)) {
      this.interrupt();
      this.previous = p;
      return;
    }
    this.tracker?.update(p);
    this.maxAccuracy = Math.max(this.maxAccuracy, p.accuracy);
    const gate = this.plan.startLine;
    if (
      !this.armed &&
      project(gate, [p.longitude, p.latitude]).distance >
        Math.max(20, p.accuracy * 2)
    )
      this.armed = true;
    const ratio = previous
      ? gateCrossing(
          gate,
          [previous.longitude, previous.latitude],
          [p.longitude, p.latitude],
          this.plan.direction,
        )
      : null;
    if (ratio !== null && this.armed) {
      const at = Math.round(
        previous.timestamp + ratio * (p.timestamp - previous.timestamp),
      );
      const elapsed = this.started === null ? 0 : at - this.started;
      const enough =
        elapsed >=
          Math.max(10000, (lineLength(this.plan.geometry) / 100) * 1000) &&
        elapsed <= 21600000;
      if (this.started !== null) {
        if (enough && (this.tracker?.snapshot().percent ?? 0) >= 90)
          this.laps.push({
            number: this.laps.length + 1,
            start: this.started,
            end: at,
            durationMs: at - this.started,
            status: 'estimated',
            accuracy: this.maxAccuracy,
          });
        else this.inconclusive++;
      }
      this.started = at;
      this.armed = false;
      this.maxAccuracy = p.accuracy;
      this.tracker = new RouteTracker(this.plan);
      this.tracker.update(p);
    }
    this.previous = p;
  }
}
export function detectLaps(plan, points, mode) {
  const detector = new LapDetector(plan, mode);
  for (const p of points) detector.push(p);
  return detector.laps;
}
