import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { LOCAL_DB_VERSION, LocalDatabase, requestResult } from './database';
import { OfflineSessionRepository } from './repository';
import { offlineActivity } from './fixtures';
import { RideController } from '../ride/controller';
import { storageError, storageStatus } from './storage';
import { motionStats } from '@apex-ride/ride-core/motion';
import { analyzeTelemetry } from '@apex-ride/ride-core/telemetry';
let db: LocalDatabase, repo: OfflineSessionRepository, factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  db = new LocalDatabase('test', () => factory);
  repo = new OfflineSessionRepository(db);
});
afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('IndexedDB incremental e recuperação', () => {
  it('12D resumo local não transfere séries e cancelamento impede checkpoint posterior', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'writer', Date.now());
    await repo.enqueue(a.ownerId, a.payload.clientId);
    const row = (await repo.list(a.ownerId))[0]!;
    expect(row.history?.metrics.activeMs).toBe(3000);
    expect(row.payload.points).toEqual([]);
    const holder = 'delete-test';
    expect(await repo.lease('sync:' + a.ownerId, holder, Date.now())).toBe(
      true,
    );
    await repo.cancelSaved(a.ownerId, a.payload.clientId, holder, false);
    expect(await repo.list(a.ownerId)).toEqual([]);
    expect(await repo.queue(a.ownerId)).toEqual([]);
    await expect(
      repo.checkpoint(a, 'finished', 'writer', Date.now()),
    ).rejects.toThrow('descartada');
  });
  it('12D exige lock e confirmação remota quando já houve tentativa de envio', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'writer', Date.now());
    await repo.enqueue(a.ownerId, a.payload.clientId);
    const q = (await repo.queue(a.ownerId))[0]!;
    await repo.update({ ...q, lastAttempt: Date.now(), state: 'temporary' });
    await expect(
      repo.cancelSaved(a.ownerId, a.payload.clientId, 'none', true),
    ).rejects.toThrow('sincronização');
    await repo.lease('sync:' + a.ownerId, 'delete', Date.now());
    await expect(
      repo.cancelSaved(a.ownerId, a.payload.clientId, 'delete', false),
    ).rejects.toThrow('Reconecte');
    expect(await repo.list(a.ownerId)).toHaveLength(1);
    await repo.cancelSaved(a.ownerId, a.payload.clientId, 'delete', true);
    expect(await repo.list(a.ownerId)).toHaveLength(0);
  });
  it('11C preserva plano completo offline e o separa da série GPS', async () => {
    const a = offlineActivity();
    a.payload.route = {
      abandoned: false,
      plan: {
        id: crypto.randomUUID(),
        version: 3,
        name: 'Percurso carregado',
        kind: 'route',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-35.735, -9.665],
            [-35.7, -9.665],
          ],
        },
        distanceMeters: 3800,
        verification: 'suggested',
        startLine: null,
        direction: null,
      },
    };
    await repo.checkpoint(a, 'running', 'writer', Date.now());
    await db.close();
    const restored = await repo.read('alice', a.payload.clientId);
    expect(restored.activity.payload.route).toEqual(a.payload.route);
    expect(restored.activity.payload.points).toEqual(a.payload.points);
    const controller = new RideController();
    controller.recover(restored.activity, restored.row.recordedAt);
    expect(controller.getSnapshot().selectedRoute?.version).toBe(3);
  });
  it('sessão longa preserva 50.000 pontos em checkpoints incrementais e reabre sem perdas', async () => {
    const a = offlineActivity(50000);
    const points = a.payload.points;
    for (let count = 500; count <= points.length; count += 500) {
      a.payload.points = points.slice(0, count);
      await repo.checkpoint(
        a,
        count === points.length ? 'finished' : 'running',
        'w',
        Date.now(),
      );
    }
    await db.close();
    const restored = await repo.read('alice', a.payload.clientId);
    expect(restored.activity.payload.points).toEqual(points);
    expect(restored.row.counts[0]).toBe(50000);
  }, 30000);
  it('cria esquema, persiste metadados e pontos e reabre sem duplicar leituras', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'writer', Date.now());
    await repo.checkpoint(a, 'finished', 'writer', Date.now());
    await db.close();
    const read = await repo.read('alice', a.payload.clientId);
    expect(read.activity).toEqual(a);
    expect(read.row.counts).toEqual([3, 0, 0, 0]);
    expect((await db.open()).objectStoreNames.length).toBe(12);
  });
  it('acrescenta somente o novo ponto e preserva ordem temporal', async () => {
    const a = offlineActivity();
    const last = a.payload.points.pop()!;
    await repo.checkpoint(a, 'running', 'w', Date.now());
    a.payload.points.push(last);
    await repo.checkpoint(a, 'paused', 'w', Date.now());
    expect(
      (await repo.read('alice', a.payload.clientId)).activity.payload.points,
    ).toEqual(a.payload.points);
  });
  it('persiste sensores, calibração, velocidade separada e eventos e atualiza consolidação final', async () => {
    const a = offlineActivity();
    a.payload.mode = 'misto';
    a.payload.motion = {
      version: 'motion-1',
      calibration: null,
      samples: [
        {
          sequence: 1,
          relativeMs: 0,
          eventTimestamp: 1000,
          segment: 0,
          longitudinal: null,
          accelerationG: null,
          brakingG: null,
          lean: null,
          quality: 'uncalibrated',
          source: 'unavailable',
        },
      ],
      gaps: [{ relativeMs: 0, reason: 'signal' }],
      truncated: false,
      stats: motionStats([]),
    };
    a.payload.speedProcessing = {
      version: 'speed-1',
      samples: [
        {
          relativeMs: 0,
          speedMps: 1,
          gpsTimestamp: a.payload.startedAt,
          source: 'gps',
          state: 'pure-auto',
          reason: 'sensors',
          stationary: false,
        },
      ],
      truncated: false,
    };
    a.payload.telemetry = analyzeTelemetry(a.payload);
    await repo.checkpoint(a, 'running', 'w', Date.now());
    a.payload.speedProcessing!.samples = [];
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    expect((await repo.read('alice', a.payload.clientId)).activity).toEqual(a);
  });
  it('gravador expirado não sobrescreve confirmação produzida por outra aba', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    await repo.enqueue('alice', a.payload.clientId);
    const q = (await repo.queue('alice'))[0]!;
    await repo.lease('lock', 'old', Date.now() - 100000, 1);
    await repo.lease('lock', 'new', Date.now());
    await repo.update(
      { ...q, state: 'confirmed' },
      { status: 'ok', id: 'server', metrics: {} as never },
      { id: 'lock', holder: 'new' },
    );
    await expect(
      repo.update({ ...q, state: 'temporary' }, undefined, {
        id: 'lock',
        holder: 'old',
      }),
    ).rejects.toThrow('expirou');
    expect((await repo.queue('alice'))[0]!.state).toBe('confirmed');
  });
  it('versão futura incompatível mantém o banco intacto e informa falha', async () => {
    const req = factory.open('test', LOCAL_DB_VERSION + 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('future');
    };
    const newer = await requestResult(req);
    newer.close();
    await expect(db.open()).rejects.toHaveProperty('name', 'VersionError');
    const reopened = await requestResult(
      factory.open('test', LOCAL_DB_VERSION + 1),
    );
    expect(reopened.objectStoreNames.contains('future')).toBe(true);
    reopened.close();
  });
  it('migração v1→atual acrescenta série assistida/vídeos e preserva pendências', async () => {
    const req = factory.open('test', 1);
    req.onupgradeneeded = () => {
      req.result
        .createObjectStore('offline_sessions', { keyPath: 'id' })
        .createIndex('owner', 'ownerId');
      req.result
        .createObjectStore('sync_queue', { keyPath: 'id' })
        .createIndex('owner', 'ownerId');
      req.result.createObjectStore('sync_metadata', { keyPath: 'id' });
      for (const n of ['gps_samples', 'sensor_samples', 'performance_events'])
        req.result
          .createObjectStore(n, { keyPath: ['sessionId', 'order'] })
          .createIndex('session', 'sessionId');
    };
    const old = await requestResult(req);
    const tx = old.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').put({ id: 'pending', ownerId: 'alice' });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    old.close();
    expect((await db.open()).version).toBe(LOCAL_DB_VERSION);
    expect(await repo.queue('alice')).toEqual([
      { id: 'pending', ownerId: 'alice' },
    ]);
  });
  it.each(['QuotaExceededError', 'AbortError'])(
    'falha %s aborta metadados e amostras sem confirmar gravação',
    async (name) => {
      const a = offlineActivity();
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        if (this.name === 'offline_sessions')
          throw new DOMException('simulada', name);
        return put.apply(this, args);
      });
      await expect(
        repo.checkpoint(a, 'finished', 'w', Date.now()),
      ).rejects.toThrow('simulada');
      expect(await repo.list('alice')).toEqual([]);
      expect(
        await db.transaction(['gps_samples'], 'readonly', (tx) =>
          requestResult(tx.objectStore('gps_samples').count()),
        ),
      ).toBe(0);
    },
  );
  it('isola leitura e fila por proprietário e recusa banco incompleto', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    await repo.enqueue('alice', a.payload.clientId);
    expect(await repo.list('bob')).toEqual([]);
    expect(await repo.queue('bob')).toEqual([]);
    await expect(repo.read('bob', a.payload.clientId)).rejects.toThrow();
    await db.transaction(['gps_samples'], 'readwrite', (tx) => {
      tx.objectStore('gps_samples').delete([`alice:${a.payload.clientId}`, 1]);
    });
    await expect(repo.read('alice', a.payload.clientId)).rejects.toThrow(
      'incompletos',
    );
  });
  it('decisão e fila são atômicas; repetição não duplica e atividade salva é imutável', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    await Promise.all([
      repo.enqueue('alice', a.payload.clientId),
      repo.enqueue('alice', a.payload.clientId),
    ]);
    expect(await repo.queue('alice')).toHaveLength(1);
    a.payload.visibility = 'public';
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    expect(
      (await repo.read('alice', a.payload.clientId)).activity.payload
        .visibility,
    ).toBe('private');
  });
  it('dois gravadores não sobrescrevem a mesma sessão; lease expira', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'running', 'one', 1000);
    await expect(repo.checkpoint(a, 'running', 'two', 2000)).rejects.toThrow(
      'outra aba',
    );
    await repo.checkpoint(a, 'finished', 'two', 16001);
    expect((await repo.read('alice', a.payload.clientId)).row.writer).toBe(
      'two',
    );
  });
  it('bloqueio persistente serializa duas abas e recupera lock abandonado', async () => {
    expect(
      await Promise.all([
        repo.lease('sync', 'a', 1000),
        repo.lease('sync', 'b', 1000),
      ]),
    ).toEqual([true, false]);
    await repo.release('sync', 'b');
    expect(await repo.lease('sync', 'b', 1001)).toBe(false);
    expect(await repo.lease('sync', 'b', 61001)).toBe(true);
    await repo.release('sync', 'b');
    expect(await repo.lease('sync', 'a', 61002)).toBe(true);
  });
  it('descarte remove somente a sessão escolhida e impede envio posterior', async () => {
    const a = offlineActivity(),
      b = offlineActivity();
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    await repo.checkpoint(b, 'finished', 'w', Date.now());
    await repo.remove('alice', a.payload.clientId);
    await expect(repo.enqueue('alice', a.payload.clientId)).rejects.toThrow();
    expect(await repo.list('alice')).toHaveLength(1);
  });
  it('limpeza protege pendentes e permite remover somente cópia confirmada', async () => {
    const a = offlineActivity();
    await repo.checkpoint(a, 'finished', 'w', Date.now());
    await repo.enqueue('alice', a.payload.clientId);
    await expect(
      repo.remove('alice', a.payload.clientId, true),
    ).rejects.toThrow();
    await expect(repo.remove('alice', a.payload.clientId)).rejects.toThrow();
    const q = (await repo.queue('alice'))[0]!;
    await repo.update(
      { ...q, state: 'confirmed' },
      { status: 'ok', id: 'server', metrics: {} as never },
    );
    await repo.remove('alice', a.payload.clientId, true);
    expect(await repo.list('alice')).toEqual([]);
  });
  it('recupera sessão interrompida apenas até o checkpoint e não inventa pontos durante página fechada', async () => {
    const a = offlineActivity();
    a.payload.endedAt = 0;
    a.activeStart = a.payload.startedAt;
    a.payload.intervals = [];
    const recordedAt = a.payload.points.at(-1)!.timestamp;
    await repo.checkpoint(a, 'running', 'w', recordedAt);
    const saved = await repo.read('alice', a.payload.clientId);
    const controller = new RideController();
    controller.recover(saved.activity, saved.row.recordedAt);
    const result = controller.getSnapshot();
    expect(result.state).toBe('finished');
    expect(result.activity!.payload.endedAt).toBe(recordedAt);
    expect(result.activity!.payload.points).toEqual(a.payload.points);
    expect(result.error).toContain('interrompida');
  });
});
describe('Quota e persistência', () => {
  it('identifica quota insuficiente sem confirmação falsa', () => {
    expect(
      storageError(new DOMException('full', 'QuotaExceededError')),
    ).toContain('insuficiente');
  });
  it('alerta perto de 85% e trata persistência negada', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 90, quota: 100 }),
        persist: async () => false,
      },
    });
    expect((await storageStatus(true)).warning).toContain('próximo do limite');
    navigator.storage.estimate = async () => ({ usage: 1, quota: 100 });
    expect((await storageStatus(true)).warning).toContain('não concedida');
  });
  it('persistência concedida e indisponibilidade das APIs são explícitas', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 1, quota: 100 }),
        persisted: async () => true,
      },
    });
    expect((await storageStatus()).warning).toBeNull();
    vi.stubGlobal('navigator', {});
    expect((await storageStatus()).warning).toContain('não informa');
  });
});
