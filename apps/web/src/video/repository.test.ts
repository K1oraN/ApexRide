import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { LocalDatabase } from '../offline/database';
import { VideoStorageRepository } from './repository';
import { defaultVideoSettings, type VideoSegment } from './types';
let db: LocalDatabase, repo: VideoStorageRepository;
function segment(
  id = 'segment',
  ownerId = 'alice',
  clientId = 'ride',
): VideoSegment {
  return {
    id,
    ownerId,
    clientId,
    version: 1,
    order: 0,
    writer: 'writer',
    leaseUntil: Date.now() + 30_000,
    requested: defaultVideoSettings,
    applied: {},
    audio: false,
    mimeType: 'video/mp4',
    start: null,
    end: null,
    createdAt: 1000,
    chunks: 0,
    bytes: 0,
    lastReceivedAt: null,
    reason: null,
    durationEstimatedMs: null,
    mediaDurationMs: null,
    state: 'writing',
  };
}
const start = {
  wallMs: 1000,
  monotonicMs: 20,
  rideElapsedMs: 500,
  rideActiveMs: 400,
  mediaEstimatedMs: 0,
};
const end = {
  ...start,
  wallMs: 2000,
  monotonicMs: 1020,
  rideElapsedMs: 1500,
  rideActiveMs: 1400,
  mediaEstimatedMs: 1000,
};
beforeEach(() => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('Blob', NodeBlob);
  const factory = new IDBFactory();
  db = new LocalDatabase('video-test', () => factory);
  repo = new VideoStorageRepository(db);
});
afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function complete(id = 'segment', owner = 'alice', client = 'ride') {
  await repo.create(segment(id, owner, client));
  await repo.start(owner, id, 'writer', start, 'video/mp4');
  await repo.append(owner, id, 'writer', {
    segmentId: id,
    order: 0,
    receivedAt: 1200,
    blob: new Blob(['header-data-final']),
  });
  await repo.finish(owner, id, 'writer', end, true, 'Fim', 'video/mp4');
}
describe('16C IndexedDB vídeo', () => {
  it('migra a versão 2 instalada e preserva seus dados GPS', async () => {
    const factory = new IDBFactory();
    const request = factory.open('previous-version', 2);
    request.onupgradeneeded = () => {
      for (const name of ['offline_sessions', 'sync_queue', 'sync_metadata'])
        request.result.createObjectStore(name, { keyPath: 'id' });
      for (const name of [
        'gps_samples',
        'sensor_samples',
        'performance_events',
        'speed_samples',
      ])
        request.result.createObjectStore(name, {
          keyPath: ['sessionId', 'order'],
        });
    };
    const previous = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = previous.transaction('gps_samples', 'readwrite');
    tx.objectStore('gps_samples').put({
      sessionId: 'old',
      order: 0,
      value: 'preserved',
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    previous.close();
    const upgraded = new LocalDatabase('previous-version', () => factory);
    try {
      expect((await upgraded.open()).version).toBe(4);
      const point = await upgraded.transaction(
        ['gps_samples'],
        'readonly',
        (transaction) =>
          new Promise<{ value: string }>((resolve) => {
            const result = transaction
              .objectStore('gps_samples')
              .get(['old', 0]);
            result.onsuccess = () => resolve(result.result);
          }),
      );
      expect(point.value).toBe('preserved');
    } finally {
      await upgraded.close();
    }
  });
  it('recuperação identifica chunks removidos de um arquivo antes finalizado', async () => {
    await complete();
    await db.transaction(['video_chunks'], 'readwrite', (tx) => {
      tx.objectStore('video_chunks').delete(['segment', 0]);
    });
    await repo.recover('alice', Date.now(), true);
    expect((await repo.list('alice'))[0]!.state).toBe('incomplete');
  });
  it('migração preserva stores anteriores e mantém mídia fora da fila de sincronização', async () => {
    await complete();
    expect([...(await db.open()).objectStoreNames]).toContain('gps_samples');
    expect(
      await db.transaction(
        ['sync_queue'],
        'readonly',
        (tx) =>
          new Promise((resolve) => {
            const q = tx.objectStore('sync_queue').count();
            q.onsuccess = () => resolve(q.result);
          }),
      ),
    ).toBe(0);
  });
  it('grava chunks atomicamente, mantém ordem e retentativa não duplica bytes', async () => {
    await repo.create(segment());
    const chunk = {
      segmentId: 'segment',
      order: 0,
      receivedAt: 1,
      blob: new Blob(['abc']),
    };
    await repo.append('alice', 'segment', 'writer', chunk);
    await repo.append('alice', 'segment', 'writer', chunk);
    expect((await repo.list('alice'))[0]).toMatchObject({
      chunks: 1,
      bytes: 3,
    });
    await expect(
      repo.append('alice', 'segment', 'writer', { ...chunk, order: 2 }),
    ).rejects.toThrow('Sequência');
    expect((await repo.list('alice'))[0]!.chunks).toBe(1);
  });
  it('reabre dados finalizados, monta apenas um fluxo e registra duração real quando disponível', async () => {
    await complete();
    await db.close();
    const blob = await repo.blob('alice', 'segment');
    expect(await blob.text()).toBe('header-data-final');
    expect(blob.type).toBe('video/mp4');
    expect((await repo.list('alice'))[0]!.durationEstimatedMs).toBe(1000);
    await repo.mediaDuration('alice', 'segment', 980);
    expect((await repo.list('alice'))[0]!.mediaDurationMs).toBe(980);
  });
  it('recupera escrita expirada sem inventar fim e não interfere em outra aba ativa', async () => {
    await repo.create({ ...segment(), leaseUntil: 10 });
    await repo.create(segment('another', 'alice', 'ride2'));
    await repo.recover('alice', 100);
    const rows = await repo.list('alice');
    expect(rows.find((r) => r.id === 'segment')).toMatchObject({
      state: 'incomplete',
      end: null,
      durationEstimatedMs: null,
    });
    expect(rows.find((r) => r.id === 'another')!.state).toBe('writing');
    await expect(repo.blob('alice', 'segment')).rejects.toThrow('incompleto');
  });
  it('isola contas na leitura, gravação, recuperação e exclusão', async () => {
    await complete();
    await complete('bob-segment', 'bob');
    await expect(repo.blob('bob', 'segment')).rejects.toThrow('conta');
    await expect(
      repo.start('bob', 'segment', 'writer', start, ''),
    ).rejects.toThrow('conta');
    await repo.remove('bob', 'ride');
    expect(await repo.list('bob')).toEqual([]);
    expect(await repo.list('alice')).toHaveLength(1);
  });
  it('exclusão remove metadados e chunks apenas da atividade selecionada', async () => {
    await complete();
    await complete('second', 'alice', 'ride2');
    await repo.remove('alice', 'ride');
    await expect(repo.blob('alice', 'segment')).rejects.toThrow();
    expect((await repo.blob('alice', 'second')).size).toBeGreaterThan(0);
  });
  it('impede dois gravadores e exclusão antes de encerrar', async () => {
    await repo.create(segment());
    await expect(repo.create(segment('second'))).rejects.toThrow('ativo');
    await expect(repo.remove('alice', 'ride')).rejects.toThrow('encerramento');
  });
  it('quota/aborto não confirmam chunk e preservam metadados anteriores', async () => {
    await repo.create(segment());
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    await expect(
      repo.append('alice', 'segment', 'writer', {
        segmentId: 'segment',
        order: 0,
        receivedAt: 10,
        blob: new Blob(['data']),
      }),
    ).rejects.toHaveProperty('name', 'QuotaExceededError');
    expect((await repo.list('alice'))[0]).toMatchObject({
      chunks: 0,
      bytes: 0,
    });
  });
  it('segmento vazio ou timestamps inconsistentes ficam incompletos', async () => {
    await repo.create(segment());
    await repo.start('alice', 'segment', 'writer', start, 'video/mp4');
    await repo.finish(
      'alice',
      'segment',
      'writer',
      { ...end, monotonicMs: 1 },
      true,
      'fim',
      'video/mp4',
    );
    expect((await repo.list('alice'))[0]).toMatchObject({
      state: 'incomplete',
      durationEstimatedMs: null,
    });
  });
  it('atualiza ID remoto sem duplicar a gravação ou mídia', async () => {
    await complete();
    await repo.link('alice', 'ride', 'server');
    await repo.link('alice', 'ride', 'server');
    expect(await repo.list('alice')).toHaveLength(1);
    expect((await repo.list('alice'))[0]!.serverId).toBe('server');
    expect((await repo.blob('alice', 'segment')).size).toBe(17);
  });
  it('sessão sintética incremental preserva volume sem incluir blobs na listagem', async () => {
    await repo.create(segment());
    await repo.start('alice', 'segment', 'writer', start, 'video/mp4');
    for (let i = 0; i < 80; i++)
      await repo.append('alice', 'segment', 'writer', {
        segmentId: 'segment',
        order: i,
        receivedAt: 1000 + i * 5000,
        blob: new Blob([new Uint8Array(16 * 1024)]),
      });
    await repo.finish(
      'alice',
      'segment',
      'writer',
      end,
      true,
      'fim',
      'video/mp4',
    );
    const row = (await repo.list('alice'))[0]!;
    expect(row).toMatchObject({
      chunks: 80,
      bytes: 80 * 16 * 1024,
      durationEstimatedMs: 1000,
    });
    expect(JSON.stringify(row)).not.toContain('blob');
    expect((await repo.blob('alice', 'segment')).size).toBe(row.bytes);
  });
});
