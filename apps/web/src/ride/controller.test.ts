import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RideController, rideGps, rideMetrics } from './controller';
import { GpsPreview } from '../services/gps/preview';
import type { Motorcycle } from '../services/motorcycles';
import { emitMotion } from '../services/motion/fixtures';
import { PerformanceDetector } from '@apex-ride/ride-core/telemetry';
const bike: Motorcycle = {
  id: crypto.randomUUID(),
  brand: 'Honda',
  model: 'CB 650R',
  year: 2024,
  displacementCc: 649,
  isPrimary: true,
  photoUrl: null,
  createdAt: '',
  updatedAt: '',
};
let callback: PositionCallback;
let clear: ReturnType<typeof vi.fn>;
let controller: RideController;
let disconnect: () => void;
function emit(longitude = -35.735, speed: number | null = 10) {
  callback({
    timestamp: Date.now(),
    coords: {
      latitude: -9.665,
      longitude,
      accuracy: 8,
      speed,
      heading: 90,
      altitude: null,
      altitudeAccuracy: null,
    },
  } as GeolocationPosition);
}
function begin() {
  controller.start('owner', bike, 'passeio', 'private');
  emit();
}
describe('Controlador de sessão com GPS simulado', () => {
  it('Etapa 4: pausa, finalização e descarte preservam GPS usado pela navegação', async () => {
    controller.setNavigationGpsShared(() => true);
    begin();
    vi.advanceTimersByTime(2000);
    emit(-35.7349);
    controller.pause();
    expect(clear).not.toHaveBeenCalled();
    controller.finish();
    expect(clear).not.toHaveBeenCalled();
    expect(controller.getSnapshot().activity?.payload.visibility).toBe(
      'private',
    );
    await controller.discard();
    expect(clear).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe('discarded');
    controller.setNavigationGpsShared(() => false);
    controller.stopPreview();
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it('Etapa 4: cancelar espera de Ride mantém navegação e não inicia outro watch', () => {
    controller.setNavigationGpsShared(() => true);
    controller.gps.start();
    controller.start('owner', bike, 'passeio', 'private');
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    controller.cancelWaiting();
    expect(clear).not.toHaveBeenCalled();
  });
  it('11C abandonar em pausa conserva plano e continua GPS sem acompanhar', () => {
    const plan = {
      id: crypto.randomUUID(),
      version: 1,
      name: 'Rota sintética',
      kind: 'route' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-35.735, -9.665],
          [-35.725, -9.665],
        ] as [number, number][],
      },
      distanceMeters: 1100,
      verification: 'suggested' as const,
      startLine: null,
      direction: null,
    };
    controller.selectRoute(plan);
    begin();
    vi.advanceTimersByTime(1000);
    emit(-35.7349);
    controller.pause();
    controller.abandonRoute();
    const abandonedAt =
      controller.getSnapshot().activity!.payload.route!.abandonedAt;
    controller.resume();
    vi.advanceTimersByTime(1000);
    emit(-35.7348);
    controller.finish();
    expect(controller.getSnapshot().activity!.payload.route).toMatchObject({
      abandoned: true,
      abandonedAt,
    });
    expect(controller.getSnapshot().activity!.payload.points).toHaveLength(3);
    const restored = new RideController();
    restored.recover(controller.getSnapshot().activity!, Date.now());
    expect(restored.getSnapshot().activity!.payload.route?.abandonedAt).toBe(
      abandonedAt,
    );
  });
  it('11C seleciona percurso, preserva GPS real, pausa e finaliza incompleto', () => {
    const plan = {
      id: crypto.randomUUID(),
      version: 1,
      name: 'Rota sintética',
      kind: 'route' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-35.735, -9.665],
          [-35.725, -9.665],
        ] as [number, number][],
      },
      distanceMeters: 1100,
      verification: 'suggested' as const,
      startLine: null,
      direction: null,
    };
    expect(controller.selectRoute(plan)).toBe(true);
    begin();
    vi.advanceTimersByTime(1000);
    emit(-35.7349);
    expect(controller.getSnapshot().activity!.payload.route?.plan).toEqual(
      plan,
    );
    expect(controller.getSnapshot().activity!.payload.points).toHaveLength(2);
    expect(controller.selectRoute(null)).toBe(false);
    controller.pause();
    expect(controller.getSnapshot().routeProgress?.determinate).toBe(false);
    controller.resume();
    vi.advanceTimersByTime(1000);
    emit(-35.7348);
    controller.finish();
    expect(controller.getSnapshot().state).toBe('finished');
    expect(controller.getSnapshot().routeProgress?.completed).toBe(false);
    const recovered = new RideController();
    recovered.recover(controller.getSnapshot().activity!, Date.now());
    expect(recovered.getSnapshot().selectedRoute?.id).toBe(plan.id);
    expect(recovered.getSnapshot().activity!.payload.points).toHaveLength(3);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    clear = vi.fn();
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((ok: PositionCallback) => {
          callback = ok;
          return 1;
        }),
        clearWatch: clear,
      },
    });
    controller = new RideController(new GpsPreview());
    disconnect = controller.connect();
  });
  afterEach(() => {
    disconnect();
    controller.gps.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('falha avançada mantém sessão e GPS utilizáveis, com resultado indisponível', () => {
    const push = vi
      .spyOn(PerformanceDetector.prototype, 'push')
      .mockImplementationOnce(() => {
        throw new Error('processing');
      });
    try {
      controller.start('owner', bike, 'misto', 'private');
      emit();
      vi.advanceTimersByTime(500);
      emit(-35.73499);
      expect(controller.getSnapshot().state).toBe('running');
      expect(controller.getSnapshot().activity!.payload.points).toHaveLength(2);
      expect(controller.telemetry.failed).toBe(true);
      controller.finish();
      expect(
        controller.getSnapshot().activity!.payload.telemetry,
      ).toBeUndefined();
    } finally {
      push.mockRestore();
    }
  });
  it.each(['pista', 'misto'] as const)(
    'integra detecção passiva, resumo e descarte em %s sem sensores',
    (mode) => {
      controller.start('owner', bike, mode, 'private');
      const speeds = [
        0, 0, 0, 0, 0, 5, 10, 15, 20, 25, 28, 30, 30, 27.5, 22.5, 17.5, 12.5,
        7.5, 2.5, 0, 0, 0, 0, 0,
      ];
      let meters = 0;
      for (let i = 0; i < speeds.length; i++) {
        if (i) {
          vi.advanceTimersByTime(500);
          meters += ((speeds[i - 1]! + speeds[i]!) / 2) * 0.5;
        }
        emit(-35.735 + meters / 109600, speeds[i]!);
      }
      expect(
        controller.telemetry.events.filter((e) => e.status === 'estimated'),
      ).toHaveLength(2);
      controller.finish();
      const data = controller.getSnapshot().activity!.payload;
      expect(data.telemetry!.stats.accelerationCount).toBe(1);
      expect(data.telemetry!.stats.brakingCount).toBe(1);
      expect(data.telemetry!.events[0]!.force).toBeNull();
      expect(data.motion).toBeUndefined();
      controller.discard();
      expect(controller.telemetry.events).toHaveLength(0);
    },
  );
  it('passeio não calcula eventos esportivos e preserva GPS Assistido', () => {
    begin();
    vi.advanceTimersByTime(500);
    emit();
    controller.finish();
    expect(
      controller.getSnapshot().activity!.payload.telemetry,
    ).toBeUndefined();
    expect(
      controller.getSnapshot().activity!.payload.speedProcessing,
    ).toBeDefined();
  });
  it('troca de modo de velocidade encerra evento em andamento sem afetar GPS ou mapa', () => {
    controller.start('owner', bike, 'misto', 'private');
    emit(-35.735, 0);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(500);
      emit(-35.735, 0);
    }
    vi.advanceTimersByTime(500);
    emit(-35.73499, 5);
    controller.speed.setMode('pure');
    vi.advanceTimersByTime(500);
    emit(-35.73495, 10);
    controller.finish();
    const b = controller.getSnapshot().activity!.payload;
    expect(b.telemetry!.events[0]!.reason).toBe('speed-mode');
    expect(b.telemetry!.stats.accelerationCount).toBe(0);
    expect(b.points).toHaveLength(7);
    expect(b.telemetry!.interruptions).toHaveLength(1);
  });
  it('não solicita GPS automaticamente e bloqueia transições inválidas', () => {
    controller.pause();
    controller.resume();
    controller.finish();
    expect(controller.getSnapshot().state).toBe('preparation');
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
    controller.start('', undefined, 'passeio', 'public');
    expect(controller.getSnapshot().state).toBe('error');
  });
  it('aguarda GPS, cria uma única sessão e bloqueia seleção durante a atividade', () => {
    controller.start('owner', bike, 'misto', 'public');
    expect(controller.getSnapshot().state).toBe('waiting-gps');
    emit();
    const id = controller.getSnapshot().activity!.payload.clientId;
    controller.start('owner', bike, 'pista', 'private');
    expect(controller.getSnapshot().activity!.payload.clientId).toBe(id);
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
  });
  it('pausa e retoma sem ponte nem tempo pausado; finaliza uma vez e encerra recursos', () => {
    begin();
    vi.advanceTimersByTime(1000);
    emit(-35.7349);
    vi.advanceTimersByTime(4000);
    controller.pause();
    const before = rideMetrics(controller.getSnapshot()).distanceMeters;
    vi.advanceTimersByTime(10_000);
    emit(-35.734);
    expect(rideMetrics(controller.getSnapshot()).distanceMeters).toBe(before);
    controller.resume();
    expect(controller.getSnapshot().state).toBe('waiting-gps');
    vi.advanceTimersByTime(1000);
    emit(-35.734);
    vi.advanceTimersByTime(5000);
    controller.finish();
    const final = controller.getSnapshot();
    expect(rideMetrics(final).activeMs).toBe(10_000);
    expect(rideMetrics(final).pausedMs).toBe(11_000);
    expect(final.activity!.payload.points.at(-1)!.segment).toBe(1);
    expect(rideMetrics(final).distanceMeters).toBe(before);
    controller.finish();
    controller.resume();
    expect(controller.getSnapshot().activity!.payload.endedAt).toBe(
      final.activity!.payload.endedAt,
    );
    expect(clear).toHaveBeenCalled();
    expect(rideGps(final).segments).toHaveLength(2);
  });
  it('lacuna de sinal separa segmentos sem reconstrução', () => {
    begin();
    vi.advanceTimersByTime(30_000);
    emit(-35.734);
    controller.finish();
    expect(rideGps(controller.getSnapshot()).segments).toHaveLength(2);
    expect(rideMetrics(controller.getSnapshot()).distanceMeters).toBe(0);
  });
  it('rejeita pontos ruins e não inventa velocidade', () => {
    begin();
    vi.advanceTimersByTime(1000);
    emit(0);
    expect(controller.getSnapshot().activity!.payload.points).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    emit(-35.7349, null);
    expect(rideGps(controller.getSnapshot()).speedKmh).toBeNull();
  });
  it('falha de salvamento preserva dados, impede envio duplo e reutiliza payload idêntico', async () => {
    disconnect();
    controller.gps.stop();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue({ status: 'ok', id: 'saved' });
    controller = new RideController(new GpsPreview(), save);
    disconnect = controller.connect();
    begin();
    vi.advanceTimersByTime(1000);
    controller.finish();
    await controller.save('other');
    expect(save).not.toHaveBeenCalled();
    await controller.save('owner');
    expect(controller.getSnapshot().state).toBe('error');
    expect(controller.getSnapshot().activity!.payload.points).toHaveLength(1);
    controller.setVisibility('public');
    const first = save.mock.calls[0]![0];
    const pending = controller.save('owner');
    await controller.save('owner');
    await pending;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toBe(first);
    expect(controller.getSnapshot().state).toBe('saved');
  });
  it('descarta sem envio, remove coordenadas e permite nova preparação', () => {
    begin();
    vi.advanceTimersByTime(1000);
    controller.finish();
    controller.discard();
    expect(controller.getSnapshot().state).toBe('discarded');
    expect(controller.getSnapshot().activity).toBeNull();
    expect(controller.getSnapshot().gps.reading).toBeNull();
    controller.reset();
    expect(controller.getSnapshot().state).toBe('preparation');
  });
  it('cancelar espera de retomada mantém pausa e logout pausa a coleta', () => {
    begin();
    vi.advanceTimersByTime(1000);
    controller.accountEnded();
    expect(controller.getSnapshot().state).toBe('paused');
    controller.resume();
    controller.cancelWaiting();
    expect(controller.getSnapshot().state).toBe('paused');
  });
  it('limite de duração encerra mesmo sem novas leituras e preserva horário limite', () => {
    begin();
    const start = controller.getSnapshot().activity!.payload.startedAt;
    vi.setSystemTime(start + 49 * 3600 * 1000);
    controller.tick();
    expect(controller.getSnapshot().state).toBe('finished');
    expect(controller.getSnapshot().activity!.payload.endedAt).toBe(
      start + 48 * 3600 * 1000,
    );
    expect(controller.getSnapshot().error).toContain('48 horas');
  });
  it('recuo do relógio não torna durações negativas nem inverte intervalos fechados', () => {
    begin();
    vi.advanceTimersByTime(5000);
    controller.pause();
    const end = controller.getSnapshot().activity!.payload.intervals[0]!.end;
    vi.setSystemTime(end - 10000);
    controller.finish();
    expect(controller.getSnapshot().activity!.payload.endedAt).toBe(end);
    expect(rideMetrics(controller.getSnapshot()).activeMs).toBe(5000);
  });
  it.each(['passeio', 'pista', 'misto'] as const)(
    'velocidade em %s preserva sessão, GPS, métricas e descarte',
    (mode) => {
      controller.start('owner', bike, mode, 'private');
      emit();
      const id = controller.getSnapshot().activity!.payload.clientId;
      const points = controller.getSnapshot().activity!.payload.points;
      const metrics = rideMetrics(controller.getSnapshot());
      const starts = vi.mocked(navigator.geolocation.watchPosition).mock.calls
        .length;
      controller.speed.setMode('pure');
      expect(controller.speed.getSnapshot().preference).toBe('pure');
      controller.speed.setMode('assisted');
      expect(controller.getSnapshot().activity!.payload.clientId).toBe(id);
      expect(controller.getSnapshot().activity!.payload.points).toBe(points);
      expect(rideMetrics(controller.getSnapshot())).toEqual(metrics);
      expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(starts);
      vi.advanceTimersByTime(1000);
      emit();
      controller.pause();
      const samples = controller.speed.finish()!.samples.length;
      vi.advanceTimersByTime(10000);
      expect(controller.speed.finish()!.samples).toHaveLength(samples);
      controller.resume();
      vi.advanceTimersByTime(100);
      emit();
      expect(controller.speed.getSnapshot().source).toBe('gps');
      vi.advanceTimersByTime(1000);
      controller.finish();
      expect(
        controller.getSnapshot().activity!.payload.speedProcessing!.version,
      ).toBe('speed-1');
      controller.discard();
      expect(controller.getSnapshot().activity).toBeNull();
      expect(controller.speed.finish()).toBeUndefined();
    },
  );
  it('funde o fluxo real da Parte 07 sem contaminar máxima, distância ou GPS original', async () => {
    vi.stubGlobal('DeviceMotionEvent', {});
    vi.stubGlobal('DeviceOrientationEvent', {});
    await controller.motion.activate();
    emitMotion();
    controller.motion.calibrate('top-forward', true, true, 0);
    for (let n = 0; n < 60; n++) {
      vi.advanceTimersByTime(50);
      emitMotion();
    }
    expect(controller.motion.getSnapshot().calibration?.valid).toBe(true);
    begin();
    for (let n = 0; n < 18; n++) {
      vi.advanceTimersByTime(50);
      emitMotion({ acceleration: [0, 1, 0] });
    }
    emit();
    for (let n = 0; n < 10; n++) {
      vi.advanceTimersByTime(50);
      emitMotion({ acceleration: [0, 1, 0] });
    }
    expect(controller.speed.getSnapshot().source).toBe('assisted');
    expect(controller.speed.getSnapshot().speedMps).toBeGreaterThan(10);
    expect(rideMetrics(controller.getSnapshot()).maximumKmh).toBe(36);
    expect(rideMetrics(controller.getSnapshot()).distanceMeters).toBe(0);
    expect(
      controller
        .getSnapshot()
        .activity!.payload.points.every((p) => p.speed === 10),
    ).toBe(true);
    vi.advanceTimersByTime(50);
    emitMotion({ acceleration: [3, 1, 0] });
    vi.advanceTimersByTime(100);
    expect(controller.speed.getSnapshot().source).toBe('gps');
    vi.advanceTimersByTime(100);
    controller.finish();
    const data = controller.getSnapshot().activity!.payload;
    expect(
      data.speedProcessing!.samples.some((s) => s.source === 'assisted'),
    ).toBe(true);
    expect(data.motion!.samples.length).toBeGreaterThan(0);
  });
  it('quantização de 1 ms entre GPS epoch e relógio monotônico não inverte a referência salva', () => {
    begin();
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(Date.now() + 1);
    emit();
    vi.advanceTimersByTime(100);
    controller.finish();
    const b = controller.getSnapshot().activity!.payload;
    for (const s of b.speedProcessing!.samples) {
      if (s.gpsTimestamp !== null)
        expect(b.startedAt + s.relativeMs).toBeGreaterThanOrEqual(
          s.gpsTimestamp,
        );
      expect(
        b.intervals.some(
          (i) =>
            b.startedAt + s.relativeMs >= i.start &&
            b.startedAt + s.relativeMs <= i.end,
        ),
      ).toBe(true);
    }
    expect(b.speedProcessing!.truncated).toBe(false);
  });
});
