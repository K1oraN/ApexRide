import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GPS_CONFIG } from './config';
import { GpsPreview } from './preview';
import { testPosition } from './testFixtures';

let success: PositionCallback;
let failure: PositionErrorCallback;
let preview: GpsPreview;
let permission: EventTarget & { state: string };
const clearWatch = vi.fn();
const watchPosition = vi.fn(
  (ok: PositionCallback, error: PositionErrorCallback) => {
    success = ok;
    failure = error;
    return 0;
  },
);
const emitError = (code: number) =>
  failure({ code } as GeolocationPositionError);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T15:00:00Z'));
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  permission = Object.assign(new EventTarget(), { state: 'granted' });
  vi.stubGlobal('navigator', {
    geolocation: { watchPosition, clearWatch },
    permissions: { query: vi.fn().mockResolvedValue(permission) },
  });
  watchPosition.mockClear();
  clearWatch.mockClear();
  preview = new GpsPreview();
});
afterEach(() => {
  preview.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ciclo de vida GPS', () => {
  it('não solicita automaticamente; inicia uma única inscrição com alta precisão', () => {
    expect(watchPosition).not.toHaveBeenCalled();
    preview.start();
    preview.start();
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition.mock.calls[0]).toHaveLength(3);
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      GPS_CONFIG.positionOptions,
    );
    expect(preview.getSnapshot().status).toBe('waiting');
  });
  it('recebe leitura, velocidade direta e traçado, sem arredondar os dados', () => {
    preview.start();
    success(testPosition({ speed: 12.345 }));
    const state = preview.getSnapshot();
    expect(state.status).toBe('available');
    expect(state.reading?.speed).toBe(12.345);
    expect(state.speedKmh).toBe(12.345 * 3.6);
    expect(state.segments.flat()).toHaveLength(1);
  });
  it('zero é parada real, null não retém a velocidade anterior', () => {
    preview.start();
    success(testPosition({ speed: 0 }));
    expect(preview.getSnapshot().speedKmh).toBe(0);
    vi.advanceTimersByTime(1_000);
    success(testPosition({ speed: null }));
    expect(preview.getSnapshot().speedKmh).toBeNull();
  });
  it.each([2, 3])(
    'trata erro temporário %s e permite recuperação pelo mesmo watch',
    (code) => {
      preview.start();
      success(testPosition());
      emitError(code);
      expect(preview.getSnapshot()).toMatchObject({
        status: 'unavailable',
        active: true,
        speedKmh: null,
      });
      vi.advanceTimersByTime(1_000);
      success(testPosition());
      expect(preview.getSnapshot().status).toBe('available');
      expect(preview.getSnapshot().segments).toHaveLength(2);
      expect(watchPosition).toHaveBeenCalledTimes(1);
    },
  );
  it('negação encerra recursos e orienta revisar a permissão sem insistir', () => {
    preview.start();
    emitError(1);
    expect(preview.getSnapshot()).toMatchObject({
      status: 'denied',
      active: false,
      speedKmh: null,
    });
    expect(preview.getSnapshot().message).toContain('configurações');
    expect(clearWatch).toHaveBeenCalledWith(0);
    vi.advanceTimersByTime(60_000);
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });
  it('revogação de permissão libera o monitoramento', async () => {
    preview.start();
    await Promise.resolve();
    permission.state = 'denied';
    permission.dispatchEvent(new Event('change'));
    expect(preview.getSnapshot().status).toBe('denied');
    expect(clearWatch).toHaveBeenCalledTimes(1);
  });
  it('ignora resultado de Permissions API após encerrar', async () => {
    preview.start();
    preview.stop();
    await Promise.resolve();
    permission.state = 'denied';
    permission.dispatchEvent(new Event('change'));
    expect(preview.getSnapshot().status).toBe('idle');
  });
  it('funciona sem Permissions API', () => {
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
    preview.start();
    success(testPosition());
    expect(preview.getSnapshot().status).toBe('available');
  });
  it('trata falta de suporte', () => {
    vi.stubGlobal('navigator', {});
    preview.start();
    expect(preview.getSnapshot().status).toBe('unsupported');
    expect(watchPosition).not.toHaveBeenCalled();
  });
  it('trata contexto inseguro', () => {
    vi.stubGlobal('isSecureContext', false);
    preview.start();
    expect(preview.getSnapshot().status).toBe('insecure');
    expect(watchPosition).not.toHaveBeenCalled();
  });
  it('expira velocidade sem novos callbacks e separa o próximo segmento', () => {
    preview.start();
    success(testPosition());
    vi.advanceTimersByTime(GPS_CONFIG.staleAfterMs);
    expect(preview.getSnapshot()).toMatchObject({
      status: 'stale',
      speedKmh: null,
    });
    success(testPosition());
    expect(preview.getSnapshot().segments).toHaveLength(2);
  });
  it('identifica espera interrompida sem primeira leitura', () => {
    preview.start();
    vi.advanceTimersByTime(GPS_CONFIG.staleAfterMs);
    expect(preview.getSnapshot().status).toBe('stale');
  });
  it('descarta leituras antigas sem desenhar ou exibir velocidade', () => {
    preview.start();
    success(testPosition({}, Date.now() - 30_000));
    expect(preview.getSnapshot()).toMatchObject({
      status: 'stale',
      reading: null,
      speedKmh: null,
      segments: [],
    });
  });
  it('descarta saltos, duplicatas, coordenadas inválidas e posições fora de ordem', () => {
    preview.start();
    const p = testPosition();
    success(p);
    success(p);
    success(testPosition({}, p.timestamp - 1));
    success(testPosition({ latitude: NaN }, p.timestamp + 1));
    success(testPosition({ latitude: -8 }, p.timestamp + 1_000));
    expect(preview.getSnapshot().segments.flat()).toHaveLength(1);
    expect(preview.getSnapshot().reading?.latitude).toBe(p.coords.latitude);
    expect(preview.getSnapshot().speedKmh).toBeNull();
  });
  it('baixa precisão atualiza a posição, interrompe linha e esconde velocidade', () => {
    preview.start();
    success(testPosition());
    vi.advanceTimersByTime(1_000);
    success(testPosition({ accuracy: 200 }));
    expect(preview.getSnapshot()).toMatchObject({
      status: 'reduced',
      speedKmh: null,
    });
    expect(preview.getSnapshot().reading?.accuracy).toBe(200);
    vi.advanceTimersByTime(1_000);
    success(testPosition());
    expect(preview.getSnapshot().segments).toHaveLength(2);
  });
  it('interrompe ao ocultar, ignora callback antigo e retoma sem ligar pontos', () => {
    preview.start();
    success(testPosition());
    const oldSuccess = success;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(preview.getSnapshot()).toMatchObject({
      status: 'suspended',
      speedKmh: null,
    });
    oldSuccess(testPosition({ latitude: -8 }));
    expect(preview.getSnapshot().reading?.latitude).toBe(-9.665);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(preview.getSnapshot().status).toBe('waiting');
    vi.advanceTimersByTime(1_000);
    success(testPosition());
    expect(preview.getSnapshot().segments).toHaveLength(2);
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });
  it('stop descarta dados, timer, listeners e callbacks de geração antiga', () => {
    preview.start();
    success(testPosition());
    const late = success;
    preview.stop();
    expect(vi.getTimerCount()).toBe(0);
    late(testPosition());
    emitError(3);
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(preview.getSnapshot()).toMatchObject({
      status: 'idle',
      reading: null,
      segments: [],
    });
    preview.start();
    late(testPosition({ latitude: -8 }));
    expect(preview.getSnapshot().status).toBe('waiting');
  });
  it('pagehide encerra a coleta, inclusive para cache de navegação', () => {
    preview.start();
    window.dispatchEvent(new Event('pagehide'));
    expect(preview.getSnapshot().active).toBe(false);
    expect(clearWatch).toHaveBeenCalledWith(0);
  });
  it('nova tentativa encerra o watch anterior antes de recomeçar', () => {
    preview.start();
    emitError(3);
    preview.retry();
    expect(clearWatch).toHaveBeenCalledTimes(1);
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });
});
