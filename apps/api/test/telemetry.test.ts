import { describe, expect, it } from 'vitest';
import {
  analyzeTelemetry,
  PerformanceDetector,
  eventReading,
  formatEventTime,
  EVENT_RULES,
} from '@apex-ride/ride-core/telemetry';
import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import type { RidePayload } from '@apex-ride/ride-core';
import { validateRide } from '../src/modules/rides/validation.js';
import { telemetryFixture, TRACE } from './telemetry-fixtures.js';
import { motionFixture } from './motion-fixtures.js';
function analyze(b = telemetryFixture()) {
  return analyzeTelemetry(b);
}
function assertNoValid(b: RidePayload, type: string) {
  expect(
    analyze(b).events.filter(
      (e) => e.type === type && e.status === 'estimated',
    ),
  ).toHaveLength(0);
}

describe('Máquinas incrementais de eventos pessoais', () => {
  it('reversões acumuladas não passam como oscilações pequenas entre amostras', () => {
    const b = telemetryFixture([
      30, 30, 27.5, 25, 20, 20.2, 20.4, 20.6, 20.8, 15, 10, 5, 0, 0, 0, 0, 0,
    ]);
    assertNoValid(b, 'braking');
    expect(analyze(b).events[0]!.reason).toBe('braking-reversed');
  });
  it('parada sustentada, cruzamentos interpolados e confirmação com timestamps originais', () => {
    const b = telemetryFixture();
    const result = analyze(b);
    expect(result.events).toHaveLength(2);
    const [a, brake] = result.events;
    expect(a!.status).toBe('estimated');
    expect(a!.startMs).toBe(b.startedAt + 2000);
    expect(a!.endMs).toBe(b.startedAt + 4963);
    expect(a!.durationMs).toBe(2963);
    expect(brake!.status).toBe('estimated');
    expect(brake!.startMs).toBe(b.startedAt + 6444);
    expect(brake!.endMs).toBe(b.startedAt + 9500);
    expect(brake!.durationMs).toBe(3056);
    expect(result.stats).toEqual({
      accelerationCount: 1,
      brakingCount: 1,
      bestAccelerationMs: 2963,
      bestBrakingMs: 3056,
    });
    expect(a!.force).toBeNull();
    expect(formatEventTime(a!)).toBe('3 s estimados');
  });
  it('não inventa conclusão abaixo de 100 ou sem parada inicial', () => {
    const b = telemetryFixture(TRACE.slice(0, 9));
    assertNoValid(b, 'acceleration');
    expect(analyze(b).events[0]!.status).toBe('inconclusive');
    assertNoValid(
      telemetryFixture([5, 10, 15, 20, 25, 28, 30]),
      'acceleration',
    );
  });
  it('uma leitura zero não valida a parada nem a frenagem', () => {
    assertNoValid(
      telemetryFixture([0, 5, 10, 15, 20, 25, 28, 30]),
      'acceleration',
    );
    const b = telemetryFixture(TRACE.slice(0, 20));
    assertNoValid(b, 'braking');
    expect(analyze(b).events.at(-1)!.reason).toBe('pause');
  });
  it('parada falsa e retomada da aceleração invalidam a frenagem', () => {
    const b = telemetryFixture([...TRACE.slice(0, 20), 5, 10, 15]);
    assertNoValid(b, 'braking');
    expect(analyze(b).events.at(-1)!.reason).toBe('braking-reversed');
  });
  it.each(['null', 'gap', 'order', 'spike', 'accuracy', 'source'])(
    'não conclui aceleração com %s',
    (failure) => {
      const b = telemetryFixture();
      const d = new PerformanceDetector(b.clientId);
      for (let i = 0; i < 10; i++)
        d.push(eventReading(b.points[i]!, b.points[i - 1]));
      const r = eventReading(b.points[10]!, b.points[9]);
      if (failure === 'null') r.speedMps = null;
      if (failure === 'gap') r.timestamp += 5000;
      if (failure === 'order') r.timestamp = b.points[9]!.timestamp;
      if (failure === 'spike') r.speedMps = 90;
      if (failure === 'accuracy') r.accuracy = 40;
      if (failure === 'source') {
        r.source = 'assisted';
        r.calibrated = false;
      }
      d.push(r);
      expect(d.finish().stats.accelerationCount).toBe(0);
      expect(d.events[0]!.durationMs).toBeNull();
    },
  );
  it.each(['null', 'gap', 'pause', 'speed-mode', 'hidden'])(
    'interrompe frenagem por %s sem completar com dados posteriores',
    (failure) => {
      const b = telemetryFixture();
      const d = new PerformanceDetector(b.clientId);
      for (let i = 0; i < 17; i++)
        d.push(eventReading(b.points[i]!, b.points[i - 1]));
      if (failure === 'null' || failure === 'gap') {
        const r = eventReading(b.points[17]!, b.points[16]);
        if (failure === 'null') r.speedMps = null;
        else r.timestamp += 10000;
        d.push(r);
      } else d.interrupt(failure);
      for (let i = 18; i < b.points.length; i++)
        d.push(eventReading(b.points[i]!, b.points[i - 1]));
      expect(d.finish().stats.brakingCount).toBe(0);
    },
  );
  it('leituras GPS de baixa frequência não viram medições artificiais', () => {
    const b = telemetryFixture(TRACE, 3000);
    expect(analyze(b).stats.accelerationCount).toBe(0);
    expect(analyze(b).stats.brakingCount).toBe(0);
  });
  it('intervalo de cruzamento exige qualidade mais estrita que continuidade', () => {
    const b = telemetryFixture(TRACE, 1400);
    expect(analyze(b).events.some((e) => e.reason === 'crossing-gap')).toBe(
      true,
    );
    expect(analyze(b).stats.accelerationCount).toBe(0);
  });
  it('timestamps irregulares próximos usam duração real', () => {
    const b = telemetryFixture();
    b.points.forEach((p, i) => {
      p.timestamp += i % 2 ? 50 : 0;
    });
    const a = analyze(b).events[0]!;
    expect(a.status).toBe('estimated');
    expect(a.durationMs).toBe(2967);
  });
  it('histerese elimina duplicação por oscilação no cruzamento de frenagem', () => {
    const b = telemetryFixture([
      30, 30, 27.7, 27.9, 27.7, 27.9, 27.7, 25, 20, 15, 10, 5, 0, 0, 0, 0, 0,
    ]);
    expect(analyze(b).events.filter((e) => e.type === 'braking')).toHaveLength(
      1,
    );
  });
  it('pico isolado em 100 não confirma aceleração', () => {
    const b = telemetryFixture([...TRACE.slice(0, 11), 26, 24, 22]);
    assertNoValid(b, 'acceleration');
  });
  it('múltiplas transições têm IDs distintos e melhores resultados apenas válidos', () => {
    const b = telemetryFixture([...TRACE, ...TRACE]);
    const t = analyze(b);
    expect(t.stats.accelerationCount).toBe(2);
    expect(t.stats.brakingCount).toBe(2);
    expect(new Set(t.events.map((e) => e.id)).size).toBe(4);
  });
  it('parada com deslocamento ou precisão ruim não arma o detector', () => {
    for (const failure of ['position', 'accuracy']) {
      const b = telemetryFixture();
      for (let i = 0; i < 5; i++) {
        if (failure === 'position') b.points[i]!.longitude += i * 0.0001;
        else b.points[i]!.accuracy = 12;
      }
      assertNoValid(b, 'acceleration');
    }
  });
  it('mudança de fonte ou segmento impede conectar medições', () => {
    const b = telemetryFixture();
    const d = new PerformanceDetector(b.clientId);
    b.points.forEach((p, i) => {
      const r = eventReading(p, b.points[i - 1]);
      if (i >= 8) r.source = 'gps-position';
      d.push(r);
    });
    expect(d.finish().stats.accelerationCount).toBe(0);
    expect(d.events[0]!.reason).toBe('source-change');
    b.points.slice(8).forEach((p) => {
      p.segment = 1;
    });
    assertNoValid(b, 'acceleration');
  });
  it('pausa separa períodos sem contar o intervalo interrompido', () => {
    const b = telemetryFixture();
    b.intervals = [
      { start: b.startedAt, end: b.startedAt + 3500 },
      { start: b.startedAt + 4000, end: b.endedAt },
    ];
    b.points.slice(8).forEach((p) => {
      p.segment = 1;
    });
    expect(analyze(b).events[0]!.reason).toBe('pause');
    assertNoValid(b, 'acceleration');
  });
  it('limite de armazenamento é explícito, estados e parâmetros são inspecionáveis', () => {
    const b = telemetryFixture([...TRACE, ...TRACE]);
    const d = new PerformanceDetector(b.clientId, {
      ...EVENT_RULES,
      maxEvents: 1,
    });
    expect(d.states.acceleration).toBe('waiting-stop');
    b.points.forEach((p, i) => d.push(eventReading(p, b.points[i - 1])));
    expect(d.finish().truncated).toBe(true);
    expect(d.events).toHaveLength(1);
  });
});

