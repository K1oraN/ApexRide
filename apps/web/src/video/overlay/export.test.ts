import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { LocalDatabase } from '../../offline/database';
import { OverlayRepository, type ExportRecord } from './repository';
import { VideoStorageRepository } from '../repository';
import { defaultOverlay } from './config';
import { segment } from './fixtures';
import { exportCapabilities, exportSize, extension } from './capabilities';
import { validateContainer, validateDuration } from './validation';
import { abortable } from './media';
let db: LocalDatabase,
  repo: OverlayRepository,
  original: VideoStorageRepository;
const job = (): ExportRecord => ({
  id: 'export',
  ownerId: 'alice',
  clientId: 'ride',
  segmentId: 'segment',
  config: defaultOverlay('segment'),
  createdAt: Date.now(),
  mimeType: 'video/webm;codecs=vp8',
  width: 640,
  height: 360,
  duration: 10,
  audio: false,
  bytes: 0,
  chunks: 0,
  leaseUntil: Date.now() + 60000,
  state: 'encoding',
});
beforeEach(async () => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  const factory = new IDBFactory();
  db = new LocalDatabase('overlay-test', () => factory);
  repo = new OverlayRepository(db);
  original = new VideoStorageRepository(db);
  await original.create(segment());
});
afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('17C armazenamento, codecs e integridade', () => {
  it('cancelamento não espera play/finalização de encoder suspensos pelo navegador', async () => {
    const abort = new AbortController();
    const pending = abortable(new Promise<void>(() => {}), abort.signal);
    abort.abort(new Error('Suspenso'));
    await expect(pending).rejects.toThrow('Suspenso');
    await expect(abortable(Promise.resolve(1), abort.signal)).rejects.toThrow(
      'Suspenso',
    );
  });
  it('configuração por proprietário, preferências não copiam offset/consentimento', async () => {
    await repo.saveConfig('alice', {
      ...defaultOverlay('segment'),
      offsetMs: 1200,
      audio: true,
    });
    expect((await repo.config('alice', 'segment'))?.offsetMs).toBe(1200);
    expect(await repo.preference('alice')).toMatchObject({
      offsetMs: 0,
      audio: false,
    });
    expect(await repo.preference('bob')).toBeNull();
    await expect(repo.config('bob', 'segment')).rejects.toThrow('conta');
    await expect(
      repo.saveConfig('bob', defaultOverlay('segment')),
    ).rejects.toThrow('conta');
  });
  it('chunks incrementais, validação antes de concluir e isolamento', async () => {
    await repo.begin(job());
    expect(await repo.list('alice', 'ride')).toEqual([]);
    await repo.append('alice', 'export', new Blob(['frame1']));
    await repo.append('alice', 'export', new Blob(['frame2']));
    expect(await (await repo.blob('alice', 'export')).text()).toBe(
      'frame1frame2',
    );
    await expect(repo.blob('bob', 'export')).rejects.toThrow('conta');
    await repo.complete('alice', 'export');
    expect(await repo.list('alice', 'ride')).toHaveLength(1);
    expect(await repo.list('bob', 'ride')).toEqual([]);
  });
  it('exclusão/cancelamento da exportação preserva vídeo e configuração', async () => {
    await repo.saveConfig('alice', defaultOverlay('segment'));
    await repo.begin(job());
    await repo.append('alice', 'export', new Blob(['frame']));
    await repo.remove('alice', 'export');
    expect(await original.list('alice', 'ride')).toHaveLength(1);
    expect(await repo.config('alice', 'segment')).not.toBeNull();
    await expect(repo.blob('alice', 'export')).rejects.toThrow();
  });
  it('excluir mídia retira configurações e exportações associadas', async () => {
    await repo.saveConfig('alice', defaultOverlay('segment'));
    await repo.begin(job());
    await repo.append('alice', 'export', new Blob(['frame']));
    await repo.complete('alice', 'export');
    await original.remove('alice', 'ride');
    expect(await repo.list('alice', 'ride')).toEqual([]);
    await expect(repo.blob('alice', 'export')).rejects.toThrow();
  });
  it('bloqueia codificadores concorrentes e descarta trabalhos expirados', async () => {
    await repo.begin(job());
    await expect(repo.begin({ ...job(), id: 'two' })).rejects.toThrow(
      'andamento',
    );
    await repo.remove('alice', 'export');
    await repo.begin({ ...job(), leaseUntil: 0 });
    await repo.append('alice', 'export', new Blob(['part']));
    await db.transaction(['video_exports'], 'readwrite', (tx) =>
      tx.objectStore('video_exports').put({ ...job(), leaseUntil: 0 }),
    );
    await repo.begin({ ...job(), id: 'two' });
    await expect(repo.blob('alice', 'export')).rejects.toThrow();
  });
  it('quota não conclui arquivo e permite limpar somente temporários', async () => {
    await repo.begin(job());
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'video_export_chunks')
        throw new DOMException('quota', 'QuotaExceededError');
      return add.call(this, value, key);
    });
    await expect(
      repo.append('alice', 'export', new Blob(['frame'])),
    ).rejects.toHaveProperty('name', 'QuotaExceededError');
    expect(await repo.list('alice', 'ride')).toEqual([]);
    await repo.remove('alice', 'export');
    expect(await original.list('alice', 'ride')).toHaveLength(1);
  });
  it('limita montagem e rejeita arquivos vazios/incompletos', async () => {
    await repo.begin(job());
    await expect(repo.blob('alice', 'export')).rejects.toThrow('incompleta');
    await expect(repo.complete('alice', 'export')).rejects.toThrow(
      'incompleta',
    );
  });
  it('recupera somente prefixo contíguo sem declarar integridade', async () => {
    await db.transaction(
      ['video_segments', 'video_chunks'],
      'readwrite',
      (tx) => {
        tx.objectStore('video_segments').put({
          ...segment(),
          state: 'incomplete',
          chunks: 3,
          bytes: 20,
        });
        tx.objectStore('video_chunks').add({
          segmentId: 'segment',
          order: 0,
          blob: new Blob(['header']),
        });
        tx.objectStore('video_chunks').add({
          segmentId: 'segment',
          order: 2,
          blob: new Blob(['missing middle']),
        });
      },
    );
    await expect(original.blob('alice', 'segment')).rejects.toThrow(
      'incompleto',
    );
    expect(await (await original.blob('alice', 'segment', true)).text()).toBe(
      'header',
    );
    expect((await original.list('alice', 'ride'))[0]?.state).toBe('incomplete');
  });
  it('upgrade v3 preserva bytes da Parte 16 e cria stores de composição', async () => {
    const factory = new IDBFactory(),
      request = factory.open('v3', 3);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('video_segments', { keyPath: 'id' });
      request.result.createObjectStore('video_chunks', {
        keyPath: ['segmentId', 'order'],
      });
    };
    const old = await new Promise<IDBDatabase>((res) => {
      request.onsuccess = () => res(request.result);
    });
    const tx = old.transaction('video_chunks', 'readwrite');
    tx.objectStore('video_chunks').add({
      segmentId: 'segment',
      order: 0,
      blob: new Blob(['untouched']),
    });
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    old.close();
    const upgraded = new LocalDatabase('v3', () => factory);
    try {
      const database = await upgraded.open();
      expect(database.version).toBe(4);
      expect(database.objectStoreNames.contains('video_exports')).toBe(true);
      const row = await upgraded.transaction(
        ['video_chunks'],
        'readonly',
        async (tx) => {
          const req = tx.objectStore('video_chunks').get(['segment', 0]);
          return new Promise<{ blob: Blob }>((res) => {
            req.onsuccess = () => res(req.result);
          });
        },
      );
      expect(await row.blob.text()).toBe('untouched');
    } finally {
      await upgraded.close();
    }
  });
  it.each(['economy', 'standard', 'high'] as const)(
    'preset %s preserva proporção e nunca amplia',
    (quality) => {
      const s = exportSize(1920, 1080, quality, 24),
        portrait = exportSize(1080, 1920, quality, 24);
      expect(s.width / s.height).toBeCloseTo(16 / 9, 1);
      expect(s.fps).toBeLessThanOrEqual(24);
      expect(portrait.height).toBe(s.width);
      expect(portrait.width).toBe(s.height);
      expect(exportSize(320, 180, quality).width).toBe(320);
    },
  );
  it('não oferece MP4 por capacidade de decodificação', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (m: string) => m.includes('vp8'),
    });
    vi.stubGlobal(
      'HTMLCanvasElement',
      class {
        captureStream() {
          return {};
        }
      },
    );
    expect(exportCapabilities().formats).toEqual(['video/webm;codecs=vp8']);
    vi.stubGlobal('MediaRecorder', undefined);
    expect(exportCapabilities().formats).toEqual([]);
  });
  it('extensão depende do contêiner e cabeçalho é validado', async () => {
    expect(extension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extension('video/webm')).toBe('webm');
    await validateContainer(
      new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]),
      'video/webm',
    );
    await validateContainer(new Blob(['0000ftypisom']), 'video/mp4');
    await expect(
      validateContainer(new Blob(['webm renamed']), 'video/mp4'),
    ).rejects.toThrow('contêiner');
    expect(() => validateDuration(0, 10)).toThrow();
    expect(() => validateDuration(2, 10)).toThrow();
    expect(() => validateDuration(9.9, 10)).not.toThrow();
  });
});
