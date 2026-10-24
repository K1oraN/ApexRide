import { distanceMeters, RIDE_RULES } from './index.js';
import { RIDE_MODES } from './modes.js';

// Same stationary geometry/window as speed-1; GPS-only requires sustained fixes.
export const STOP_RULES = Object.freeze({
  speedMps: 0.15,
  windowMs: 2000,
  radiusMeters: 1,
  accuracyMeters: 10,
});
export const EVENT_RULES = Object.freeze({
  maxGapMs: 1500,
  crossingGapMs: 1250,
  accuracyMeters: 20,
  gpsAgeMs: 350,
  thresholdMps: 100 / 3.6,
  hysteresisMps: 2 / 3.6,
  maxAccelerationMps2: 15,
  maxSpeedMps: RIDE_RULES.maxSpeedMps,
  minSamples: 5,
  maxEventMs: 120000,
  maxEvents: 1000,
});

function crossing(a, b, speed) {
  return (
    a.timestamp +
    ((speed - a.speedMps) * (b.timestamp - a.timestamp)) /
      (b.speedMps - a.speedMps)
  );
}
function candidate(start, reading, gap) {
  return {
    start,
    last: reading.timestamp,
    samples: 2,
    maxGap: gap,
    sources: new Set([reading.source]),
    extreme: reading.speedMps,
    crossingEnd: null,
  };
}

