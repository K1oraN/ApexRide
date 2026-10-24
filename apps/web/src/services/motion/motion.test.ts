import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOTION_RULES, motionStats } from '@apex-ride/ride-core/motion';
import { MotionCapture } from './capture';
import { CalibrationWindow, mountingBasis, toBike } from './calibration';
import { benchLean, MotionProcessor } from './processing';
import { eventTimeValid, vector } from './normalize';
import { calibrated, emitMotion, raw } from './fixtures';
import { MotionTelemetry } from './telemetry';

describe('Captura e permissões: eventos sintéticos, sem hardware', () => {
  let c: MotionCapture;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('DeviceMotionEvent', {});
    vi.stubGlobal('DeviceOrientationEvent', {});
    c = new MotionCapture();
  });
  afterEach(() => {
    c.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('detecta APIs sem solicitar automaticamente e encerra listeners', async () => {
    expect(c.detect()).toEqual({ motion: true, orientation: true });
    const receive = vi.fn();
    c.onSample(receive);
    await c.activate();
    await c.activate();
    emitMotion();
    expect(receive).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().status).toBe('working');
    c.stop();
    emitMotion();
    expect(receive).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['insecure', 'unsupported', 'policy'])(
    'trata %s sem bloquear GPS',
    async (scenario) => {
      if (scenario === 'insecure') vi.stubGlobal('isSecureContext', false);
      if (scenario === 'unsupported')
        vi.stubGlobal('DeviceMotionEvent', undefined);
      if (scenario === 'policy')
        Object.defineProperty(document, 'permissionsPolicy', {
          configurable: true,
          value: { allowsFeature: () => false },
        });
      await c.activate();
      expect(c.getSnapshot().status).toBe('unavailable');
      if (scenario === 'policy')
        Reflect.deleteProperty(document, 'permissionsPolicy');
    },
  );
  it('inicia ambos os pedidos iPhone no mesmo gesto antes de aguardar', async () => {
    const order: string[] = [];
    let grant!: (v: PermissionState) => void;
    vi.stubGlobal('DeviceMotionEvent', {
      requestPermission: () => {
        order.push('motion');
        return new Promise<PermissionState>((resolve) => {
          grant = resolve;
        });
      },
    });
    vi.stubGlobal('DeviceOrientationEvent', {
      requestPermission: () => {
        order.push('orientation');
        return Promise.resolve('granted');
      },
    });
    const pending = c.activate();
    expect(order).toEqual(['motion', 'orientation']);
    expect(c.getSnapshot().status).toBe('requesting');
    grant('granted');
    await pending;
    expect(c.getSnapshot().status).toBe('waiting');
  });
  it('nega e não solicita novamente para contornar negativa', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission });
    await c.activate();
    await c.activate();
    c.stop();
    await c.activate();
    expect(c.getSnapshot().status).toBe('denied');
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
  it('aceita movimento sem orientação autorizada e sinaliza ausência de eventos', async () => {
    vi.stubGlobal('DeviceOrientationEvent', {
      requestPermission: () => Promise.reject(new Error('denied')),
    });
    await c.activate();
    vi.advanceTimersByTime(2000);
    expect(c.getSnapshot().status).toBe('interrupted');
    emitMotion();
    expect(c.getSnapshot().status).toBe('working');
  });
  it('ignora resolução tardia depois de parar', async () => {
    let grant!: (v: PermissionState) => void;
    vi.stubGlobal('DeviceMotionEvent', {
      requestPermission: () =>
        new Promise<PermissionState>((r) => {
          grant = r;
        }),
    });
    const p = c.activate();
    c.stop();
    grant('granted');
    await p;
    expect(c.getSnapshot().active).toBe(false);
  });
  it('preserva campos ausentes, rejeita duplicados, timestamps inválidos e detecta lacunas', async () => {
    const receive = vi.fn();
    const gap = vi.fn();
    c.onSample(receive);
    c.onGap(gap);
    await c.activate();
    emitMotion({ acceleration: null, angular: null });
    expect(receive.mock.calls[0]![0].acceleration).toBeNull();
    emitMotion();
    expect(receive).toHaveBeenCalledTimes(1);
    emitMotion({ eventTimestamp: NaN });
    emitMotion({ eventTimestamp: -1 });
    emitMotion({ eventTimestamp: 1e20 });
    expect(receive).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(gap).toHaveBeenCalled();
  });
  it('não considera evento só com campos nulos um sensor funcionando', async () => {
    await c.activate();
    emitMotion({ acceleration: null, gravity: null, angular: null });
    expect(c.getSnapshot().status).toBe('insufficient');
  });
  it('identifica giroscópio bloqueado pela política e mantém captura parcial', async () => {
    Object.defineProperty(document, 'permissionsPolicy', {
      configurable: true,
      value: { allowsFeature: (name: string) => name !== 'gyroscope' },
    });
    try {
      await c.activate();
      expect(c.getSnapshot().policyWarning).toMatch(/Giroscópio bloqueado/);
      emitMotion({ angular: null });
      expect(c.getSnapshot().status).toBe('working');
    } finally {
      Reflect.deleteProperty(document, 'permissionsPolicy');
    }
  });
  it('suspensão invalida fluxo e pagehide remove listeners', async () => {
    const receive = vi.fn();
    c.onSample(receive);
    await c.activate();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    emitMotion();
    expect(receive).not.toHaveBeenCalled();
    expect(c.getSnapshot().status).toBe('interrupted');
    Reflect.deleteProperty(document, 'hidden');
    window.dispatchEvent(new Event('pagehide'));
    expect(c.getSnapshot().active).toBe(false);
  });
});

