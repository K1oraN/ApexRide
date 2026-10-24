import { describe, it, expect } from 'vitest';
import type { MotionPayload } from '@apex-ride/ride-core/motion';
import type { PerformanceEvent } from '@apex-ride/ride-core/telemetry';
import { prepareReplay } from './timeline';
import { fixture, point, start } from './fixtures';
function motion(): MotionPayload {
  return {
    version: 'motion-1',
    calibration: {
      at: start - 1000,
      valid: true,
      version: 'motion-1',
      mount: 'top-forward',
      screenAngle: 0,
      basis: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      bias: [0, 0, 0],
    },
    samples: [0, 200, 400].map((relativeMs, i) => ({
      sequence: i + 1,
      relativeMs,
      eventTimestamp: 500 + relativeMs,
      segment: 0,
      longitudinal: 1,
      accelerationG: 0.12,
      brakingG: 0.03,
      lean: null,
      quality: 'limited',
      source: 'browser-linear',
    })),
    gaps: [],
    truncated: false,
    stats: {
      maxAccelerationG: 0.12,
      maxBrakingG: 0.03,
      maxLeft: null,
      maxRight: null,
      meanLeft: null,
      meanRight: null,
      validSamples: 3,
    },
  };
}
const event = (
  type: 'acceleration' | 'braking',
  status: 'estimated' | 'inconclusive' = 'estimated',
): PerformanceEvent => ({
  id: type,
  type,
  startMs: start + 1000,
  endMs: start + 3000,
  durationMs: 2000,
  status,
  reason: null,
  version: 'events-1',
  method: 'adjacent-linear-estimate',
  quality: {
    experimental: true,
    sampleCount: 5,
    maxGapMs: 1000,
    resolutionMs: 1000,
    sources: ['gps-direct'],
  },
  force: null,
});
describe('13C synchronized indicators, charts, events and laps', () => {
  it('preserves acceleration and braking signs independently at sensor frequency', () => {
    const p = fixture();
    p.motion = motion();
    const r = prepareReplay({ payload: p, laps: [] });
    expect(r.frame(300)).toMatchObject({
      accelerationG: 0.12,
      brakingG: 0.03,
      lean: null,
    });
    expect(r.charts.force[0]!.value).toBeCloseTo(0.09);
    expect(r.charts.lean).toEqual([]);
    expect(r.frame(901).accelerationG).toBeNull();
  });
  it.each(['uncalibrated', 'invalid', 'interrupted'] as const)(
    'suppresses rejected sensor quality %s',
    (quality) => {
      const p = fixture();
      p.motion = motion();
      p.motion.samples.forEach((s) => {
        s.quality = quality;
      });
      const r = prepareReplay({ payload: p, laps: [] });
      expect(r.frame(300).accelerationG).toBeNull();
      expect(r.charts.force).toEqual([]);
    },
  );
  it('rejects absent calibration and future calibration for earlier samples', () => {
    const p = fixture();
    p.motion = motion();
    p.motion.calibration!.at = start + 10000;
    expect(
      prepareReplay({ payload: p, laps: [] }).frame(300).brakingG,
    ).toBeNull();
    p.motion.calibration = null;
    expect(prepareReplay({ payload: p, laps: [] }).charts.force).toEqual([]);
  });
  it('honors explicit sensor interruption before sample expiry', () => {
    const p = fixture();
    p.motion = motion();
    p.motion.gaps = [{ relativeMs: 500, reason: 'signal' }];
    p.motion.samples.push({
      ...p.motion.samples[0]!,
      relativeMs: 600,
      sequence: 4,
    });
    expect(
      prepareReplay({ payload: p, laps: [] }).frame(550).accelerationG,
    ).toBeNull();
    const chart = prepareReplay({ payload: p, laps: [] }).charts.force;
    expect(chart[2]!.segment).not.toBe(chart[3]!.segment);
  });
  it.each(['acceleration', 'braking'] as const)(
    'highlights persisted %s event and keeps its validation status',
    (type) => {
      const p = fixture();
      p.telemetry = {
        version: 'events-1',
        events: [event(type, 'inconclusive')],
        interruptions: [],
        truncated: false,
        stats: {
          accelerationCount: 0,
          brakingCount: 0,
          bestAccelerationMs: null,
          bestBrakingMs: null,
        },
        lapContext: { circuitId: null, startFinishLineId: null, laps: [] },
      };
      const r = prepareReplay({ payload: p, laps: [] });
      expect(r.events[0]).toMatchObject({
        start: 1000,
        end: 3000,
        status: 'inconclusive',
      });
      expect(r.frame(2000).event?.id).toBe(type);
      expect(r.frame(3500).event).toBeNull();
      expect(p.telemetry.events).toHaveLength(1);
    },
  );
  it('does not interpret unaligned event clocks as epoch time', () => {
    const p = fixture();
    const e = event('acceleration');
    e.startMs = 1000;
    e.endMs = 3000;
    p.telemetry = {
      version: 'events-1',
      events: [e],
      interruptions: [],
      truncated: false,
      stats: {
        accelerationCount: 0,
        brakingCount: 0,
        bestAccelerationMs: null,
        bestBrakingMs: null,
      },
      lapContext: { circuitId: null, startFinishLineId: null, laps: [] },
    };
    expect(prepareReplay({ payload: p, laps: [] }).events).toEqual([]);
  });
  it('identifies persisted laps only for a verified circuit in track mode', () => {
    const p = fixture();
    p.mode = 'pista';
    p.route = {
      abandoned: false,
      plan: {
        id: 'circuit',
        version: 1,
        name: 'Circuito',
        kind: 'circuit',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-35.73, -9.66],
            [-35.729, -9.66],
          ],
        },
        distanceMeters: 100,
        verification: 'verified',
        startLine: null,
        direction: null,
      },
    };
    const laps = [
      {
        number: 1,
        start: start + 1000,
        end: start + 4000,
        durationMs: 3000,
        status: 'estimated',
      },
    ];
    expect(prepareReplay({ payload: p, laps }).frame(2000).lap?.id).toBe('1');
    p.route.plan.verification = 'suggested';
    expect(prepareReplay({ payload: p, laps }).laps).toEqual([]);
    delete p.route;
    expect(prepareReplay({ payload: p, laps }).laps).toEqual([]);
  });
  it('preprocesses 50000 originals with bounded chart display and indexed seeking', () => {
    const p = fixture();
    p.points = Array.from({ length: 50000 }, (_, i) => point(i * 1000));
    p.endedAt = start + 50000000;
    p.intervals = [{ start, end: p.endedAt }];
    const r = prepareReplay({ payload: p, laps: [] });
    expect(r.gps).toHaveLength(50000);
    expect(r.charts.gps.length).toBeLessThanOrEqual(600);
    for (let i = 0; i < 1000; i++)
      expect(r.frame(i * 45001).position).not.toBeNull();
    expect(p.points).toHaveLength(50000);
  });
});
