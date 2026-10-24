import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { LiveLocationController } from './live-controller';
import { GpsPreview } from '../services/gps/preview';
import type { authRequest } from '../services/auth';
import type { LiveSession } from './types';
import { testPosition } from '../services/gps/testFixtures';
let callback: PositionCallback,
  failure: PositionErrorCallback,
  gps: GpsPreview,
  controller: LiveLocationController;
let calls: { path: string; method: string; body: unknown }[],
  session: LiveSession,
  ride: string | null,
  active: boolean;
let request: typeof authRequest;
const c = {
  consent: true,
  consentVersion: 'live-v1',
  audience: 'organizers',
  precision: 'approximate',
  durationMinutes: 30,
};
describe('Consentimento, rede e GPS compartilhado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T15:00:00Z'));
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: PositionCallback, error: PositionErrorCallback) => {
          callback = ok;
          failure = error;
          return 1;
        },
        clearWatch: vi.fn(),
      },
    });
    localStorage.clear();
    calls = [];
    ride = null;
    active = false;
    gps = new GpsPreview();
    session = {
      id: 'session-1',
      audience_scope: 'organizers',
      precision_mode: 'approximate',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1800000).toISOString(),
    };
    request = (async (path: string, method = 'GET', body?: unknown) => {
      calls.push({ path, method, body });
      return { session };
    }) as typeof authRequest;
    controller = new LiveLocationController(
      gps,
      request,
      () => ride,
      () => active,
    );
    controller.owner('alice');
  });
  afterEach(() => {
    controller.stop();
    gps.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const emit = () => callback(testPosition({}, Date.now()));
  it('GPS e mapa local nunca iniciam transmissão sem consentimento', async () => {
    gps.start();
    emit();
    await controller.tick();
    expect(calls).toHaveLength(0);
    expect(controller.getSnapshot().session).toBeNull();
  });
  it('somente leituras posteriores ao consentimento entram no envio, sem telemetria', async () => {
    gps.start();
    emit();
    await controller.start('event', 'Encontro', c);
    await controller.tick();
    expect(calls.filter((x) => x.path.endsWith('/position'))).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    emit();
    await controller.tick();
    const p = calls.find((x) => x.path.endsWith('/position'));
    expect(Object.keys(p!.body as object).sort()).toEqual([
      'accuracy',
      'latitude',
      'longitude',
      'sessionId',
      'timestamp',
    ]);
    expect(controller.getSnapshot().lastAck).toBe(Date.now());
  });
  it('parar social preserva o GPS do Ride e não transmite pontos seguintes', async () => {
    ride = 'ride-1';
    active = true;
    gps.start();
    await controller.start('event', 'Encontro', c);
    controller.stop();
    expect(gps.getSnapshot().active).toBe(true);
    vi.advanceTimersByTime(5000);
    emit();
    await controller.tick();
    expect(calls.filter((x) => x.path.endsWith('/position'))).toHaveLength(0);
  });
  it('finalizar Ride interrompe social imediatamente, inclusive quando consentiu antes de iniciar Ride', async () => {
    await controller.start('event', 'Encontro', c);
    ride = 'ride-1';
    active = true;
    controller.rideChanged();
    ride = null;
    active = false;
    controller.rideChanged();
    expect(controller.getSnapshot().session).toBeNull();
    expect(gps.getSnapshot().active).toBe(false);
  });
  it('offline encerra e guarda somente a revogação, sem reativar no retorno', async () => {
    await controller.start('event', 'Encontro', c);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    await controller.tick();
    expect(controller.getSnapshot().session).toBeNull();
    const stored = localStorage.getItem('apex:live-revocations:v1')!;
    expect(stored).toContain('session-1');
    expect(stored).not.toMatch(/latitude|longitude|accuracy/);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    await controller.flush();
    await controller.tick();
    expect(calls.filter((x) => x.path.endsWith('/start'))).toHaveLength(1);
    expect(calls.some((x) => x.path.endsWith('/stop'))).toBe(true);
    expect(controller.getSnapshot().session).toBeNull();
  });
  it('não acumula posições antigas e não renova consentimento expirado', async () => {
    await controller.start('event', 'Encontro', c);
    vi.advanceTimersByTime(1000);
    emit();
    vi.advanceTimersByTime(11000);
    await controller.tick();
    expect(calls.some((x) => x.path.endsWith('/position'))).toBe(false);
    vi.advanceTimersByTime(1800000);
    await controller.tick();
    expect(controller.getSnapshot().session).toBeNull();
    expect(calls.filter((x) => x.path.endsWith('/start'))).toHaveLength(1);
  });
  it('permissão negada encerra compartilhamento e watcher', async () => {
    await controller.start('event', 'Encontro', c);
    failure({ code: 1 } as GeolocationPositionError);
    expect(controller.getSnapshot().session).toBeNull();
    expect(gps.getSnapshot().active).toBe(false);
  });
  it('troca de conta invalida a sessão sem transmitir como outra pessoa', async () => {
    await controller.start('event', 'Encontro', c);
    controller.owner('bob');
    vi.advanceTimersByTime(5000);
    await controller.tick();
    expect(controller.getSnapshot().session).toBeNull();
    expect(calls.some((x) => x.path.endsWith('/position'))).toBe(false);
  });
  it('parar durante ativação tardia revoga a sessão recebida, sem iniciar GPS', async () => {
    let resolve!: (value: unknown) => void;
    request = ((path: string) =>
      path.endsWith('/start')
        ? new Promise<unknown>((r) => {
            resolve = r;
          })
        : Promise.resolve({})) as typeof authRequest;
    controller = new LiveLocationController(gps, request);
    controller.owner('alice');
    const pending = controller.start('event', 'Encontro', c);
    controller.stop();
    resolve({ session });
    await pending;
    expect(controller.getSnapshot().session).toBeNull();
    expect(gps.getSnapshot().active).toBe(false);
  });
  it('aba escondida interrompe e não envia posição pendente', async () => {
    await controller.start('event', 'Encontro', c);
    vi.advanceTimersByTime(1000);
    emit();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    await controller.tick();
    expect(controller.getSnapshot().session).toBeNull();
    expect(calls.some((x) => x.path.endsWith('/position'))).toBe(false);
  });
  it('revogação é percebida mesmo sem nenhuma nova leitura GPS', async () => {
    request = (async (path: string) => ({
      session: path.endsWith('/start') ? session : null,
    })) as typeof authRequest;
    controller = new LiveLocationController(gps, request);
    controller.owner('alice');
    await controller.start('event', 'Encontro', c);
    await controller.tick();
    expect(controller.getSnapshot().session).toBeNull();
  });
});
