import { it, expect } from 'vitest';
import { offlineActivity } from '../offline/fixtures';
import { localHistory } from './local-history';
import type { LocalSession, QueueItem } from '../offline/repository';
import type { HistoryRide } from './types';
const activity = offlineActivity();
const row: LocalSession = {
  id: 'alice:' + activity.payload.clientId,
  ownerId: 'alice',
  version: 1,
  bike: activity.bike,
  state: 'saved',
  payload: activity.payload,
  activeStart: null,
  recordedAt: Date.now(),
  counts: [3, 0, 0, 0],
  writer: 'w',
  leaseUntil: 0,
  decision: 'save',
};
const queued: QueueItem = {
  id: row.id,
  ownerId: 'alice',
  state: 'pending',
  attempts: 0,
  lastAttempt: null,
  nextAttempt: 0,
  error: null,
  received: [],
  serverId: null,
};
it('12D separa contas e esconde cópia local quando há registro remoto', () => {
  expect(
    localHistory([row], [queued], 'bob', new URLSearchParams(), [], false, []),
  ).toEqual([]);
  expect(
    localHistory(
      [row],
      [queued],
      'alice',
      new URLSearchParams(),
      [{ client_id: row.payload.clientId } as HistoryRide],
      true,
      [],
    ),
  ).toEqual([]);
  expect(
    localHistory([row], [queued], 'alice', new URLSearchParams(), [], true, [
      { clientId: row.payload.clientId, id: 'server', deleted: false },
    ]),
  ).toEqual([]);
});
it('12D cópia sincronizada só aparece como alternativa offline e excluída nunca é reintroduzida', () => {
  const confirmed = {
    ...row,
    confirmation: {
      status: 'ok' as const,
      id: 'server',
      metrics: {
        elapsedMs: 3,
        activeMs: 3,
        pausedMs: 0,
        distanceMeters: 1,
        averageKmh: null,
        maximumKmh: null,
      },
    },
  };
  expect(
    localHistory([confirmed], [], 'alice', new URLSearchParams(), [], true, []),
  ).toEqual([]);
  expect(
    localHistory(
      [confirmed],
      [],
      'alice',
      new URLSearchParams(),
      [],
      false,
      [],
    ),
  ).toHaveLength(1);
  expect(
    localHistory([row], [], 'alice', new URLSearchParams(), [], true, [
      { clientId: row.payload.clientId, id: null, deleted: true },
    ]),
  ).toEqual([]);
});
it('12D aplica filtros locais por modo, moto, rota, privacidade e erro', () => {
  expect(
    localHistory(
      [row],
      [queued],
      'alice',
      new URLSearchParams('sync=pending&mode=passeio&routeId=none'),
      [],
      false,
      [],
    ),
  ).toHaveLength(1);
  expect(
    localHistory(
      [row],
      [queued],
      'alice',
      new URLSearchParams('sync=error'),
      [],
      false,
      [],
    ),
  ).toHaveLength(0);
  expect(
    localHistory(
      [row],
      [{ ...queued, state: 'permanent' }],
      'alice',
      new URLSearchParams('sync=error'),
      [],
      false,
      [],
    ),
  ).toHaveLength(1);
  expect(
    localHistory(
      [row],
      [queued],
      'alice',
      new URLSearchParams('motorcycleId=other'),
      [],
      false,
      [],
    ),
  ).toEqual([]);
});