describe('Contratos avançados e modos', () => {
  it('associa somente G longitudinal válido ao intervalo, preserva calibração e indisponibilidade da inclinação', () => {
    const b = telemetryFixture();
    b.motion = motionFixture(b.startedAt);
    b.motion.samples.forEach((s, i) => {
      s.relativeMs += 2500;
      s.eventTimestamp += 2500;
      if (i === 2) {
        s.quality = 'invalid';
        s.longitudinal = null;
        s.accelerationG = null;
        s.brakingG = null;
        s.source = 'unavailable';
      }
    });
    b.telemetry = analyze(b);
    const t = validateRide(b).payload.telemetry!;
    expect(t.events[0]!.force).toMatchObject({
      peakG: 1,
      startMs: b.startedAt + 2500,
      endMs: b.startedAt + 2700,
      quality: 'limited',
      calibrationAt: b.startedAt - 1000,
    });
    expect(t.events[1]!.force).toBeNull();
    expect(validateRide(b).payload.motion!.stats.meanLeft).toBeNull();
  });
  it.each(['passeio', 'pista', 'misto'] as const)(
    'configuração central de %s',
    (mode) => {
      const b = telemetryFixture();
      b.mode = mode;
      expect(RIDE_MODES[mode].assistedSpeed).toBe(true);
      expect(RIDE_MODES[mode].pureSpeed).toBe(true);
      expect(RIDE_MODES[mode].advanced).toBe(mode !== 'passeio');
      expect(RIDE_MODES[mode].competitive).toBe(false);
      expect(analyze(b).events.length).toBe(mode === 'passeio' ? 0 : 2);
      expect(analyze(b).lapContext).toEqual({
        circuitId: null,
        startFinishLineId: null,
        laps: [],
      });
    },
  );
  it('recomputa eventos e aceita atividades antigas ou somente GPS', () => {
    const b = telemetryFixture();
    expect(validateRide(b).payload.telemetry).toBeUndefined();
    b.telemetry = analyze(b);
    expect(validateRide(b).payload.telemetry).toEqual(b.telemetry);
  });
  it.each([
    'duration',
    'time',
    'best',
    'source',
    'quality',
    'duplicate',
    'version',
    'lap',
    'break',
    'passeio',
  ])('rejeita telemetria adulterada em %s', (failure) => {
    const b = telemetryFixture();
    b.telemetry = analyze(b);
    const t = b.telemetry;
    if (failure === 'duration') t.events[0]!.durationMs = -1;
    if (failure === 'time') t.events[0]!.startMs = b.endedAt;
    if (failure === 'best') t.stats.bestAccelerationMs = 100;
    if (failure === 'source') t.events[0]!.quality.sources = ['assisted'];
    if (failure === 'quality') t.events[0]!.quality.maxGapMs = 1;
    if (failure === 'duplicate') t.events.push(t.events[0]!);
    if (failure === 'version') t.version = 'unknown' as never;
    if (failure === 'lap') t.lapContext.circuitId = 'invented';
    if (failure === 'break')
      t.interruptions.push({ timestamp: b.endedAt + 1, reason: 'speed-mode' });
    if (failure === 'passeio') b.mode = 'passeio';
    expect(() => validateRide(b)).toThrow(/Telemetria/);
  });
  it('interrupção de preferência é persistida e conferida temporalmente', () => {
    const b = telemetryFixture();
    b.telemetry = analyzeTelemetry(b, [
      { timestamp: b.startedAt + 3500, reason: 'speed-mode' },
    ]);
    expect(b.telemetry.stats.accelerationCount).toBe(0);
    expect(validateRide(b).payload.telemetry).toEqual(b.telemetry);
  });
});
