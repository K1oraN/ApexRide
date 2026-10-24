import {
  MOTION_RULES,
  motionStats,
  type Calibration,
  type MotionPayload,
  type MotionSample,
  type Mount,
} from '@apex-ride/ride-core/motion';
import { MotionCapture } from './capture';
import { CalibrationWindow, toBike } from './calibration';
import { MotionProcessor } from './processing';
import type { RawMotion } from './types';
import { norm, subtract } from './normalize';
import type { AccelerationReading } from '../speed/estimator';
import { sensorMonotonicTime } from '../speed/estimator';

export class MotionTelemetry {
  checkpoint(): MotionPayload | undefined {
    if (
      this.sessionStart === null ||
      (!this.calibration && !this.samples.length && !this.gaps.length)
    )
      return undefined;
    return {
      version: 'motion-1',
      calibration: this.calibration ? { ...this.calibration } : null,
      samples: this.samples,
      gaps: [...this.gaps],
      truncated: this.truncated,
      stats: motionStats(this.samples),
    };
  }
  chartSamples() {
    return this.samples.slice(-600);
  }
  private listeners = new Set<() => void>();
  private accelerationListeners = new Set<
    (sample: AccelerationReading) => void
  >();
  onAcceleration = (listener: (sample: AccelerationReading) => void) => {
    this.accelerationListeners.add(listener);
    return () => {
      this.accelerationListeners.delete(listener);
    };
  };
  private calibration: Calibration | null = null;
  private window: CalibrationWindow | null = null;
  private calibrationTimer: ReturnType<typeof setTimeout> | null = null;
  private processor = new MotionProcessor();
  private samples: MotionSample[] = [];
  private gaps: MotionPayload['gaps'] = [];
  private truncated = false;
  private sessionStart: number | null = null;
  private anchor = 0;
  private relativeAnchor = 0;
  private active = false;
  private segment = -1;
  private lastSelected = -Infinity;
  private latest: RawMotion | null = null;
  private snapshot;
  constructor(readonly capture = new MotionCapture()) {
    this.snapshot = {
      sensor: capture.getSnapshot(),
      calibration: null as Calibration | null,
      calibrating: false,
      message:
        'Sem calibração. Força G indisponível. Inclinação dinâmica aguarda homologação.',
      current: null as MotionSample | null,
      samples: 0,
      truncated: false,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private publish(
    message?: string,
    current: MotionSample | null = this.snapshot.current,
  ) {
    this.snapshot = {
      sensor: this.capture.getSnapshot(),
      calibration: this.calibration ? { ...this.calibration } : null,
      calibrating: !!this.window,
      message: message ?? this.snapshot.message,
      current,
      samples: this.samples.length,
      truncated: this.truncated,
    };
    this.listeners.forEach((f) => f());
  }
  connect() {
    const off = [
      this.capture.subscribe(() =>
        this.publish(
          undefined,
          this.capture.getSnapshot().status === 'working'
            ? this.snapshot.current
            : null,
        ),
      ),
      this.capture.onSample(this.receive),
      this.capture.onGap(this.interrupt),
    ];
    this.capture.detect();
    return () => {
      off.forEach((f) => f());
      this.stop();
    };
  }
  activate = () => this.capture.activate();
  calibrate = (
    mount: Mount,
    fixed: boolean,
    upright: boolean,
    speed: number | null,
  ) => {
    if (this.sessionStart !== null || this.window) return;
    this.calibration = null;
    if (
      !fixed ||
      !upright ||
      (speed !== null && speed > 1) ||
      this.capture.getSnapshot().status !== 'working'
    ) {
      this.publish(
        'Confirme suporte fixo, moto parada e vertical, e aguarde leituras reais.',
        null,
      );
      return;
    }
    this.window = new CalibrationWindow(mount, performance.now());
    this.publish(
      'Mantenha a moto parada e vertical. Avaliando estabilidade…',
      null,
    );
    this.calibrationTimer = setTimeout(() => {
      try {
        this.calibration = this.window!.complete(Date.now());
        this.publish(
          'Calibrado para força G estimada. Não altere o suporte. Inclinação dinâmica indisponível.',
        );
      } catch (e) {
        this.publish(
          e instanceof Error ? e.message : 'Não foi possível calibrar.',
        );
      } finally {
        this.window = null;
        this.calibrationTimer = null;
        this.publish();
      }
    }, 3000);
  };
  private relative(now = performance.now()) {
    return Math.max(0, Math.round(this.relativeAnchor + now - this.anchor));
  }
  session(start: number, active: boolean) {
    if (this.sessionStart === null) {
      this.sessionStart = start;
      this.anchor = performance.now();
      this.relativeAnchor = Math.max(0, Date.now() - start);
      if (this.calibration && Date.now() - this.calibration.at > 600000)
        this.invalidate(
          'Calibração expirada. Continue com GPS e calibre antes do próximo Ride.',
        );
      if (this.window) {
        this.cancelCalibration();
        this.invalidate('Calibração não concluída antes do início.');
      }
    }
    if (active === this.active) return;
    this.active = active;
    this.processor.reset();
    this.lastSelected = -Infinity;
    if (active) {
      this.segment++;
      if (
        this.latest &&
        performance.now() - this.latest.monotonicMs >= MOTION_RULES.gapMs
      )
        this.invalidate(
          'Sinal antigo. Continue com GPS; recalibre após parar.',
        );
    } else {
      this.addGap('pause');
      this.publish(undefined, null);
    }
  }
  private invalidate(message: string) {
    if (this.calibration) this.calibration.valid = false;
    this.processor.reset();
    this.publish(message, null);
  }
  private addGap(reason: MotionPayload['gaps'][number]['reason']) {
    if (this.sessionStart === null) return;
    if (
      !this.capture.getSnapshot().active &&
      !this.calibration &&
      !this.samples.length
    )
      return;
    if (this.gaps.length >= MOTION_RULES.maxGaps) {
      this.truncated = true;
      this.active = false;
      this.publish(
        'Limite de lacunas atingido. Histórico de sensores incompleto; GPS continua.',
        null,
      );
      return;
    }
    this.gaps.push({ relativeMs: this.relative(), reason });
  }
  private interrupt = (reason: 'signal' | 'hidden') => {
    this.addGap(reason);
    this.segment++;
    this.invalidate(
      'Referência perdida por interrupção. Força G indisponível; continue com GPS e calibre após encerrar.',
    );
    this.cancelCalibration();
  };
  private receive = (raw: RawMotion) => {
    this.latest = raw;
    this.window?.add(raw);
    if (this.calibration?.valid && raw.angular && norm(raw.angular) > 200)
      this.invalidate(
        'Movimento incompatível com a referência: possível mudança do suporte. Calibração invalidada.',
      );
    if (
      this.calibration?.valid &&
      raw.screenAngle !== this.calibration.screenAngle
    )
      this.invalidate(
        'Orientação da tela alterada: possível mudança do suporte. Calibração invalidada.',
      );
    if (this.sessionStart !== null && (!this.active || this.truncated)) return;
    const processed = this.processor.process(raw, this.calibration);
    const bike =
      raw.acceleration && this.calibration?.valid
        ? toBike(
            subtract(raw.acceleration, this.calibration.bias),
            this.calibration.basis,
          )
        : null;
    // Assistência mais conservadora que força G: rejeita curvas, vibração e movimento vertical.
    const usable =
      processed.source === 'browser-linear' &&
      processed.quality === 'limited' &&
      processed.longitudinal !== null &&
      !!bike &&
      !!raw.angular &&
      norm(raw.angular) <= 10 &&
      Math.abs(bike[1]) <= 1 &&
      Math.abs(bike[2]) <= 1.5 &&
      Math.abs(bike[0] - processed.longitudinal) <= 1.5;
    this.accelerationListeners.forEach((listener) =>
      listener({
        monotonicMs: sensorMonotonicTime(
          raw.eventTimestamp,
          raw.monotonicMs,
          raw.timestamp,
        ),
        longitudinal: processed.longitudinal,
        calibrated: !!this.calibration?.valid,
        usable,
      }),
    );
    if (!this.active || this.truncated) return;
    if (raw.monotonicMs - this.lastSelected < MOTION_RULES.sampleMs) return;
    if (this.samples.length >= MOTION_RULES.maxSamples) {
      this.truncated = true;
      this.publish(
        'Limite de 18.000 amostras atingido. Histórico de sensores incompleto; GPS continua.',
        null,
      );
      return;
    }
    this.lastSelected = raw.monotonicMs;
    const sample: MotionSample = {
      ...processed,
      sequence: raw.sequence,
      relativeMs: this.relative(raw.monotonicMs),
      eventTimestamp: raw.eventTimestamp,
      segment: this.segment,
    };
    this.samples.push(sample);
    this.publish(undefined, sample);
  };
  finish(): MotionPayload | undefined {
    this.active = false;
    const data =
      this.sessionStart !== null &&
      (this.calibration || this.samples.length || this.gaps.length)
        ? {
            version: 'motion-1' as const,
            calibration: this.calibration ? { ...this.calibration } : null,
            samples: [...this.samples],
            gaps: [...this.gaps],
            truncated: this.truncated,
            stats: motionStats(this.samples),
          }
        : undefined;
    this.stop();
    return data;
  }
  private cancelCalibration() {
    if (this.calibrationTimer) clearTimeout(this.calibrationTimer);
    this.calibrationTimer = null;
    this.window = null;
  }
  stop = () => {
    this.cancelCalibration();
    this.active = false;
    if (this.calibration) this.calibration.valid = false;
    this.processor.reset();
    this.capture.stop();
    this.publish(
      'Coleta encerrada. Calibre novamente antes de outra atividade.',
      null,
    );
  };
  clear = () => {
    this.stop();
    this.calibration = null;
    this.sessionStart = null;
    this.samples = [];
    this.gaps = [];
    this.segment = -1;
    this.latest = null;
    this.truncated = false;
    this.processor.reset();
    this.publish(
      'Sem calibração. Configure os sensores antes de iniciar.',
      null,
    );
  };
}
