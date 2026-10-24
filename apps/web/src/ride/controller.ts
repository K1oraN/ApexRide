import {
  acceptablePoint,
  calculateMetrics,
  reliableSpeed,
  RIDE_RULES,
  type ActiveInterval,
  type RidePayload,
  type RidePoint,
} from '@apex-ride/ride-core';
import { analyzeTelemetry } from '@apex-ride/ride-core/telemetry';
import { GpsPreview, type GpsSnapshot } from '../services/gps/preview';
import type { Motorcycle } from '../services/motorcycles';
import { rideService, type SaveConfirmation } from '../services/rides';
import { MotionTelemetry } from '../services/motion/telemetry';
import { SpeedTelemetry } from '../services/speed/telemetry';
import { TelemetrySession } from '../services/telemetry/session';
import {
  RouteTracker,
  LapDetector,
  type Lap,
  type RoutePlan,
  type RouteProgress,
} from '@apex-ride/ride-core/routes';

export type RideState =
  | 'preparation'
  | 'waiting-gps'
  | 'running'
  | 'paused'
  | 'finished'
  | 'saving'
  | 'saved'
  | 'discarded'
  | 'error';
export interface Activity {
  ownerId: string;
  bike: Motorcycle;
  payload: RidePayload;
  activeStart: number | null;
}
export interface RideSnapshot {
  selectedEvent?: { id: string; authorizationId: string; title: string } | null;
  selectedRoute: RoutePlan | null;
  routeProgress: RouteProgress | null;
  laps: Lap[];
  inconclusiveLaps: number;
  savedLocally?: boolean;
  state: RideState;
  activity: Activity | null;
  gps: GpsSnapshot;
  error: string | null;
  savedId: string | null;
  now: number;
}
export class RideController {
  gpsShared = () => false;
  setGpsShared = (shared: () => boolean) => {
    this.gpsShared = shared;
  };
  selectEvent = (event: RideSnapshot['selectedEvent']) => {
    if (this.snapshot.activity || this.pending) return false;
    this.publish({ selectedEvent: event ?? null });
    return true;
  };
  video: {
    settle: () => Promise<void>;
    discard: (owner: string, clientId: string) => Promise<void>;
  } | null = null;
  offline: {
    changed: () => void;
    save: (activity: Activity) => Promise<SaveConfirmation>;
    discard: (activity: Activity) => Promise<void>;
  } | null = null;
  readonly speed = new SpeedTelemetry();
  readonly telemetry = new TelemetrySession();
  private snapshot: RideSnapshot;
  private listeners = new Set<() => void>();
  private pending: {
    ownerId: string;
    bike: Motorcycle;
    mode: RidePayload['mode'];
    visibility: RidePayload['visibility'];
  } | null = null;
  private requestedAt = 0;
  private gap = true;
  private frozenSave: RidePayload | null = null;
  private routeTracker: RouteTracker | null = null;
  private lapDetector: LapDetector | null = null;
  selectRoute = (plan: RoutePlan | null) => {
    if (this.snapshot.activity || this.pending) return false;
    this.routeTracker = plan ? new RouteTracker(plan) : null;
    this.publish({
      selectedRoute: plan,
      routeProgress: this.routeTracker?.snapshot() ?? null,
      laps: [],
      inconclusiveLaps: 0,
    });
    return true;
  };
  abandonRoute = () => {
    const activity = this.snapshot.activity;
    if (!activity?.payload.route || this.snapshot.state !== 'paused') return;
    this.routeTracker = null;
    this.lapDetector?.interrupt();
    const inconclusiveLaps =
      this.lapDetector?.inconclusive ?? this.snapshot.inconclusiveLaps;
    this.lapDetector = null;
    this.publish({
      inconclusiveLaps,
      activity: {
        ...activity,
        payload: {
          ...activity.payload,
          route: {
            ...activity.payload.route,
            abandoned: true,
            abandonedAt: this.clock(),
          },
        },
      },
    });
  };
  constructor(
    readonly gps = new GpsPreview(),
    private readonly saveRequest = rideService.save,
    private readonly clock = Date.now,
    readonly motion = new MotionTelemetry(),
  ) {
    this.snapshot = {
      selectedRoute: null,
      routeProgress: null,
      laps: [],
      inconclusiveLaps: 0,
      state: 'preparation',
      activity: null,
      gps: gps.getSnapshot(),
      error: null,
      savedId: null,
      now: clock(),
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<RideSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      now: Math.max(this.snapshot.now, this.clock()),
    };
    if (this.snapshot.activity && !this.snapshot.activity.payload.endedAt)
      this.motion.session(
        this.snapshot.activity.payload.startedAt,
        this.snapshot.state === 'running',
      );
    this.speed.session(
      this.snapshot.state,
      this.snapshot.activity?.payload.startedAt ?? null,
    );
    this.listeners.forEach((fn) => fn());
    this.offline?.changed();
  }
  connect = () => {
    const offGps = this.gps.subscribe(this.receive);
    const offMotion = this.motion.connect();
    const offSpeed = this.speed.connect(this.gps, this.motion);
    const offMode = this.speed.onModeChange(() => {
      if (this.snapshot.state === 'running')
        this.telemetry.interrupt(this.clock(), 'speed-mode');
    });
    return () => {
      offMode();
      offSpeed();
      offGps();
      offMotion();
    };
  };
  tick = () => {
    const { activity, state } = this.snapshot;
    if (
      activity &&
      ['running', 'paused', 'waiting-gps'].includes(state) &&
      this.clock() - activity.payload.startedAt >= RIDE_RULES.maxDurationMs
    ) {
      this.finish();
      this.publish({
        error:
          'Limite de 48 horas atingido. A coleta foi encerrada; revise e salve esta atividade.',
      });
      return;
    }
    if (
      this.snapshot.activity &&
      ['running', 'paused', 'waiting-gps'].includes(this.snapshot.state)
    )
      this.publish({});
  };
  activateGps = () => {
    if (!this.snapshot.activity && !this.pending) this.gps.start();
  };
  stopPreview = () => {
    if (!this.snapshot.activity && !this.pending) {
      if (!this.gpsShared()) this.gps.stop();
      this.motion.stop();
    }
  };
  retryGps = () => {
    if (
      ['saving', 'saved', 'finished'].includes(this.snapshot.state) ||
      (this.snapshot.state === 'error' &&
        this.snapshot.activity?.payload.endedAt)
    )
      return;
    this.gap = true;
    this.gps.retry();
  };
  start = (
    ownerId: string,
    bike: Motorcycle | undefined,
    mode: RidePayload['mode'],
    visibility: RidePayload['visibility'],
  ) => {
    if (
      !['preparation', 'discarded', 'saved', 'error'].includes(
        this.snapshot.state,
      ) ||
      this.snapshot.activity
    )
      return;
    if (!ownerId || !bike || !['passeio', 'pista', 'misto'].includes(mode)) {
      this.publish({
        state: 'error',
        error:
          'Entre na conta e selecione uma moto da sua garagem e um modo válido.',
      });
      return;
    }
    this.pending = { ownerId, bike, mode, visibility };
    this.routeTracker = this.snapshot.selectedRoute
      ? new RouteTracker(this.snapshot.selectedRoute)
      : null;
    this.lapDetector = this.snapshot.selectedRoute
      ? new LapDetector(this.snapshot.selectedRoute, mode)
      : null;
    this.requestedAt = this.clock();
    this.gap = true;
    this.publish({ state: 'waiting-gps', error: null, savedId: null });
    this.gps.retry();
  };
  private receive = () => {
    const gps = this.gps.getSnapshot();
    this.publish({ gps });
    const state = this.snapshot.state;
    if (gps.status !== 'available' || !gps.reading) {
      this.gap = true;
      this.routeTracker?.interrupt();
      this.lapDetector?.interrupt();
      if (this.routeTracker)
        this.publish({ routeProgress: this.routeTracker.snapshot() });
      if (
        state === 'waiting-gps' &&
        (['denied', 'insecure', 'unsupported'].includes(gps.status) ||
          (gps.status === 'unavailable' && !gps.active))
      ) {
        if (this.snapshot.activity)
          this.publish({ state: 'paused', error: gps.message });
        else {
          this.pending = null;
          this.publish({ state: 'error', error: gps.message });
        }
      }
      return;
    }
    if (state !== 'running' && state !== 'waiting-gps') return;
    const r = gps.reading;
    if (state === 'waiting-gps' && r.timestamp < this.requestedAt) return;
    if (
      r.timestamp > this.clock() ||
      this.clock() - r.timestamp >= RIDE_RULES.gapMs
    )
      return;
    let activity = this.snapshot.activity;
    if (!activity) {
      if (!this.pending) return;
      const p = this.pending;
      activity = {
        ownerId: p.ownerId,
        bike: p.bike,
        activeStart: r.timestamp,
        payload: {
          ...(this.snapshot.selectedEvent
            ? {
                event: {
                  id: this.snapshot.selectedEvent.id,
                  authorizationId: this.snapshot.selectedEvent.authorizationId,
                },
              }
            : {}),
          ...(this.snapshot.selectedRoute
            ? { route: { plan: this.snapshot.selectedRoute, abandoned: false } }
            : {}),
          clientId: crypto.randomUUID(),
          motorcycleId: p.bike.id,
          mode: p.mode,
          visibility: p.visibility,
          startedAt: r.timestamp,
          endedAt: 0,
          intervals: [],
          points: [],
        },
      };
      this.pending = null;
    }
    const previous = activity.payload.points.at(-1);
    if (previous && r.timestamp <= previous.timestamp) return;
    const segment = previous
      ? previous.segment +
        (this.gap || r.timestamp - previous.timestamp >= RIDE_RULES.gapMs
          ? 1
          : 0)
      : 0;
    const point: RidePoint = {
      latitude: r.latitude,
      longitude: r.longitude,
      timestamp: r.timestamp,
      accuracy: r.accuracy,
      speed: r.speed,
      heading: r.heading,
      altitude: r.altitude,
      segment,
    };
    if (!acceptablePoint(point, previous)) {
      this.gap = true;
      return;
    }
    if (state === 'waiting-gps')
      activity = { ...activity, activeStart: r.timestamp };
    // Limite explícito, sem truncamento: preserva os 50.000 pontos e oferece resumo.
    if (
      activity.payload.points.length >= RIDE_RULES.maxPoints ||
      this.clock() - activity.payload.startedAt >= RIDE_RULES.maxDurationMs
    ) {
      this.finish();
      this.publish({
        error:
          'Limite de 50.000 pontos ou 48 horas atingido. Finalize e salve esta atividade antes de começar outra.',
      });
      return;
    }
    this.gap = false;
    this.telemetry.receive(activity.payload, point, previous);
    this.lapDetector?.push(point);
    this.publish({
      laps: this.lapDetector ? [...this.lapDetector.laps] : this.snapshot.laps,
      inconclusiveLaps:
        this.lapDetector?.inconclusive ?? this.snapshot.inconclusiveLaps,
      routeProgress:
        this.routeTracker?.update(point) ?? this.snapshot.routeProgress,
      state: 'running',
      activity: {
        ...activity,
        payload: {
          ...activity.payload,
          points: [...activity.payload.points, point],
        },
      },
    });
  };
  private closeInterval(activity: Activity, now: number): Activity {
    if (activity.activeStart === null) return activity;
    const end = Math.min(
      activity.payload.startedAt + RIDE_RULES.maxDurationMs,
      Math.max(
        activity.activeStart,
        now,
        activity.payload.points.at(-1)?.timestamp ?? 0,
      ),
    );
    return {
      ...activity,
      activeStart: null,
      payload: {
        ...activity.payload,
        intervals: [
          ...activity.payload.intervals,
          { start: activity.activeStart, end },
        ],
      },
    };
  }
  pause = () => {
    if (this.snapshot.state !== 'running' || !this.snapshot.activity) return;
    const activity = this.closeInterval(this.snapshot.activity, this.clock());
    this.telemetry.pause();
    this.routeTracker?.interrupt();
    this.lapDetector?.interrupt();
    this.publish({
      state: 'paused',
      activity,
      routeProgress: this.routeTracker?.snapshot() ?? null,
    });
    this.gap = true;
    if (!this.gpsShared()) this.gps.stop();
  };
  resume = () => {
    if (this.snapshot.state !== 'paused' || !this.snapshot.activity) return;
    if (
      this.snapshot.activity.payload.intervals.length >= RIDE_RULES.maxIntervals
    ) {
      this.publish({
        error: 'Limite de pausas atingido. Finalize esta atividade.',
      });
      return;
    }
    this.requestedAt = this.clock();
    this.gap = true;
    this.publish({ state: 'waiting-gps', error: null });
    this.gps.retry();
  };
  finish = () => {
    const { state, activity } = this.snapshot;
    if (!activity || !['running', 'paused', 'waiting-gps'].includes(state))
      return;
    const endedAt = Math.min(
      activity.payload.startedAt + RIDE_RULES.maxDurationMs,
      Math.max(
        this.clock(),
        activity.payload.startedAt + 1,
        activity.payload.points.at(-1)?.timestamp ?? 0,
        activity.payload.intervals.at(-1)?.end ?? 0,
      ),
    );
    const closed = this.closeInterval(activity, endedAt);
    const speedProcessing = this.speed.finish({ ...closed.payload, endedAt });
    const motion = this.motion.finish();
    const consolidated = {
      ...closed.payload,
      endedAt,
      ...(motion ? { motion } : {}),
      ...(speedProcessing ? { speedProcessing } : {}),
    };
    const telemetry = this.telemetry.finish(consolidated);
    this.publish({
      state: 'finished',
      activity: {
        ...closed,
        payload: {
          ...closed.payload,
          endedAt,
          ...(motion ? { motion } : {}),
          ...(speedProcessing ? { speedProcessing } : {}),
          ...(telemetry ? { telemetry } : {}),
        },
      },
      error: null,
    });
    this.gps.stop();
  };
  cancelWaiting = () => {
    if (this.snapshot.state !== 'waiting-gps') return;
    this.pending = null;
    this.publish({ state: this.snapshot.activity ? 'paused' : 'preparation' });
    this.gps.stop();
  };
  setVisibility = (visibility: RidePayload['visibility']) => {
    if (
      this.snapshot.state !== 'finished' ||
      !this.snapshot.activity ||
      this.frozenSave
    )
      return;
    this.publish({
      activity: {
        ...this.snapshot.activity,
        payload: { ...this.snapshot.activity.payload, visibility },
      },
    });
  };
  save = async (ownerId: string): Promise<void> => {
    const { state, activity } = this.snapshot;
    if (!activity?.payload.endedAt || !['finished', 'error'].includes(state))
      return;
    if (activity.ownerId !== ownerId) {
      this.publish({
        state: 'error',
        error: 'Entre na conta que iniciou esta atividade para salvar.',
      });
      return;
    }
    this.frozenSave ??= activity.payload;
    const ticket = this.frozenSave;
    this.publish({ state: 'saving', error: null });
    try {
      if (this.video) await this.video.settle();
      const response: SaveConfirmation = this.offline
        ? await this.offline.save({ ...activity, payload: ticket })
        : await this.saveRequest(ticket);
      if (response.status !== 'ok' || !response.id)
        throw new Error('Resposta do servidor inválida.');
      this.publish({
        state: 'saved',
        savedId: response.local ? null : response.id,
        savedLocally: Boolean(response.local),
      });
    } catch (error) {
      this.publish({
        state: 'error',
        error: `Salvamento não confirmado. ${error instanceof Error ? error.message : 'Tente novamente.'}`,
      });
    }
  };
  reset = () => {
    if (!['saved', 'discarded'].includes(this.snapshot.state)) return;
    this.frozenSave = null;
    this.speed.clear();
    this.motion.clear();
    this.telemetry.clear();
    this.publish({
      state: 'preparation',
      activity: null,
      error: null,
      savedId: null,
      savedLocally: false,
      selectedEvent: null,
      selectedRoute: null,
      routeProgress: null,
      laps: [],
      inconclusiveLaps: 0,
    });
  };
  discard = async () => {
    if (
      this.snapshot.state === 'saving' ||
      this.snapshot.state === 'saved' ||
      !this.snapshot.activity?.payload.endedAt
    )
      return;
    try {
      if (this.video)
        await this.video.discard(
          this.snapshot.activity.ownerId,
          this.snapshot.activity.payload.clientId,
        );
      if (this.offline) {
        await this.offline.discard(this.snapshot.activity);
      }
    } catch (error) {
      this.publish({
        error: error instanceof Error ? error.message : 'Falha ao descartar.',
      });
      return;
    }
    this.pending = null;
    this.frozenSave = null;
    this.speed.clear();
    this.motion.clear();
    this.telemetry.clear();
    this.publish({
      state: 'discarded',
      activity: null,
      selectedEvent: null,
      error: null,
      savedId: null,
    });
    this.gps.stop();
  };
  recover = (
    activity: Activity,
    recordedAt: number,
    confirmation?: SaveConfirmation,
    saved = false,
  ) => {
    if (this.snapshot.activity || this.pending)
      throw new Error('Finalize a sessão atual antes de revisar outra.');
    const payload = activity.payload;
    if (!payload.endedAt) {
      const end = Math.max(
        payload.startedAt + 1,
        payload.points.at(-1)?.timestamp ?? 0,
        payload.intervals.at(-1)?.end ?? 0,
        recordedAt,
      );
      const closed = this.closeInterval(activity, end);
      activity = { ...closed, payload: { ...closed.payload, endedAt: end } };
      if (payload.telemetry) {
        // Recompute only from committed GPS/sensors and persisted interruptions.
        activity.payload.telemetry = analyzeTelemetry(
          activity.payload,
          payload.telemetry.interruptions,
        );
      }
    }
    this.gap = true;
    const followedPoints = payload.route?.abandoned
      ? payload.points.filter((p) => p.timestamp <= payload.route!.abandonedAt!)
      : payload.points;
    this.routeTracker = payload.route
      ? new RouteTracker(payload.route.plan)
      : null;
    if (this.routeTracker)
      for (const point of followedPoints) this.routeTracker.update(point);
    this.lapDetector = payload.route
      ? new LapDetector(payload.route.plan, payload.mode)
      : null;
    if (this.lapDetector)
      for (const point of followedPoints) this.lapDetector.push(point);
    if (payload.route?.abandoned) this.lapDetector?.interrupt();
    this.publish({
      activity,
      selectedRoute: payload.route?.plan ?? null,
      routeProgress: this.routeTracker?.snapshot() ?? null,
      laps: [...(this.lapDetector?.laps ?? [])],
      inconclusiveLaps: this.lapDetector?.inconclusive ?? 0,
      state: saved ? 'saved' : 'finished',
      savedId: confirmation?.id ?? null,
      savedLocally: saved && !confirmation,
      error: payload.endedAt
        ? null
        : 'Sessão interrompida recuperada até a última gravação local. O período com a página fechada não foi registrado.',
    });
  };
  confirmSaved = (id: string) => {
    if (this.snapshot.state === 'saved' && this.snapshot.savedLocally)
      this.publish({ savedId: id, savedLocally: false });
  };
  accountEnded = () => {
    if (this.snapshot.state === 'running') this.pause();
    else if (this.snapshot.state === 'waiting-gps') this.cancelWaiting();
    this.gps.stop();
    this.motion.stop();
  };
}

