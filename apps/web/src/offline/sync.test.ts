import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { calculateMetrics } from '@apex-ride/ride-core';
import { LocalDatabase } from './database';
import { OfflineSessionRepository } from './repository';
import { offlineActivity } from './fixtures';
import { classifySyncError, retryDelay, SyncService, uploadRide } from './sync';
import { ConnectivityService } from './connectivity';
import { ApiError, type SessionResponse } from '../services/auth';
let db: LocalDatabase,
  repo: OfflineSessionRepository,
  connection: ConnectivityService;
const activity = offlineActivity();
const metrics = calculateMetrics(
  activity.payload.startedAt,
  activity.payload.endedAt,
  activity.payload.intervals,
  activity.payload.points,
);
const confirmed = { status: 'ok' as const, id: 'server', metrics };
beforeEach(async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  db = new LocalDatabase('sync', () => new IDBFactory());
  repo = new OfflineSessionRepository(db);
  connection = new ConnectivityService();
  vi.spyOn(connection, 'check').mockResolvedValue('online');
  await repo.checkpoint(activity, 'finished', 'w', Date.now());
  await repo.enqueue('alice', activity.payload.clientId);
});
afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const session = () =>
  Promise.resolve({ user: { id: 'alice' } } as SessionResponse);
describe('Fila persistente de sincronização', () => {
  it('confirma somente após backend e mantém cópia local e métricas consolidadas', async () => {
    const upload = vi.fn().mockResolvedValue(confirmed);
    const sync = new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    );
    await sync.run();
    expect(upload).toHaveBeenCalledTimes(1);
    expect((await repo.queue('alice'))[0]!.state).toBe('confirmed');
    expect(
      (await repo.read('alice', activity.payload.clientId)).row.confirmation,
    ).toEqual(confirmed);
    await sync.run(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('resposta perdida preserva fila; tentativa seguinte usa mesmo identificador', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'Resposta perdida'))
      .mockResolvedValue(confirmed);
    const sync = new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    );
    await sync.run();
    expect((await repo.queue('alice'))[0]!.state).toBe('temporary');
    expect((await repo.queue('alice'))[0]!.nextAttempt).toBeGreaterThan(
      Date.now(),
    );
    await sync.run();
    expect(upload).toHaveBeenCalledTimes(1);
    await sync.run(true);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map((c) => c[0].clientId)).toEqual([
      activity.payload.clientId,
      activity.payload.clientId,
    ]);
  });
  it.each([401, 403, 400, 409, 413, 429, 500, 0])(
    'classifica HTTP %s, mantém dados e evita repetição automática permanente',
    async (status) => {
      const upload = vi.fn().mockRejectedValue(new ApiError(status, 'falha'));
      const sync = new SyncService(
        repo,
        connection,
        () => 'alice',
        () => false,
        () => {},
        upload,
        session,
      );
      await sync.run();
      const row = (await repo.queue('alice'))[0]!;
      expect(row.state).toBe(classifySyncError(new ApiError(status, 'falha')));
      expect(await repo.list('alice')).toHaveLength(1);
      await sync.run();
      expect(upload).toHaveBeenCalledTimes(1);
    },
  );
  it('rejeita resposta incompleta e não marca sincronizado', async () => {
    const upload = vi.fn().mockResolvedValue({ status: 'ok', id: 'server' });
    await new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    ).run();
    expect((await repo.queue('alice'))[0]!.state).toBe('temporary');
  });
  it('duas abas simultâneas e duas chamadas no mesmo processo enviam um único item', async () => {
    const upload = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return confirmed;
    });
    const a = new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    );
    const b = new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    );
    await Promise.all([a.run(), a.run(), b.run()]);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('conta diferente, sessão expirada, falta de rede e coleta ativa não enviam GPS', async () => {
    const upload = vi.fn();
    await new SyncService(
      repo,
      connection,
      () => 'bob',
      () => false,
      () => {},
      upload,
      session,
    ).run();
    await new SyncService(
      repo,
      connection,
      () => 'alice',
      () => true,
      () => {},
      upload,
      session,
    ).run();
    const wrongSession = async () =>
      ({ user: { id: 'bob' } }) as SessionResponse;
    await new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      wrongSession,
    ).run();
    expect((await repo.queue('alice'))[0]!.state).toBe('auth');
    expect(upload).not.toHaveBeenCalled();
    vi.mocked(connection.check).mockResolvedValue('offline');
    await new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    ).run(true);
    expect(upload).not.toHaveBeenCalled();
  });
  it('troca de conta durante lotes interrompe próximos envios', async () => {
    let owner = 'alice';
    const upload = vi
      .fn()
      .mockImplementation(async (_payload, _progress, check) => {
        owner = 'bob';
        await check();
        return confirmed;
      });
    await new SyncService(
      repo,
      connection,
      () => owner,
      () => false,
      () => {},
      upload,
      session,
    ).run();
    expect((await repo.queue('alice'))[0]!.state).toBe('auth');
  });
  it('retoma item abandonado enviando; preserva progresso parcial durante falha', async () => {
    const queued = (await repo.queue('alice'))[0]!;
    await repo.update({ ...queued, state: 'sending' });
    const upload = vi.fn().mockImplementation(async (_payload, progress) => {
      await progress([0, 2]);
      throw new ApiError(0, 'interrompido');
    });
    await new SyncService(
      repo,
      connection,
      () => 'alice',
      () => false,
      () => {},
      upload,
      session,
    ).run();
    expect((await repo.queue('alice'))[0]!.received).toEqual([0, 2]);
  });
  it('backoff tem variação e teto de 18 minutos', () => {
    expect(retryDelay(1, () => 0)).toBe(4000);
    expect(retryDelay(30, () => 1)).toBe(18 * 60_000);
  });
});
describe('REST resumível', () => {
  it('consulta recibos do servidor e envia somente lote ausente antes da confirmação final', async () => {
    const a = offlineActivity(1001);
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        calls.push({ path, body });
        if (path.endsWith('/complete'))
          return new Response(JSON.stringify(confirmed));
        if (path.endsWith('/batches/1'))
          return new Response(JSON.stringify({ status: 'ok', index: 1 }));
        return new Response(JSON.stringify({ status: 'ok', received: [0, 2] }));
      }),
    );
    const progress = vi.fn().mockResolvedValue(undefined);
    expect(await uploadRide(a.payload, progress, async () => {})).toEqual(
      confirmed,
    );
    expect(calls).toHaveLength(3);
    expect(calls[1]!.path).toContain('/batches/1');
    expect((calls[1]!.body as { points: unknown[] }).points).toHaveLength(500);
    expect(calls[2]!.path).toContain('/complete');
    expect(progress).toHaveBeenLastCalledWith([0, 2, 1]);
  });
});
