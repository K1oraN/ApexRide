import { describe, expect, it } from 'vitest';
import type { MotionSample } from '@apex-ride/ride-core/motion';
import {
  activeClock,
  floorIndex,
  prepareReplay,
  interpolatePosition,
} from './timeline';
import { fixture, point, start } from './fixtures';
const replay = (p = fixture()) => prepareReplay({ payload: p, laps: [] });
function sensor(relativeMs: number): MotionSample {
  return {
    sequence: 1,
    relativeMs,
    eventTimestamp: 42,
    segment: 0,
    longitudinal: 1,
    accelerationG: 0.1,
    brakingG: 0,
    lean: null,
    quality: 'limited',
    source: 'browser-linear',
  };
}
describe('13A temporal normalization and recorded data', () => {
  it('excludes explicit pauses but preserves elapsed and paused durations', () => {
    const r = replay();
    expect(r.clock.duration).toBe(20000);
    expect(r.clock.paused).toBe(10000);
    expect(r.clock.elapsed).toBe(30000);
    expect(r.gps[4]!.time).toBe(10000);
  });
  it('sorts and unions overlaps without duplicating time; clips bounds', () => {
    const c = activeClock(100, 1000, [
      { start: 300, end: 800 },
      { start: 0, end: 500 },
      { start: NaN, end: 900 },
    ]);
    expect(c.duration).toBe(700);
    expect(c.locate(90)).toBe(null);
    expect(c.locate(900)).toBe(null);
  });
  it('does not guess missing interval metadata', () => {
    const p = fixture();
    p.intervals = [];
    expect(replay(p).available).toBe(false);
  });
  it('sorts irregular GPS timestamps and discards duplicates without mutating input', () => {
    const p = fixture();
    p.points = [point(4000), point(0), point(1000), point(1000)];
    const original = [...p.points];
    expect(replay(p).gps.map((s) => s.time)).toEqual([0, 1000, 4000]);
    expect(p.points).toEqual(original);
  });
  it('discards invalid timestamps and samples outside active intervals', () => {
    const p = fixture();
    p.points.push(point(15000), { ...point(100), timestamp: NaN }, point(-1));
    expect(replay(p).gps).toHaveLength(6);
  });
  it('does not connect collapsed pauses or segment changes', () => {
    const r = replay();
    expect(r.frame(9500).position).toBeNull();
    expect(r.frame(10000).position?.timestamp).toBe(start + 20000);
    expect(r.groups).toHaveLength(2);
  });
  it('uses time proportion for irregular samples', () => {
    const r = replay();
    const pos = r.frame(2500).position!;
    expect(pos.interpolated).toBe(true);
    expect(pos.longitude).toBeCloseTo(-35.72975, 6);
  });
  it('does not interpolate across signal gaps', () => {
    const p = fixture();
    p.points = [point(0), point(9000)];
    const r = replay(p);
    expect(r.frame(4000).gap).toBe(true);
    expect(r.groups).toHaveLength(2);
    expect(r.frame(9000).gap).toBe(false);
  });
  it('rejects bad accuracy and impossible jumps and breaks the trail', () => {
    const p = fixture();
    p.points = [point(0), { ...point(1000), longitude: 12 }, point(2000)];
    const r = replay(p);
    expect(r.gps).toHaveLength(2);
    expect(r.frame(1000).gap).toBe(true);
    expect(r.groups).toHaveLength(2);
  });
  it('handles longitude wrap with a short spherical arc', () => {
    const a = { ...point(0), latitude: 0, longitude: 179.999 },
      b = { ...a, longitude: -179.999 };
    expect(Math.abs(interpolatePosition(a, b, 0.5).longitude)).toBeCloseTo(180);
  });
  it('has null speed and sensors instead of invented zeros', () => {
    const p = fixture();
    p.points = p.points.map((s) => ({ ...s, speed: null }));
    expect(replay(p).frame(0)).toMatchObject({
      speedKmh: null,
      accelerationG: null,
      brakingG: null,
      lean: null,
    });
  });
  it('expires old speed independently of the visual position', () => {
    expect(replay().frame(3000).speedKmh).toBeNull();
    expect(replay().frame(3000).position).not.toBeNull();
  });
  it('uses a recorded assisted series with an identified GPS anchor', () => {
    const p = fixture();
    p.speedProcessing = {
      version: 'speed-1',
      truncated: false,
      samples: [
        {
          relativeMs: 100,
          gpsTimestamp: start,
          speedMps: 12,
          source: 'assisted',
          state: 'assisted',
          reason: null,
          stationary: false,
        },
      ],
    };
    expect(replay(p).frame(200)).toMatchObject({
      speedKmh: 43.2,
      speedSource: 'assisted',
    });
    p.speedProcessing.samples[0]!.gpsTimestamp = 42;
    expect(replay(p).frame(200).speedKmh).toBeNull();
  });
  it('aligns sensors by session relativeMs, never eventTimestamp origin', () => {
    const p = fixture();
    p.motion = {
      version: 'motion-1',
      truncated: false,
      samples: [sensor(1200)],
      gaps: [],
      calibration: {
        at: start,
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
      stats: {
        maxAccelerationG: 0.1,
        maxBrakingG: 0,
        maxLeft: null,
        maxRight: null,
        meanLeft: null,
        meanRight: null,
        validSamples: 1,
      },
    };
    expect(replay(p).frame(1300).accelerationG).toBe(0.1);
    expect(replay(p).frame(1800).accelerationG).toBeNull();
    p.motion.samples[0]!.relativeMs = NaN;
    expect(replay(p).frame(1300).accelerationG).toBeNull();
  });
  it('GPS-only old sessions remain functional', () => {
    const p = fixture();
    expect(replay(p).available).toBe(true);
    expect(replay(p).charts.force).toEqual([]);
  });
  it('empty or partial sessions report availability honestly', () => {
    const p = fixture();
    p.points = [];
    expect(replay(p).available).toBe(false);
    p.points = [point(0)];
    expect(replay(p).available).toBe(false);
  });
  it('binary lookup handles endpoints and arbitrary irregular times', () => {
    const s = [{ time: 10 }, { time: 200 }, { time: 205 }];
    expect([-1, 10, 199, 200, 1000].map((t) => floorIndex(s, t))).toEqual([
      -1, 0, 0, 1, 2,
    ]);
  });
});
