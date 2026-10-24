import type { LocalSession, QueueItem } from '../offline/repository';
import type { HistoryRide } from './types';
import { periodDates } from './filters';
export const syncLabels = {
  pending: 'Aguardando sincronização',
  sending: 'Sincronizando',
  partial: 'Parcialmente enviada',
  auth: 'Confirme sua conta',
  temporary: 'Erro temporário',
  permanent: 'Erro ou conflito',
  confirmed: 'Sincronizada',
};
export interface Receipt {
  clientId: string;
  id: string | null;
  deleted: boolean;
}
export function localHistory(
  sessions: LocalSession[],
  queue: QueueItem[],
  owner: string,
  params: URLSearchParams,
  remote: HistoryRide[],
  available: boolean,
  receipts: Receipt[],
) {
  const remoteIds = new Set(remote.map((r) => r.client_id));
  const receiptMap = new Map(receipts.map((r) => [r.clientId, r]));
  const dates = periodDates(
    params.get('period') ?? '',
    params.get('start') ?? '',
    params.get('end') ?? '',
  );
  const mode = params.get('mode'),
    bike = params.get('motorcycleId'),
    route = params.get('routeId'),
    visibility = params.get('visibility'),
    sync = params.get('sync');
  const q = (params.get('q') ?? '').toLocaleLowerCase('pt-BR');
  const rows = sessions.filter((row) => {
    if (row.ownerId !== owner || !row.payload.endedAt) return false;
    const receipt = receiptMap.get(row.payload.clientId),
      queued = queue.find((q) => q.id === row.id && q.ownerId === owner);
    if (receipt?.deleted || remoteIds.has(row.payload.clientId)) return false;
    if (
      available &&
      (receipt?.id || row.confirmation || queued?.state === 'confirmed')
    )
      return false;
    if (sync === 'remote' && !row.confirmation) return false;
    if (
      sync === 'pending' &&
      (row.confirmation || queued?.state === 'confirmed')
    )
      return false;
    if (
      sync === 'error' &&
      !['temporary', 'permanent', 'auth'].includes(queued?.state ?? '')
    )
      return false;
    if (
      (mode && row.payload.mode !== mode) ||
      (bike && row.bike.id !== bike) ||
      (visibility && row.payload.visibility !== visibility)
    )
      return false;
    if (
      (route === 'none' && row.payload.route) ||
      (route && route !== 'none' && row.payload.route?.plan.id !== route)
    )
      return false;
    if (
      (dates.from && row.payload.startedAt < Date.parse(dates.from)) ||
      (dates.to && row.payload.startedAt >= Date.parse(dates.to))
    )
      return false;
    return (
      !q ||
      `${row.payload.mode} — ${new Date(row.payload.startedAt).toLocaleDateString('pt-BR')} ${row.bike.brand} ${row.bike.model} ${row.payload.route?.plan.name ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    );
  });
  const metric = (r: LocalSession) =>
    r.history?.metrics ?? r.confirmation?.metrics;
  const sort = params.get('sort');
  return rows.sort((a, b) =>
    sort === 'oldest'
      ? a.payload.startedAt - b.payload.startedAt
      : sort === 'distance'
        ? (metric(b)?.distanceMeters ?? -1) - (metric(a)?.distanceMeters ?? -1)
        : sort === 'duration'
          ? (metric(b)?.activeMs ?? -1) - (metric(a)?.activeMs ?? -1)
          : b.payload.startedAt - a.payload.startedAt,
  );
}
