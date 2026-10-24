import type { RidePayload, RidePoint } from '@apex-ride/ride-core';
import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import {
  analyzeTelemetry,
  eventReading,
  PerformanceDetector,
  type AdvancedTelemetry,
} from '@apex-ride/ride-core/telemetry';

export class TelemetrySession {
  checkpoint(): AdvancedTelemetry | undefined {
    if (!this.detector || this.failed) return undefined;
    return {
      version: 'events-1',
      interruptions: [...this.interruptions],
      events: this.events,
      truncated: this.detector.truncated,
      stats: {
        accelerationCount: 0,
        brakingCount: 0,
        bestAccelerationMs: null,
        bestBrakingMs: null,
      },
      lapContext: { circuitId: null, startFinishLineId: null, laps: [] },
    };
  }
  private detector: PerformanceDetector | null = null;
  private interruptions: AdvancedTelemetry['interruptions'] = [];
  failed = false;
  receive(ride: RidePayload, point: RidePoint, previous?: RidePoint) {
    if (!RIDE_MODES[ride.mode].passiveEvents || this.failed) return;
    try {
      this.detector ??= new PerformanceDetector(ride.clientId);
      this.detector.push(eventReading(point, previous));
    } catch {
      this.failed = true;
      this.interrupt(point.timestamp, 'processing');
    }
  }
  interrupt(timestamp: number, reason: 'speed-mode' | 'processing') {
    if (!this.detector) return;
    this.detector.interrupt(reason);
    if (
      this.interruptions.length < 2000 &&
      timestamp > (this.interruptions.at(-1)?.timestamp ?? 0)
    )
      this.interruptions.push({ timestamp, reason });
    else this.failed = true;
  }
  pause() {
    this.detector?.interrupt('pause');
  }
  get events() {
    return this.detector?.events ?? [];
  }
  finish(ride: RidePayload): AdvancedTelemetry | undefined {
    if (!RIDE_MODES[ride.mode].advanced || this.failed) return undefined;
    // One consolidation, shared with the API; no whole-session work in a render.
    try {
      return analyzeTelemetry(
        ride,
        this.interruptions.filter((i) => i.timestamp <= ride.endedAt),
      );
    } catch {
      this.failed = true;
      return undefined;
    }
  }
  clear() {
    this.detector = null;
    this.interruptions = [];
    this.failed = false;
  }
}
