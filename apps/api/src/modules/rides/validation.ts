import {
  acceptablePoint,
  calculateMetrics,
  RIDE_RULES,
  type RidePayload,
  type RidePoint,
} from '@apex-ride/ride-core';
import { AuthError } from '../auth/validation.js';
import { validateMotion } from './motion-validation.js';
import { validateSpeed } from './speed-validation.js';
import { validateTelemetry } from './telemetry-validation.js';
import { validatePlan } from '../routes/ride-plan.js';

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const invalid = (message = 'Dados da atividade inválidos.') =>
  new AuthError(400, message);

export function validateRide(value: unknown, now = Date.now()) {
  if (!value || typeof value !== 'object') throw invalid();
  const b = value as RidePayload;
  if (
    !uuid(b.clientId) ||
    !uuid(b.motorcycleId) ||
    !['passeio', 'pista', 'misto'].includes(b.mode) ||
    !['public', 'private'].includes(b.visibility)
  )
    throw invalid();
  if (
    ![b.startedAt, b.endedAt].every(Number.isSafeInteger) ||
    b.startedAt <= 0 ||
    b.endedAt > now + 5_000 ||
    b.endedAt <= b.startedAt ||
    b.endedAt - b.startedAt > RIDE_RULES.maxDurationMs
  )
    throw invalid('Horários inválidos ou atividade superior a 48 horas.');
  if (
    !Array.isArray(b.points) ||
    !b.points.length ||
    b.points.length > RIDE_RULES.maxPoints
  )
    throw invalid(
      `Envie entre 1 e ${RIDE_RULES.maxPoints} pontos. Nenhum ponto foi salvo.`,
    );
  if (
    !Array.isArray(b.intervals) ||
    !b.intervals.length ||
    b.intervals.length > RIDE_RULES.maxIntervals
  )
    throw invalid('Períodos ativos inválidos.');
  let lastEnd = b.startedAt;
  for (const i of b.intervals) {
    if (
      !i ||
      !Number.isSafeInteger(i.start) ||
      !Number.isSafeInteger(i.end) ||
      i.start < lastEnd ||
      i.end < i.start ||
      i.end > b.endedAt
    )
      throw invalid('Períodos ativos inconsistentes.');
    lastEnd = i.end;
  }
  if (b.intervals[0]!.start !== b.startedAt)
    throw invalid('Início da atividade inconsistente.');
  let previous: RidePoint | undefined;
  let intervalIndex = 0;
  let previousInterval = -1;
  const points: RidePoint[] = [];
  for (const p of b.points) {
    if (!acceptablePoint(p, previous) || !Number.isSafeInteger(p.timestamp))
      throw invalid('Ponto GPS inválido, fora de ordem ou salto incompatível.');
    while (
      intervalIndex < b.intervals.length - 1 &&
      p.timestamp > b.intervals[intervalIndex]!.end
    )
      intervalIndex++;
    const interval = b.intervals[intervalIndex]!;
    if (p.timestamp < interval.start || p.timestamp > interval.end)
      throw invalid('Ponto GPS fora de um período ativo.');
    if (
      previous &&
      (intervalIndex !== previousInterval ||
        p.timestamp - previous.timestamp >= RIDE_RULES.gapMs) &&
      p.segment === previous.segment
    )
      throw invalid('Uma pausa ou lacuna exige novo segmento.');
    points.push({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      altitude: p.altitude,
      segment: p.segment,
    });
    previous = p;
    previousInterval = intervalIndex;
  }
  // Normalização explícita: campos extras/métricas fornecidos pelo cliente não são persistidos.
  const payload: RidePayload = {
    clientId: b.clientId,
    motorcycleId: b.motorcycleId,
    mode: b.mode,
    visibility: b.visibility,
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    intervals: b.intervals.map((i) => ({ start: i.start, end: i.end })),
    points,
  };
  if (b.motion !== undefined)
    payload.motion = validateMotion(b.motion, payload);
  if (b.speedProcessing !== undefined)
    payload.speedProcessing = validateSpeed(b.speedProcessing, payload);
  if (b.telemetry !== undefined)
    payload.telemetry = validateTelemetry(b.telemetry, payload);
  if (b.route !== undefined) {
    payload.route = validatePlan(b.route);
    if (
      payload.route.abandoned &&
      (payload.route.abandonedAt! < payload.startedAt ||
        payload.route.abandonedAt! > payload.endedAt)
    )
      throw invalid('Instante de abandono fora da sessão.');
  }
  if (b.event !== undefined) {
    if (!b.event || !uuid(b.event.id) || !uuid(b.event.authorizationId))
      throw invalid('Associação de evento inválida.');
    payload.event = {
      id: b.event.id,
      authorizationId: b.event.authorizationId,
    };
  }
  return {
    payload,
    metrics: calculateMetrics(
      payload.startedAt,
      payload.endedAt,
      payload.intervals,
      points,
    ),
  };
}
