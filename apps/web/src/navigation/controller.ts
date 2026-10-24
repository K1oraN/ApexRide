import {
  lineLength,
  project,
  validLine,
  validCoordinate,
  type Coordinate,
} from '@apex-ride/ride-core/routes';
import { distanceMeters } from '@apex-ride/ride-core';
import type { GpsPreview } from '../services/gps/preview';
import type { LocationReading } from '../services/gps/readings';
import type { Directions } from './types';

export type NavigationState =
  | 'idle'
  | 'planning'
  | 'ready'
  | 'navigating'
  | 'inaccurate'
  | 'off-route'
  | 'recalculating'
  | 'offline'
  | 'arrived'
  | 'paused'
  | 'ended'
  | 'error';
export interface NavigationSnapshot {
  state: NavigationState;
  active: boolean;
  plan: Directions | null;
  name: string;
  nextIndex: number;
  nextDistance: number | null;
  remaining: number | null;
  remainingSeconds: number | null;
  reading: LocationReading | null;
  message: string;
}
const initial = (): NavigationSnapshot => ({
  state: 'idle',
  active: false,
  plan: null,
  name: '',
  nextIndex: 0,
  nextDistance: null,
  remaining: null,
  remainingSeconds: null,
  reading: null,
  message: '',
});
export class NavigationController {
  private value = initial();
  private listeners = new Set<() => void>();
  private ownerId: string | null = null;
  private generation = 0;
  private previous: LocationReading | null = null;
  private along: number | null = null;
  private good = 0;
  private outSince = 0;
  private outCount = 0;
  private arrivalSince = 0;
  private arrivalCount = 0;
  private lastRecalculation = -Infinity;
  constructor(
    readonly gps: GpsPreview,
    private calculate: (points: Coordinate[]) => Promise<Directions>,
    private usedElsewhere: () => boolean,
    private clock = Date.now,
    private online = () => navigator.onLine,
  ) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<NavigationSnapshot>) {
    this.value = { ...this.value, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  isActive = () => this.value.active;
  owner(owner: string | null) {
    if (owner === this.ownerId) return;
    this.end();
    this.ownerId = owner;
    this.publish(initial());
  }
  private resetProgress() {
    this.previous = null;
    this.along = null;
    this.good = 0;
    this.outSince = 0;
    this.outCount = 0;
    this.arrivalSince = 0;
    this.arrivalCount = 0;
  }
  async plan(points: Coordinate[], name: string) {
    if (!this.ownerId || this.value.active) return;
    const generation = ++this.generation;
    this.publish({ state: 'planning', message: '' });
    try {
      const plan = await this.calculate(points);
      if (generation !== this.generation) return;
      if (!validLine(plan.geometry) || !plan.maneuvers.length)
        throw new Error('Rota sem instruções utilizáveis.');
      this.resetProgress();
      this.lastRecalculation = -Infinity;
      this.publish({
        state: 'ready',
        plan,
        name: name.slice(0, 120),
        nextIndex: Math.min(1, plan.maneuvers.length - 1),
        remaining: lineLength(plan.geometry),
        remainingSeconds: plan.durationSeconds,
        nextDistance: null,
        reading: null,
      });
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          state: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível calcular o itinerário.',
        });
    }
  }
  start = () => {
    if (
      !this.ownerId ||
      !this.value.plan ||
      !['ready', 'paused', 'ended'].includes(this.value.state) ||
      this.value.active
    )
      return;
    this.resetProgress();
    this.publish({
      state: this.online() ? 'inaccurate' : 'offline',
      active: true,
      message: 'Aguardando duas posições confiáveis para orientar.',
    });
    this.gps.start();
  };
  private release() {
    if (!this.usedElsewhere()) this.gps.stop();
  }
  pause = () => {
    if (!this.value.active) return;
    this.generation++;
    this.publish({
      state: 'paused',
      active: false,
      message: 'Orientação suspensa. O Ride não foi encerrado.',
    });
    this.release();
  };
  end = () => {
    this.generation++;
    const wasActive = this.value.active;
    this.publish({
      state: 'ended',
      active: false,
      reading: null,
      message: 'Navegação encerrada. Seu Ride foi preservado.',
    });
    this.resetProgress();
    if (wasActive) this.release();
  };
  connectivity = () => {
    if (!this.value.active) return;
    this.resetProgress();
    this.publish({
      state: this.online() ? 'inaccurate' : 'offline',
      nextDistance: null,
      message: this.online()
        ? 'Conexão retomada. Aguardando posição confiável.'
        : 'Sem conexão. Rota mantida; novos cálculos indisponíveis.',
    });
  };
  connect() {
    const off = this.gps.subscribe(() => {
      const gps = this.gps.getSnapshot();
      if (!this.value.active) return;
      if (gps.status === 'available' && gps.reading) this.update(gps.reading);
      else {
        this.resetProgress();
        this.publish({
          state: this.online() ? 'inaccurate' : 'offline',
          nextDistance: null,
          message: gps.message,
        });
      }
    });
    return off;
  }
  update(reading: LocationReading) {
    const plan = this.value.plan;
    if (!this.value.active || !plan || this.value.state === 'recalculating')
      return;
    if (
      !validCoordinate([reading.longitude, reading.latitude]) ||
      !Number.isFinite(reading.timestamp) ||
      !Number.isFinite(reading.accuracy) ||
      reading.accuracy < 0 ||
      reading.accuracy > 20 ||
      this.clock() - reading.timestamp > 10000 ||
      reading.timestamp > this.clock() + 2000
    ) {
      this.resetProgress();
      this.publish({
        state: this.online() ? 'inaccurate' : 'offline',
        nextDistance: null,
        message: 'Precisão GPS insuficiente. Orientação suspensa.',
      });
      return;
    }
    if (this.previous && reading.timestamp <= this.previous.timestamp) return;
    const continuous =
      this.previous && reading.timestamp - this.previous.timestamp <= 10000;
    if (
      continuous &&
      this.previous &&
      distanceMeters(this.previous, reading) >
        ((reading.timestamp - this.previous.timestamp) / 1000) * 70 +
          reading.accuracy +
          this.previous.accuracy
    ) {
      this.good = 0;
      this.publish({
        state: this.online() ? 'inaccurate' : 'offline',
        nextDistance: null,
        message: 'Salto GPS descartado. Aguardando continuidade.',
      });
      return;
    }
    const location: Coordinate = [reading.longitude, reading.latitude];
    const matched = project(
      plan.geometry,
      location,
      continuous ? this.along : null,
    );
    const tolerance = Math.max(25, reading.accuracy * 2);
    if (matched.distance > tolerance) {
      this.previous = reading;
      this.along = null;
      this.outSince ||= reading.timestamp;
      this.outCount++;
      this.good = 0;
      this.arrivalCount = 0;
      this.arrivalSince = 0;
      const persistent =
        this.outCount >= 3 && reading.timestamp - this.outSince >= 5000;
      this.publish({
        state: this.online() ? 'off-route' : 'offline',
        reading,
        nextDistance: null,
        message: persistent
          ? 'Desvio confirmado. Aguardando novo itinerário.'
          : 'Posição fora da rota. Confirmando sinal.',
      });
      if (
        persistent &&
        this.online() &&
        this.clock() - this.lastRecalculation >= 30000
      )
        void this.recalculate(location);
      return;
    }
    this.outSince = 0;
    this.outCount = 0;
    if (continuous && this.previous && this.along !== null) {
      const moved = distanceMeters(this.previous, reading);
      if (
        Math.abs(matched.along - this.along) >
          moved + Math.max(25, reading.accuracy + this.previous.accuracy) ||
        moved >
          ((reading.timestamp - this.previous.timestamp) / 1000) * 70 +
            reading.accuracy +
            this.previous.accuracy
      ) {
        this.good = 0;
        this.publish({
          state: 'inaccurate',
          nextDistance: null,
          message: 'Salto GPS descartado. Aguardando continuidade.',
        });
        return;
      }
    } else {
      this.good = 0;
      this.arrivalCount = 0;
      this.arrivalSince = 0;
    }
    const advanced = this.along !== null && matched.along > this.along + 3;
    this.previous = reading;
    this.along = matched.along;
    this.good++;
    const remaining = Math.max(0, matched.total - matched.along);
    if (this.good < 2) {
      this.publish({
        reading,
        state: this.online() ? 'inaccurate' : 'offline',
        nextDistance: null,
        message: 'Confirmando posição na rota.',
      });
      return;
    }
    let nextIndex = this.value.nextIndex;
    if (
      advanced &&
      plan.maneuvers[nextIndex] &&
      matched.along > plan.maneuvers[nextIndex]!.along + 12
    )
      nextIndex = Math.min(nextIndex + 1, plan.maneuvers.length - 1);
    const target = plan.maneuvers[nextIndex]!;
    const nextDistance = Math.max(0, target.along - matched.along);
    const endpoint = plan.geometry.coordinates.at(-1)!;
    const atEnd =
      remaining < 25 &&
      distanceMeters(reading, {
        longitude: endpoint[0],
        latitude: endpoint[1],
      }) <= Math.max(15, reading.accuracy);
    if (atEnd) {
      this.arrivalSince ||= reading.timestamp;
      this.arrivalCount++;
    } else {
      this.arrivalSince = 0;
      this.arrivalCount = 0;
    }
    const arrived =
      this.arrivalCount >= 3 && reading.timestamp - this.arrivalSince >= 4000;
    this.publish({
      reading,
      nextIndex,
      remaining,
      remainingSeconds:
        plan.durationSeconds === null
          ? null
          : (plan.durationSeconds * remaining) / matched.total,
      nextDistance,
      state: arrived ? 'arrived' : this.online() ? 'navigating' : 'offline',
      active: !arrived,
      message: arrived
        ? 'Chegada confirmada por leituras consecutivas.'
        : this.online()
          ? ''
          : 'Sem conexão. Rota preservada; recálculo indisponível.',
    });
    if (arrived) this.release();
  }
  recalculate = async (position?: Coordinate) => {
    const old = this.value.plan,
      reading = this.value.reading;
    const current =
      position ??
      (reading ? ([reading.longitude, reading.latitude] as Coordinate) : null);
    if (
      !old ||
      !this.value.active ||
      !current ||
      !reading ||
      reading.accuracy > 20 ||
      this.clock() - reading.timestamp > 10000 ||
      reading.timestamp > this.clock() + 2000 ||
      !this.online() ||
      this.value.state === 'recalculating' ||
      this.clock() - this.lastRecalculation < 30000
    )
      return;
    this.lastRecalculation = this.clock();
    const generation = ++this.generation;
    const leg = old.maneuvers[this.value.nextIndex]?.legIndex ?? 0;
    const pending = old.waypoints.slice(leg + 1);
    if (!pending.length) return;
    this.publish({
      state: 'recalculating',
      message: 'Recalculando até as paradas pendentes…',
      nextDistance: null,
    });
    try {
      const plan = await this.calculate([current, ...pending]);
      if (generation !== this.generation) return;
      this.resetProgress();
      this.publish({
        plan,
        state: 'inaccurate',
        remaining: plan.distanceMeters,
        remainingSeconds: plan.durationSeconds,
        nextIndex: Math.min(1, plan.maneuvers.length - 1),
        message: 'Rota atualizada. Aguardando posição confiável.',
      });
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          state: this.online() ? 'off-route' : 'offline',
          message:
            error instanceof Error
              ? error.message
              : 'Recálculo indisponível. Rota anterior mantida.',
          nextDistance: null,
        });
    }
  };
}