describe('Calibração, coordenadas e fórmulas verificáveis', () => {
  it('não substitui ausência, NaN e infinito por zero', () => {
    expect(vector(null)).toBeNull();
    expect(vector({ x: null, y: 0, z: 0 })).toBeNull();
    expect(vector({ x: Infinity, y: 0, z: 0 })).toBeNull();
    expect(eventTimeValid(NaN)).toBe(false);
  });
  it('calibra janela estável e corrige bias pequeno', () => {
    const w = new CalibrationWindow('top-forward', 0);
    for (let t = 0; t <= 2950; t += 50)
      w.add(raw(t, { acceleration: [0, 0.1, 0] }));
    const c = w.complete(Date.now());
    expect(c.valid).toBe(true);
    expect(c.bias[1]).toBeCloseTo(0.1);
  });
  it.each([
    'motion',
    'insufficient',
    'missing',
    'orientation',
    'screen',
    'gap',
  ])('rejeita %s na calibração', (condition) => {
    const w = new CalibrationWindow('top-forward', 0);
    for (let t = 0; t <= 2950; t += 50) {
      if (
        (condition === 'insufficient' && t > 500) ||
        (condition === 'gap' && t > 500 && t < 1500)
      )
        continue;
      w.add(
        raw(
          t,
          condition === 'motion'
            ? { angular: [5, 0, 0] }
            : condition === 'missing'
              ? { acceleration: null }
              : condition === 'orientation' && t > 1000
                ? {
                    orientation: {
                      alpha: null,
                      beta: 10,
                      gamma: 0,
                      absolute: false,
                      monotonicMs: t,
                    },
                  }
                : condition === 'screen' && t > 1000
                  ? { screenAngle: 90 }
                  : {},
        ),
      );
    }
    expect(() => w.complete(Date.now())).toThrow();
  });
  it('montagens e sinais conhecidos convertem frente, esquerda e cima', () => {
    const top = mountingBasis([0, 0, 9.80665], 'top-forward');
    expect(toBike([2, 3, 4], top)).toEqual([3, -2, 4]);
    const right = mountingBasis([0, 0, 9.80665], 'right-forward');
    expect(toBike([2, 3, 4], right)).toEqual([2, 3, 4]);
    expect(() => mountingBasis([0, 9.8, 0], 'top-forward')).toThrow();
    expect(() => mountingBasis([0, 0, 9.8], 'unknown' as never)).toThrow();
  });
  it('corrige inclinação de montagem com vetor projetado', () => {
    const basis = mountingBasis([0, 4.903325, 8.492808], 'top-forward');
    expect(toBike(basis[0], basis)[0]).toBeCloseTo(1);
    expect(toBike(basis[2], basis)[0]).toBeCloseTo(0);
  });
  it('inclinação de bancada zero, esquerda e direita; não certifica moto em movimento', () => {
    const c = calibrated();
    expect(benchLean(c.basis, c.basis)).toBe(0);
    for (const degrees of [-30, 30]) {
      const a = (degrees * Math.PI) / 180;
      const rotated = [...c.basis] as typeof c.basis;
      rotated[2] = [-Math.sin(a), 0, Math.cos(a)];
      expect(benchLean(c.basis, rotated)).toBeCloseTo(degrees);
    }
  });
  it.each([9.80665, -9.80665, 0])(
    'estima longitudinal %s m/s² com sinal correto',
    (acceleration) => {
      const p = new MotionProcessor(),
        c = calibrated();
      let r;
      for (let t = 0; t <= 2000; t += 50)
        r = p.process(raw(t, { acceleration: [0, acceleration, 0] }), c);
      expect(r!.accelerationG).toBeCloseTo(
        Math.max(0, acceleration) / MOTION_RULES.gravity,
        2,
      );
      expect(r!.brakingG).toBeCloseTo(
        Math.max(0, -acceleration) / MOTION_RULES.gravity,
        2,
      );
      expect(r!.lean).toBeNull();
    },
  );
  it('não usa módulo total, gravidade ou aceleração lateral como longitudinal', () => {
    const p = new MotionProcessor(),
      c = calibrated();
    let r;
    for (let t = 0; t <= 2000; t += 50)
      r = p.process(raw(t, { acceleration: [8, 0, 0] }), c);
    expect(r!.accelerationG).toBe(0);
    expect(r!.brakingG).toBe(0);
    expect(
      p.process(raw(2100, { acceleration: null }), c).longitudinal,
    ).toBeNull();
  });
  it('rejeita pico isolado, alteração de tela e perda de calibração', () => {
    const p = new MotionProcessor(),
      c = calibrated();
    for (let t = 0; t <= 1000; t += 50) p.process(raw(t), c);
    expect(
      p.process(raw(1050, { acceleration: [0, 15, 0] }), c).longitudinal,
    ).toBeNull();
    expect(p.process(raw(1100), c).accelerationG).toBe(0);
    expect(
      p.process(raw(1150, { screenAngle: 90 }), c).longitudinal,
    ).toBeNull();
    c.valid = false;
    expect(p.process(raw(1200), c).quality).toBe('uncalibrated');
  });
  it('intervalos irregulares e lacunas não ligam filtros entre segmentos', () => {
    const p = new MotionProcessor(),
      c = calibrated();
    [0, 40, 120, 190, 240, 320, 400, 510, 610].forEach((t) =>
      p.process(raw(t), c),
    );
    expect(p.process(raw(3000), c).quality).toBe('interrupted');
    expect(p.process(raw(3050), c).longitudinal).toBeNull();
    expect(motionStats([]).maxAccelerationG).toBeNull();
  });
});

