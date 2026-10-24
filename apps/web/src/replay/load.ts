import type { RidePayload, RidePoint } from '@apex-ride/ride-core';
import type { MotionSample } from '@apex-ride/ride-core/motion';
import type { SpeedSample } from '@apex-ride/ride-core/speed';
import type { DataPage } from '../history/detail-types';
import { authRequest } from '../services/auth';
import { historyService } from '../history/service';
import type { ReplayInput } from './timeline';

export async function readPages<T>(
  request: (page: number) => Promise<DataPage<T>>,
  max: number,
  signal: AbortSignal,
  progress: (count: number) => void,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const response = await request(page);
    signal.throwIfAborted();
    if (
      response.page !== page ||
      items.length + response.items.length > max ||
      (response.hasMore && !response.items.length)
    )
      throw new Error('Série histórica excede os limites ou está incompleta.');
    items.push(...response.items);
    progress(items.length);
    if (!response.hasMore) return items;
  }
}
export async function loadServerReplay(
  id: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<ReplayInput> {
  const controller = new AbortController();
  try {
    return await readServerReplay(
      id,
      AbortSignal.any([signal, controller.signal]),
      progress,
    );
  } finally {
    controller.abort();
  }
}
async function readServerReplay(
  id: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<ReplayInput> {
  const path = `/rides/${encodeURIComponent(id)}/replay`;
  const { payload, version } = await authRequest<{
    payload: RidePayload;
    version: string;
  }>(path, 'GET', undefined, signal);
  signal.throwIfAborted();
  if (version !== 'replay-1')
    throw new Error('Formato de replay não reconhecido.');
  const pages = <T>(kind: string, max: number) =>
    readPages<T>(
      (page) =>
        authRequest(
          `${path}?kind=${kind}&page=${page}`,
          'GET',
          undefined,
          signal,
        ),
      max,
      signal,
      (count) => progress(`Carregando ${kind}: ${count} amostras…`),
    );
  const [points, motion, speed, events, laps] = await Promise.all([
    pages<RidePoint>('gps', 50000),
    payload.motion ? pages<MotionSample>('motion', 18000) : Promise.resolve([]),
    payload.speedProcessing
      ? pages<SpeedSample>('speed', 18000)
      : Promise.resolve([]),
    readPages(
      (page) => historyService.events(id, page, signal),
      2000,
      signal,
      () => {},
    ),
    readPages(
      (page) => historyService.laps(id, page, signal),
      10000,
      signal,
      () => {},
    ),
  ]);
  progress('Preparando replay…');
  return {
    payload: {
      ...payload,
      points,
      ...(payload.motion
        ? { motion: { ...payload.motion, samples: motion } }
        : {}),
      ...(payload.speedProcessing
        ? { speedProcessing: { ...payload.speedProcessing, samples: speed } }
        : {}),
      ...(payload.telemetry
        ? { telemetry: { ...payload.telemetry, events } }
        : {}),
    },
    laps,
  };
}
/** No lap detection runs in replay. Only already persisted local lap references. */
export function localReplay(payload: RidePayload): ReplayInput {
  const laps: ReplayInput['laps'] = (
    payload.telemetry?.lapContext?.laps ?? []
  ).map((l) => ({
    number: l.sequence,
    start: l.startMs,
    end: l.endMs,
    durationMs: l.durationMs,
    status: l.validation,
  }));
  return { payload, laps };
}
