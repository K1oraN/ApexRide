import { describe, expect, it, vi } from 'vitest';
import { fixture } from '../../replay/fixtures';
import { segment } from './fixtures';
import { defaultOverlay, layoutMetrics, validConfig } from './config';
import { prepareVideoTelemetry } from './resolver';
import { overlayLabels, renderOverlay } from './renderer';
import { observeVideoFrames } from './clock';
describe('17B composição e controles', () => {
  it('layouts selecionam indicadores e rejeitam configuração futura/ inválida', () => {
    const config = defaultOverlay('s');
    expect(validConfig(config)).toBe(true);
    expect(validConfig({ ...config, version: 2 })).toBe(false);
    expect(validConfig({ ...config, offsetMs: Infinity })).toBe(false);
    expect(validConfig({ ...config, metrics: ['fake'] })).toBe(false);
    expect(layoutMetrics('compact')).toEqual(['speed', 'time']);
    expect(layoutMetrics('track')).toContain('track');
  });
  it('ausência não vira zero; seleção e tempo ativo/decorrido são comuns', () => {
    const c = defaultOverlay('s'),
      r = prepareVideoTelemetry({ payload: fixture(), laps: [] });
    const data = r(segment(20000), 1, 0);
    expect(
      overlayLabels(data, c).find((x) => x.metric === 'force')?.value,
    ).toBe('— / — g');
    expect(overlayLabels(data, c).find((x) => x.metric === 'time')?.value).toBe(
      '00:11',
    );
    expect(
      overlayLabels(data, { ...c, time: 'elapsed' }).find(
        (x) => x.metric === 'time',
      )?.value,
    ).toBe('00:21');
    expect(overlayLabels(data, { ...c, metrics: [] })).toEqual([]);
  });
  it.each([
    [1920, 1080],
    [1080, 1920],
    [320, 180],
    [180, 320],
  ])('cards permanecem no quadro %dx%d', (w, h) => {
    let scale = 1;
    const boxes: number[][] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: (s: number) => {
        scale = s;
      },
      beginPath: vi.fn(),
      roundRect: (x: number, y: number, a: number, b: number) => {
        boxes.push([x, y, a, b]);
      },
      fill: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    renderOverlay(ctx, w, h, null, {
      ...defaultOverlay('s'),
      position: 'right',
      metrics: [
        'speed',
        'force',
        'lean',
        'distance',
        'time',
        'mode',
        'bike',
        'track',
        'event',
      ],
    });
    for (const [x, y, a, b] of boxes) {
      expect(x! * scale).toBeGreaterThanOrEqual(0);
      expect(y! * scale).toBeGreaterThanOrEqual(0);
      expect((x! + a!) * scale).toBeLessThanOrEqual(w);
      expect((y! + b!) * scale).toBeLessThanOrEqual(h);
    }
  });
  it('relógio usa timestamp do frame e eventos de seek/pausa, libera callbacks', () => {
    const video = document.createElement('video');
    let callback: VideoFrameRequestCallback | undefined;
    video.requestVideoFrameCallback = vi.fn((cb) => {
      callback = cb;
      return 7;
    });
    video.cancelVideoFrameCallback = vi.fn();
    Object.defineProperty(video, 'readyState', { value: 2 });
    const draw = vi.fn(),
      stop = observeVideoFrames(video, draw);
    callback!(0, { mediaTime: 4.2 } as VideoFrameCallbackMetadata);
    expect(draw).toHaveBeenLastCalledWith(4.2);
    video.currentTime = 2;
    video.dispatchEvent(new Event('seeked'));
    expect(draw).toHaveBeenLastCalledWith(2);
    video.playbackRate = 2;
    video.dispatchEvent(new Event('ratechange'));
    expect(draw).toHaveBeenLastCalledWith(2);
    stop();
    const count = draw.mock.calls.length;
    video.dispatchEvent(new Event('pause'));
    expect(draw).toHaveBeenCalledTimes(count);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  });
  it('fallback congela durante pausa/buffering e usa currentTime ao retomar', () => {
    const video = document.createElement('video');
    let tick: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      tick = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      value: undefined,
    });
    Object.defineProperty(video, 'readyState', {
      value: 2,
      configurable: true,
    });
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    const draw = vi.fn(),
      stop = observeVideoFrames(video, draw);
    draw.mockClear();
    video.currentTime = 10;
    tick!(0);
    expect(draw).not.toHaveBeenCalled();
    Object.defineProperty(video, 'paused', { value: false });
    Object.defineProperty(video, 'readyState', { value: 1 });
    tick!(1);
    expect(draw).not.toHaveBeenCalled();
    Object.defineProperty(video, 'readyState', { value: 2 });
    tick!(2);
    expect(draw).toHaveBeenLastCalledWith(10);
    stop();
    vi.unstubAllGlobals();
  });
});