describe('Telemetria e sessão: buffers em memória e processamento separado', () => {
  let t: MotionTelemetry;
  let off: () => void;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('DeviceMotionEvent', {});
    vi.stubGlobal('DeviceOrientationEvent', {});
    t = new MotionTelemetry();
    off = t.connect();
    await t.activate();
    emitMotion();
  });
  afterEach(() => {
    off();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function feed(count: number, value = 0) {
    for (let n = 0; n < count; n++) {
      vi.advanceTimersByTime(50);
      emitMotion({ acceleration: [0, value, 0] });
    }
  }
  function calibrate() {
    t.calibrate('top-forward', true, true, 0);
    feed(60);
    expect(t.getSnapshot().calibration?.valid).toBe(true);
  }
  it('calibra, recalibra e bloqueia calibração durante a atividade', () => {
    calibrate();
    calibrate();
    t.session(Date.now(), true);
    t.calibrate('right-forward', true, true, 0);
    expect(t.getSnapshot().calibration?.mount).toBe('top-forward');
  });
  it('exige confirmações e bloqueia calibração com GPS em movimento', () => {
    t.calibrate('top-forward', true, false, 0);
    expect(t.getSnapshot().calibrating).toBe(false);
    t.calibrate('top-forward', true, true, 20);
    expect(t.getSnapshot().calibrating).toBe(false);
  });
  it('limita renderizações, pausa sem atualizar estatísticas, retoma em segmento e encerra', () => {
    calibrate();
    t.session(Date.now(), true);
    feed(30, 9.80665);
    const before = t.getSnapshot().samples;
    expect(before).toBeLessThan(10);
    t.session(Date.now(), false);
    feed(30, -9.80665);
    expect(t.getSnapshot().samples).toBe(before);
    expect(t.getSnapshot().current).toBeNull();
    t.session(Date.now(), true);
    feed(30, -9.80665);
    const result = t.finish()!;
    expect(result.stats.maxAccelerationG).toBeCloseTo(1, 1);
    expect(result.stats.maxBrakingG).toBeCloseTo(1, 1);
    expect(new Set(result.samples.map((s) => s.segment)).size).toBe(2);
    expect(result.gaps[0]!.reason).toBe('pause');
    expect(t.getSnapshot().sensor.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    t.clear();
    expect(t.finish()).toBeUndefined();
  });
  it('interrupção zera indicador atual e invalida referência sem recalibrar automaticamente', () => {
    calibrate();
    t.session(Date.now(), true);
    feed(20, 4);
    vi.advanceTimersByTime(2000);
    expect(t.getSnapshot().current).toBeNull();
    expect(t.getSnapshot().calibration?.valid).toBe(false);
    feed(20, 4);
    expect(t.getSnapshot().current?.accelerationG).toBeNull();
    expect(t.finish()!.gaps.length).toBeGreaterThan(0);
  });
  it('GPS sozinho não produz dados artificiais de sensores', () => {
    t.clear();
    t.session(Date.now(), true);
    t.session(Date.now(), false);
    expect(t.finish()).toBeUndefined();
  });
  it('limite explícito de memória não corta o histórico silenciosamente e preserva os dados já selecionados', () => {
    calibrate();
    t.session(Date.now(), true);
    for (let n = 0; n <= MOTION_RULES.maxSamples; n++) {
      vi.advanceTimersByTime(200);
      emitMotion();
    }
    expect(t.getSnapshot().samples).toBe(MOTION_RULES.maxSamples);
    expect(t.getSnapshot().truncated).toBe(true);
    expect(t.getSnapshot().current).toBeNull();
    const data = t.finish()!;
    expect(data.truncated).toBe(true);
    expect(data.samples).toHaveLength(MOTION_RULES.maxSamples);
  }, 15000);
  it('movimento incompatível invalida a montagem', () => {
    calibrate();
    vi.advanceTimersByTime(50);
    emitMotion({ angular: [250, 0, 0] });
    expect(t.getSnapshot().calibration?.valid).toBe(false);
  });
  it('mudança da orientação real da tela invalida referência', () => {
    calibrate();
    const descriptor = Object.getOwnPropertyDescriptor(
      window.screen,
      'orientation',
    );
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { angle: 90 },
    });
    try {
      vi.advanceTimersByTime(50);
      emitMotion();
      expect(t.getSnapshot().calibration?.valid).toBe(false);
    } finally {
      if (descriptor)
        Object.defineProperty(window.screen, 'orientation', descriptor);
      else Reflect.deleteProperty(window.screen, 'orientation');
    }
  });
  it('encerrar a preparação invalida referência e não permite reutilizá-la silenciosamente', () => {
    calibrate();
    t.stop();
    expect(t.getSnapshot().calibration?.valid).toBe(false);
  });
  it('calibração expirada não autoriza cálculos de G', () => {
    calibrate();
    vi.setSystemTime(Date.now() + 600001);
    t.session(Date.now(), true);
    expect(t.getSnapshot().calibration?.valid).toBe(false);
  });
});
