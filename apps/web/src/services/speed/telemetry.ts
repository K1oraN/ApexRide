import {
  SPEED_STORAGE,
  type SpeedPayload,
  type SpeedMode,
} from '@apex-ride/ride-core/speed';
import type { GpsPreview } from '../gps/preview';
import type { MotionTelemetry } from '../motion/telemetry';
import type { RidePayload } from '@apex-ride/ride-core';
import { SpeedEstimator } from './estimator';

/** Consome os serviços existentes; nenhum listener nativo adicional. */
export class SpeedTelemetry {
  checkpoint(): SpeedPayload | undefined {
    return this.start === null
      ? undefined
      : {
          version: 'speed-1',
          samples: this.samples,
          truncated: this.truncated,
        };
  }
  private modeListeners = new Set<() => void>();
  onModeChange(listener: () => void) {
    this.modeListeners.add(listener);
    return () => {
      this.modeListeners.delete(listener);
    };
  }
  chartSamples() {
    return this.samples.slice(-600);
  }
  readonly estimator = new SpeedEstimator();
  private listeners = new Set<() => void>();
  private snapshot = this.estimator.snapshot(Date.now(), performance.now());
  private samples: SpeedPayload['samples'] = [];
  private truncated = false;
  private start: number | null = null;
  private running = false;
  private phase = 'preparation';
  private anchor = 0;
  private relativeAnchor = 0;
  private lastVisual = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private gpsActive = false;
  private syncTimer() {
    const needed =
      this.connected &&
      (this.running || (this.start === null && this.gpsActive));
    if (needed && this.timer === null)
      this.timer = setInterval(() => this.update(), 100);
    if (!needed && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setMode = (mode: SpeedMode) => {
    if (
      this.estimator.snapshot(Date.now(), performance.now()).preference !== mode
    )
      this.modeListeners.forEach((listener) => listener());
    this.estimator.setMode(mode);
    this.update(true);
  };
  session(phase: string, start: number | null) {
    if (phase === this.phase && start === this.start) return;
    if (start !== null && this.start === null) {
      this.samples = [];
      this.truncated = false;
      this.anchor = performance.now();
      this.relativeAnchor = Math.max(0, Date.now() - start);
    }
    this.phase = phase;
    this.start = start;
    this.running = phase === 'running';
    this.syncTimer();
    this.estimator.reset();
    this.update(true);
  }
  connect(gps: GpsPreview, motion: MotionTelemetry) {
    this.connected = true;
    this.gpsActive = gps.getSnapshot().active;
    this.syncTimer();
    const off = [
      gps.subscribe(() => {
        const g = gps.getSnapshot();
        this.gpsActive = g.active;
        this.syncTimer();
        if (
          g.status === 'available' &&
          g.reading &&
          (!this.start || this.running)
        )
          this.estimator.receiveGps(g.reading, Date.now(), performance.now());
        else if (['idle', 'suspended', 'denied', 'waiting'].includes(g.status))
          this.estimator.reset();
        else if (g.status !== 'available')
          this.estimator.suspend('interruption');
        this.update(true);
      }),
      motion.onAcceleration((s) => {
        if (this.start !== null && !this.running) return;
        if (!gps.getSnapshot().active) return;
        this.estimator.receiveAcceleration(s, performance.now());
        this.update();
      }),
      motion.subscribe(() => {
        const m = motion.getSnapshot();
        if (!m.calibration?.valid || !m.sensor.active) {
          this.estimator.suspend(
            m.calibration && !m.calibration.valid ? 'calibration' : 'sensors',
          );
          this.update();
        }
      }),
    ];
    return () => {
      off.forEach((f) => f());
      this.connected = false;
      this.syncTimer();
      this.estimator.reset();
    };
  }
  private update(force = false) {
    const now = performance.now();
    const next = this.estimator.snapshot(Date.now(), now);
    // Persistência por tempo monotônico; transições relevantes não são perdidas.
    if (this.running && this.start !== null) {
      const relativeMs = Math.max(
        0,
        Math.floor(this.relativeAnchor + now - this.anchor),
        // Quantização dos relógios nunca pode colocar a amostra antes do GPS usado.
        (next.gpsTimestamp ?? this.start) - this.start,
      );
      const last = this.samples.at(-1);
      const transition =
        last &&
        (last.state !== next.state ||
          last.source !== next.source ||
          last.reason !== next.reason ||
          last.stationary !== next.stationary);
      if (
        !last ||
        (relativeMs > last.relativeMs &&
          (transition ||
            relativeMs - last.relativeMs >= SPEED_STORAGE.sampleMs))
      ) {
        if (this.samples.length < SPEED_STORAGE.maxSamples) {
          this.samples.push({
            relativeMs,
            speedMps: next.speedMps,
            gpsTimestamp: next.gpsTimestamp,
            source: next.source,
            state: next.state,
            reason: next.reason,
            stationary: next.stationary,
          });
        } else this.truncated = true;
      }
    }
    if (!force && now - this.lastVisual < 100) return;
    this.lastVisual = now;
    this.snapshot = next;
    this.listeners.forEach((f) => f());
  }
  finish(
    activity?: Pick<
      RidePayload,
      'startedAt' | 'endedAt' | 'intervals' | 'points'
    >,
  ): SpeedPayload | undefined {
    this.running = false;
    this.syncTimer();
    if (activity) {
      // Aceitar apenas referências realmente incluídas na atividade consolidada.
      const references = new Set(activity.points.map((p) => p.timestamp));
      let intervalIndex = 0;
      const selected = this.samples.filter((s) => {
        const at = activity.startedAt + s.relativeMs;
        while (
          intervalIndex < activity.intervals.length - 1 &&
          at > activity.intervals[intervalIndex]!.end
        )
          intervalIndex++;
        const interval = activity.intervals[intervalIndex];
        return (
          at <= activity.endedAt &&
          !!interval &&
          at >= interval.start &&
          at <= interval.end &&
          (s.gpsTimestamp === null || references.has(s.gpsTimestamp))
        );
      });
      if (selected.length !== this.samples.length) this.truncated = true;
      this.samples = selected;
    }
    const data: SpeedPayload | undefined =
      this.start === null
        ? undefined
        : {
            version: 'speed-1',
            samples: [...this.samples],
            truncated: this.truncated,
          };
    this.estimator.reset();
    this.update(true);
    return data;
  }
  clear() {
    this.samples = [];
    this.truncated = false;
    this.start = null;
    this.running = false;
    this.syncTimer();
    this.estimator.reset();
    this.update(true);
  }
  get historyIncomplete() {
    return this.truncated;
  }
}