/** Incremental, bounded state machines. Input times are measurement times, never display ticks. */
export class PerformanceDetector {
  events = [];
  truncated = false;
  states = { acceleration: 'waiting-stop', braking: 'waiting-speed' };
  previous = null;
  stopAnchor = null;
  stopConfirmed = false;
  acceleration = null;
  braking = null;
  brakingArmed = false;
  highWaterTimestamp = 0;
  constructor(sessionId, config = EVENT_RULES) {
    this.sessionId = sessionId;
    this.config = config;
  }
  emit(type, status, reason, end) {
    const c = this[type];
    if (!c) return;
    if (this.events.length >= this.config.maxEvents) this.truncated = true;
    else
      this.events.push({
        id: `${this.sessionId}/${type}/${Math.round(c.start)}`,
        type,
        startMs: Math.round(c.start),
        endMs: Math.max(Math.round(c.start), Math.round(end ?? c.last)),
        durationMs:
          status === 'estimated' ? Math.round(end) - Math.round(c.start) : null,
        status,
        reason,
        method: 'adjacent-linear-estimate',
        version: 'events-1',
        quality: {
          experimental: true,
          sampleCount: c.samples,
          maxGapMs: c.maxGap,
          resolutionMs: c.maxGap >= 500 ? 1000 : 100,
          sources: [...c.sources].sort(),
        },
        force: null,
      });
    this.states[type] = status;
    this[type] = null;
  }
  interrupt(reason, status = 'inconclusive') {
    this.emit('acceleration', status, reason);
    this.emit('braking', status, reason);
    this.previous = null;
    this.stopAnchor = null;
    this.stopConfirmed = false;
    this.brakingArmed = false;
  }
  push(r) {
    const cfg = this.config;
    if (
      !Number.isFinite(r.timestamp) ||
      r.timestamp <= 0 ||
      r.timestamp <= this.highWaterTimestamp
    ) {
      this.interrupt('timestamp-order', 'rejected');
      return;
    }
    this.highWaterTimestamp = r.timestamp;
    if (
      r.speedMps === null ||
      !Number.isFinite(r.speedMps) ||
      r.speedMps < 0 ||
      r.speedMps > cfg.maxSpeedMps ||
      !Number.isFinite(r.accuracy) ||
      r.accuracy > cfg.accuracyMeters ||
      r.accuracy < 0 ||
      !Number.isFinite(r.latitude) ||
      Math.abs(r.latitude) > 90 ||
      !Number.isFinite(r.longitude) ||
      Math.abs(r.longitude) > 180 ||
      !Number.isInteger(r.segment) ||
      r.segment < 0 ||
      !Number.isFinite(r.gpsTimestamp) ||
      !['gps-direct', 'gps-position', 'assisted'].includes(r.source) ||
      r.timestamp < r.gpsTimestamp ||
      r.timestamp - r.gpsTimestamp > cfg.gpsAgeMs ||
      (r.source === 'assisted' && !r.calibrated)
    ) {
      this.interrupt(
        'invalid-reading',
        r.speedMps !== null &&
          (!Number.isFinite(r.speedMps) ||
            r.speedMps < 0 ||
            r.speedMps > cfg.maxSpeedMps)
          ? 'rejected'
          : 'inconclusive',
      );
      return;
    }
    let p = this.previous;
    if (p) {
      const gap = r.timestamp - p.timestamp;
      if (
        gap > cfg.maxGapMs ||
        r.segment !== p.segment ||
        r.source !== p.source
      ) {
        this.interrupt(
          r.segment !== p.segment
            ? 'interruption'
            : r.source !== p.source
              ? 'source-change'
              : 'sample-gap',
        );
        p = null;
      } else if (
        Math.abs(r.speedMps - p.speedMps) / (gap / 1000) >
        cfg.maxAccelerationMps2
      ) {
        this.interrupt('impossible-acceleration', 'rejected');
        return;
      }
    }
    for (const type of ['acceleration', 'braking']) {
      const c = this[type];
      if (!c) continue;
      c.samples++;
      c.maxGap = Math.max(c.maxGap, r.timestamp - c.last);
      c.last = r.timestamp;
      c.sources.add(r.source);
      if (r.timestamp - c.start > cfg.maxEventMs)
        this.emit(type, 'inconclusive', 'event-timeout');
    }
    const nearStop =
      r.source === 'gps-direct' &&
      r.speedMps <= STOP_RULES.speedMps &&
      r.accuracy <= STOP_RULES.accuracyMeters;
    if (nearStop) {
      if (
        !this.stopAnchor ||
        distanceMeters(this.stopAnchor, r) > STOP_RULES.radiusMeters
      ) {
        this.stopAnchor = r;
        this.stopConfirmed = false;
      }
      this.stopConfirmed =
        r.timestamp - this.stopAnchor.timestamp >= STOP_RULES.windowMs;
      if (this.braking) this.states.braking = 'stop-detected';
      if (this.stopConfirmed) {
        if (this.braking) {
          this.states.braking = 'stop-confirmed';
          this.complete('braking', this.stopAnchor.timestamp);
        }
        if (this.acceleration)
          this.emit('acceleration', 'inconclusive', 'stopped-before-threshold');
        this.states.acceleration = 'waiting-stop';
      }
    } else {
      if (p && this.stopConfirmed && r.speedMps > STOP_RULES.speedMps) {
        this.acceleration = candidate(
          p.timestamp,
          r,
          r.timestamp - p.timestamp,
        );
        this.states.acceleration = 'moving';
      }
      this.stopConfirmed = false;
      this.stopAnchor = null;
    }
    if (p && this.acceleration) {
      this.states.acceleration = 'observing';
      this.acceleration.extreme = Math.max(
        this.acceleration.extreme,
        r.speedMps,
      );
      if (r.speedMps < this.acceleration.extreme - cfg.hysteresisMps)
        this.emit('acceleration', 'inconclusive', 'acceleration-reversed');
      else if (
        p.speedMps < cfg.thresholdMps &&
        r.speedMps >= cfg.thresholdMps
      ) {
        this.states.acceleration = 'threshold-reached';
        if (r.timestamp - p.timestamp > cfg.crossingGapMs)
          this.emit('acceleration', 'inconclusive', 'crossing-gap');
        else this.acceleration.crossingEnd = crossing(p, r, cfg.thresholdMps);
      }
      // A second independent fix confirms the threshold; a lone spike cannot complete.
      if (
        this.acceleration?.crossingEnd !== null &&
        this.acceleration?.crossingEnd !== undefined &&
        p.speedMps >= cfg.thresholdMps &&
        r.speedMps >= cfg.thresholdMps
      )
        this.complete('acceleration', this.acceleration.crossingEnd);
    }
    if (r.speedMps >= cfg.thresholdMps + cfg.hysteresisMps)
      this.brakingArmed = true;
    if (
      p &&
      this.brakingArmed &&
      !this.braking &&
      p.speedMps >= cfg.thresholdMps &&
      r.speedMps < cfg.thresholdMps
    ) {
      this.brakingArmed = false;
      this.braking = candidate(
        crossing(p, r, cfg.thresholdMps),
        r,
        r.timestamp - p.timestamp,
      );
      this.states.braking = 'decelerating';
      if (r.timestamp - p.timestamp > cfg.crossingGapMs)
        this.emit('braking', 'inconclusive', 'crossing-gap');
    } else if (this.braking && !nearStop) {
      this.states.braking = 'observing';
      this.braking.extreme = Math.min(this.braking.extreme, r.speedMps);
      if (p && r.speedMps > this.braking.extreme + cfg.hysteresisMps) {
        this.emit('braking', 'inconclusive', 'braking-reversed');
        this.brakingArmed = false;
      }
    }
    this.previous = r;
  }
  complete(type, end) {
    const c = this[type];
    if (!c) return;
    if (c.samples < this.config.minSamples || end <= c.start)
      this.emit(type, 'inconclusive', 'insufficient-samples', end);
    else this.emit(type, 'estimated', null, end);
  }
  finish() {
    this.interrupt('session-ended');
    const valid = this.events.filter((e) => e.status === 'estimated');
    const results = (type) =>
      valid.filter((e) => e.type === type).map((e) => e.durationMs);
    const a = results('acceleration'),
      b = results('braking');
    return {
      version: 'events-1',
      interruptions: [],
      events: this.events.map((e) => ({ ...e })),
      truncated: this.truncated,
      stats: {
        accelerationCount: a.length,
        brakingCount: b.length,
        bestAccelerationMs: a.length ? Math.min(...a) : null,
        bestBrakingMs: b.length ? Math.min(...b) : null,
      },
      lapContext: { circuitId: null, startFinishLineId: null, laps: [] },
    };
  }
}

