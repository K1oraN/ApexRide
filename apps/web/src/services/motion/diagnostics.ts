import { MOTION_RULES } from '@apex-ride/ride-core/motion';
import type { Orientation, RawMotion } from './types';

export type DiagnosticState =
  'not-tested' | 'insufficient' | 'working' | 'stale';
export type MotionDiagnostics = Record<
  'accelerometer' | 'gyroscope' | 'orientation',
  DiagnosticState
>;
export const untestedDiagnostics = (): MotionDiagnostics => ({
  accelerometer: 'not-tested',
  gyroscope: 'not-tested',
  orientation: 'not-tested',
});

// Bounded counters, using the existing capture. API detection never counts as a reading.
export class SensorDiagnostics {
  private channels = new Map<
    string,
    { count: number; first: number; last: number }
  >();
  private add(name: string, time: number) {
    const previous = this.channels.get(name);
    if (previous && time <= previous.last) return;
    const row =
      previous && time - previous.last < MOTION_RULES.gapMs
        ? previous
        : { count: 0, first: time, last: time };
    row.count = Math.min(3, row.count + 1);
    row.last = time;
    this.channels.set(name, row);
  }
  observeOrientation(orientation: Orientation | null) {
    if (orientation && orientation.beta !== null && orientation.gamma !== null)
      this.add('orientation', orientation.monotonicMs);
  }
  observe(sample: RawMotion) {
    if (sample.acceleration || sample.gravity)
      this.add('accelerometer', sample.monotonicMs);
    if (sample.angular) this.add('gyroscope', sample.monotonicMs);
    this.observeOrientation(sample.orientation);
  }
  snapshot(now: number): MotionDiagnostics {
    const state = (name: string): DiagnosticState => {
      const row = this.channels.get(name);
      return !row
        ? 'not-tested'
        : now - row.last >= MOTION_RULES.gapMs
          ? 'stale'
          : row.count >= 3 && row.last - row.first >= 100
            ? 'working'
            : 'insufficient';
    };
    return {
      accelerometer: state('accelerometer'),
      gyroscope: state('gyroscope'),
      orientation: state('orientation'),
    };
  }
  clear() {
    this.channels.clear();
  }
}