export function rideMetrics(snapshot: RideSnapshot) {
  const a = snapshot.activity;
  const end = a?.payload.endedAt || snapshot.now;
  const intervals: ActiveInterval[] = a
    ? [
        ...a.payload.intervals,
        ...(a.activeStart === null
          ? []
          : [{ start: a.activeStart, end: Math.max(a.activeStart, end) }]),
      ]
    : [];
  return calculateMetrics(
    a?.payload.startedAt ?? end,
    end,
    intervals,
    a?.payload.points ?? [],
  );
}
export function rideGps(snapshot: RideSnapshot): GpsSnapshot {
  const points = snapshot.activity?.payload.points;
  if (!points?.length) return snapshot.gps;
  const segments: (RidePoint & { altitudeAccuracy: null })[][] = [];
  for (const p of points) {
    if (p.segment !== segments.at(-1)?.at(-1)?.segment) segments.push([]);
    segments.at(-1)!.push({ ...p, altitudeAccuracy: null });
  }
  const last = points.at(-1)!;
  const recording = snapshot.state === 'running';
  return {
    ...snapshot.gps,
    segments,
    reading: recording
      ? snapshot.gps.reading
      : { ...last, altitudeAccuracy: null },
    speedKmh:
      recording && snapshot.gps.status === 'available'
        ? reliableSpeed(last, points.at(-2))
        : null,
  };
}