export function eventReading(p, previous) {
  // Position-derived values retain provenance, but cannot establish stationary state.
  const dt = previous ? p.timestamp - previous.timestamp : 0;
  return {
    ...p,
    gpsTimestamp: p.timestamp,
    calibrated: false,
    source: p.speed === null ? 'gps-position' : 'gps-direct',
    speedMps:
      p.speed ??
      (previous &&
      p.segment === previous.segment &&
      dt > 0 &&
      dt <= EVENT_RULES.maxGapMs &&
      p.accuracy <= 10 &&
      previous.accuracy <= 10 &&
      distanceMeters(previous, p) >= Math.max(3, p.accuracy + previous.accuracy)
        ? distanceMeters(previous, p) / (dt / 1000)
        : null),
  };
}

export function analyzeTelemetry(
  ride,
  interruptions = ride.telemetry?.interruptions ?? [],
) {
  const detector = new PerformanceDetector(ride.clientId);
  let breakIndex = 0;
  if (RIDE_MODES[ride.mode].passiveEvents) {
    let previous;
    let interval = 0;
    for (const p of ride.points) {
      while (
        breakIndex < interruptions.length &&
        interruptions[breakIndex].timestamp < p.timestamp
      ) {
        detector.interrupt(interruptions[breakIndex++].reason);
      }
      const oldInterval = interval;
      while (
        interval < ride.intervals.length - 1 &&
        p.timestamp > ride.intervals[interval].end
      )
        interval++;
      if (oldInterval !== interval) detector.interrupt('pause');
      detector.push(eventReading(p, previous));
      previous = p;
    }
    if (ride.intervals.at(-1)?.end < ride.endedAt) detector.interrupt('pause');
  }
  while (breakIndex < interruptions.length)
    detector.interrupt(interruptions[breakIndex++].reason);
  const result = detector.finish();
  result.interruptions = interruptions.map((i) => ({ ...i }));
  // Linear merge: each motion sample is visited once per event type, not per event.
  if (ride.motion?.calibration) {
    for (const type of ['acceleration', 'braking']) {
      let cursor = 0;
      const samples = ride.motion.samples;
      for (const e of result.events.filter((e) => e.type === type)) {
        while (
          cursor < samples.length &&
          samples[cursor].relativeMs < e.startMs - ride.startedAt
        )
          cursor++;
        let peakG = null,
          first = null,
          last = null;
        while (
          cursor < samples.length &&
          samples[cursor].relativeMs <= e.endMs - ride.startedAt
        ) {
          const s = samples[cursor++];
          const value = type === 'acceleration' ? s.accelerationG : s.brakingG;
          if (
            s.quality === 'limited' &&
            s.source === 'browser-linear' &&
            value !== null &&
            Number.isFinite(value)
          ) {
            peakG = Math.max(peakG ?? 0, value);
            first ??= s.relativeMs;
            last = s.relativeMs;
          }
        }
        if (peakG !== null)
          e.force = {
            peakG,
            startMs: ride.startedAt + first,
            endMs: ride.startedAt + last,
            calibrationAt: ride.motion.calibration.at,
            quality: 'limited',
            source: 'browser-linear',
          };
      }
    }
  }
  return result;
}

export function formatEventTime(e) {
  if (e.durationMs === null) return 'Indisponível';
  const step = e.quality.resolutionMs;
  return `${((Math.round(e.durationMs / step) * step) / 1000).toFixed(step >= 1000 ? 0 : 1)} s estimados`;
}
