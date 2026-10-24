import { STOP_RULES } from '@apex-ride/ride-core/telemetry';
import { distanceMeters } from '@apex-ride/ride-core';
import type { SpeedMode, SpeedSample } from '@apex-ride/ride-core/speed';
import type { LocationReading } from '../gps/readings';
import { validateReading } from '../gps/readings';

// Limites de engenharia conservadores, sujeitos à homologação por dispositivo.
export const SPEED_CONFIG = {
  gpsAgeMs: 3000,
  predictionMs: 2000,
  sensorGapMs: 350,
  sensorAgeMs: 350,
  maxAcceleration: 8,
  maxSpeed: 100,
  correctionGain: 0.8,
  maxResidual: 3,
  maxDeviation: 5,
  quietAcceleration: 0.1,
  stopSpeed: STOP_RULES.speedMps,
  stopWindowMs: STOP_RULES.windowMs,
  stopRadiusMeters: STOP_RULES.radiusMeters,
  stopAccuracyMeters: STOP_RULES.accuracyMeters,
} as const;
export interface AccelerationReading {
  monotonicMs: number;
  longitudinal: number | null;
  calibrated: boolean;
  usable: boolean;
}
/** Eventos modernos usam performance; Safari antigo pode usar epoch. */
export function sensorMonotonicTime(
  eventTimestamp: number,
  receivedMono: number,
  receivedWall: number,
) {
  return Math.abs(eventTimestamp - receivedMono) <=
    Math.abs(eventTimestamp - receivedWall)
    ? eventTimestamp
    : receivedMono + eventTimestamp - receivedWall;
}
export interface SpeedSnapshot extends Omit<SpeedSample, 'relativeMs'> {
  timestamp: number;
  gpsAgeMs: number | null;
  accelerationAvailable: boolean;
  calibrated: boolean;
  version: 'speed-1';
  preference: SpeedMode;
}
export class SpeedEstimator {
  private mode: SpeedMode = 'assisted';
  private gps: LocationReading | null = null;
  private gpsMono = 0;
  private sensor: AccelerationReading | null = null;
  private estimate: number | null = null;
  private quietSince: number | null = null;
  private stopAnchor: LocationReading | null = null;
  private stopped = false;
  private reason: SpeedSample['reason'] = 'sensors';
  private correctionBlocked = false;
  private lastGpsEvent = 0;
  private lastSensorEvent = -Infinity;
  private history: { at: number; speed: number }[] = [];
  private calibrationValid = false;
  constructor(
    readonly config: Readonly<
      Record<keyof typeof SPEED_CONFIG, number>
    > = SPEED_CONFIG,
  ) {}
  setMode(mode: SpeedMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.reset();
  }
  reset() {
    this.gps = null;
    this.lastGpsEvent = 0;
    this.lastSensorEvent = -Infinity;
    this.history = [];
    this.calibrationValid = false;
    this.sensor = null;
    this.estimate = null;
    this.quietSince = null;
    this.stopAnchor = null;
    this.stopped = false;
    this.reason = 'sensors';
    this.correctionBlocked = false;
  }
  suspend(reason: SpeedSample['reason'] = 'interruption') {
    this.sensor = null;
    this.estimate = null;
    this.quietSince = null;
    this.stopped = false;
    this.reason = reason;
    this.history = [];
    if (reason === 'calibration') this.calibrationValid = false;
  }
  receiveGps(r: LocationReading, wallNow: number, monoNow: number) {
    if (!Number.isFinite(monoNow) || r.timestamp <= this.lastGpsEvent) return;
    const validation = validateReading(r, this.gps, wallNow);
    if (
      validation !== 'good' ||
      wallNow < r.timestamp ||
      wallNow - r.timestamp > this.config.gpsAgeMs
    )
      return;
    this.lastGpsEvent = r.timestamp;
    if (
      r.speed === null ||
      !Number.isFinite(r.speed) ||
      r.speed < 0 ||
      r.speed > this.config.maxSpeed
    ) {
      this.suspend('gps-invalid');
      this.gps = null;
      return;
    }
    const previous = this.gps;
    const dt = previous ? (r.timestamp - previous.timestamp) / 1000 : 0;
    if (
      previous &&
      dt < this.config.gpsAgeMs / 1000 &&
      Math.abs(r.speed - previous.speed!) > 15 * dt
    ) {
      this.suspend('gps-invalid');
      return;
    }
    const age = wallNow - r.timestamp;
    // GPS epoch convertido à escala monotônica no recebimento. Não extrapola o atraso.
    const measurementMono = monoNow - age;
    const before = this.history.findLast((p) => p.at <= measurementMono);
    const after = this.history.find((p) => p.at >= measurementMono);
    const referencePrediction =
      before && after && after.at > before.at
        ? before.speed +
          ((after.speed - before.speed) * (measurementMono - before.at)) /
            (after.at - before.at)
        : before && measurementMono - before.at <= this.config.sensorAgeMs
          ? before.speed
          : null;
    const continuous =
      previous &&
      monoNow - this.gpsMono < this.config.predictionMs &&
      age <= this.config.sensorAgeMs &&
      referencePrediction !== null;
    const residual =
      referencePrediction === null ? 0 : r.speed - referencePrediction;
    this.correctionBlocked =
      age > this.config.sensorAgeMs ||
      (!!continuous && Math.abs(residual) > this.config.maxResidual);
    this.estimate =
      continuous && this.estimate !== null && !this.correctionBlocked
        ? Math.max(0, this.estimate + this.config.correctionGain * residual)
        : r.speed;
    this.gps = { ...r };
    this.gpsMono = monoNow - age;
    // Nunca integrar de uma amostra anterior à nova referência GPS.
    if (
      !continuous ||
      !this.sensor ||
      this.sensor.monotonicMs < measurementMono
    )
      this.sensor = null;
    this.history = [
      {
        at: this.sensor?.monotonicMs ?? measurementMono,
        speed: this.estimate!,
      },
    ];
    if (this.correctionBlocked)
      this.reason = age > this.config.sensorAgeMs ? 'interruption' : 'drift';
    const quiet =
      this.quietSince !== null &&
      monoNow - this.quietSince >= this.config.stopWindowMs;
    if (
      !previous ||
      dt * 1000 > this.config.gpsAgeMs ||
      !this.stopAnchor ||
      r.speed > this.config.stopSpeed ||
      distanceMeters(r, this.stopAnchor) > this.config.stopRadiusMeters
    )
      this.stopAnchor = { ...r };
    this.stopped = !!(
      quiet &&
      previous &&
      r.speed <= this.config.stopSpeed &&
      previous.speed! <= this.config.stopSpeed &&
      r.accuracy <= this.config.stopAccuracyMeters &&
      this.stopAnchor &&
      r.timestamp - this.stopAnchor.timestamp >= this.config.stopWindowMs
    );
  }
  receiveAcceleration(s: AccelerationReading, monoNow: number) {
    if (this.mode === 'pure') return;
    if (!Number.isFinite(s.monotonicMs) || !Number.isFinite(monoNow)) return;
    if (s.monotonicMs <= this.lastSensorEvent) return;
    if (
      s.monotonicMs > monoNow ||
      monoNow - s.monotonicMs > this.config.sensorAgeMs
    ) {
      this.suspend('interruption');
      return;
    }
    this.lastSensorEvent = s.monotonicMs;
    this.calibrationValid = s.calibrated;
    if (
      !s.calibrated ||
      !s.usable ||
      s.longitudinal === null ||
      !Number.isFinite(s.longitudinal) ||
      Math.abs(s.longitudinal) > this.config.maxAcceleration
    ) {
      this.suspend(s.calibrated ? 'sensors' : 'calibration');
      return;
    }
    const prev = this.sensor;
    const dt = prev ? s.monotonicMs - prev.monotonicMs : 0;
    if (dt > this.config.sensorGapMs) this.suspend('interruption');
    this.sensor = { ...s };
    if (Math.abs(s.longitudinal) <= this.config.quietAcceleration)
      this.quietSince ??= s.monotonicMs;
    else {
      this.quietSince = null;
      this.stopped = false;
    }
    if (
      !this.gps ||
      s.monotonicMs < this.gpsMono ||
      monoNow - this.gpsMono > this.config.predictionMs ||
      this.correctionBlocked
    )
      return;
    if (this.estimate === null) {
      // Recuperação só se ancora em uma referência GPS recém-recebida.
      if (monoNow - this.gpsMono > this.config.sensorAgeMs) return;
      this.estimate = this.gps.speed;
    }
    if (
      prev &&
      dt > 0 &&
      dt <= this.config.sensorGapMs &&
      prev.monotonicMs >= this.gpsMono
    )
      this.estimate = Math.max(
        0,
        Math.min(
          this.config.maxSpeed,
          this.estimate! +
            (((prev.longitudinal! + s.longitudinal) / 2) * dt) / 1000,
        ),
      );
    if (Math.abs(this.estimate! - this.gps.speed!) > this.config.maxDeviation) {
      this.suspend('drift');
      this.correctionBlocked = true;
    } else {
      this.history.push({ at: s.monotonicMs, speed: this.estimate! });
      if (this.history.length > 256) this.history.shift();
    }
  }
  snapshot(wallNow: number, monoNow: number): SpeedSnapshot {
    const age = this.gps ? Math.max(0, monoNow - this.gpsMono) : null;
    const calibrated = this.calibrationValid;
    const accelerationAvailable = !!(
      this.sensor &&
      monoNow - this.sensor.monotonicMs <= this.config.sensorAgeMs
    );
    const assisted =
      this.mode === 'assisted' &&
      accelerationAvailable &&
      this.estimate !== null &&
      age !== null &&
      age <= this.config.predictionMs &&
      !this.correctionBlocked;
    const fresh = age !== null && age <= this.config.gpsAgeMs;
    const speed = assisted
      ? this.stopped
        ? 0
        : this.estimate
      : fresh
        ? this.gps!.speed
        : null;
    return {
      version: 'speed-1',
      preference: this.mode,
      timestamp: wallNow,
      gpsTimestamp: this.gps?.timestamp ?? null,
      gpsAgeMs: age,
      speedMps: speed,
      source: speed === null ? 'unavailable' : assisted ? 'assisted' : 'gps',
      state:
        speed === null
          ? this.gps
            ? 'stale'
            : 'waiting'
          : assisted
            ? 'assisted'
            : this.mode === 'pure'
              ? 'pure-selected'
              : this.reason === 'calibration'
                ? 'sensor-error'
                : 'pure-auto',
      reason: assisted
        ? null
        : this.mode === 'pure'
          ? 'selected'
          : !fresh
            ? 'gps-missing'
            : age! > this.config.predictionMs
              ? 'horizon'
              : this.reason,
      calibrated,
      accelerationAvailable,
      stationary: assisted && this.stopped,
    };
  }
}
