export const LOCAL_DB_VERSION = 4;
export const sampleStores = [
  'gps_samples',
  'sensor_samples',
  'speed_samples',
  'performance_events',
] as const;
export type SampleStore = (typeof sampleStores)[number];
export const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error('Gravação local interrompida.'));
    tx.onerror = () => {
      /* onabort is the definitive transaction outcome. */
    };
  });
export class LocalDatabase {
  private opening: Promise<IDBDatabase> | null = null;
  constructor(
    readonly name = 'apex-ride-offline',
    private readonly factory = () => indexedDB,
  ) {}
  open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.factory().open(this.name, LOCAL_DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = (event) => {
        const db = req.result;
        if (event.oldVersion < 1) {
          db.createObjectStore('offline_sessions', {
            keyPath: 'id',
          }).createIndex('owner', 'ownerId');
          db.createObjectStore('sync_queue', { keyPath: 'id' }).createIndex(
            'owner',
            'ownerId',
          );
          db.createObjectStore('sync_metadata', { keyPath: 'id' });
          for (const name of [
            'gps_samples',
            'sensor_samples',
            'performance_events',
          ])
            db.createObjectStore(name, {
              keyPath: ['sessionId', 'order'],
            }).createIndex('session', 'sessionId');
        }
        if (event.oldVersion < 2)
          db.createObjectStore('speed_samples', {
            keyPath: ['sessionId', 'order'],
          }).createIndex('session', 'sessionId');
        if (event.oldVersion < 3) {
          const segments = db.createObjectStore('video_segments', {
            keyPath: 'id',
          });
          segments.createIndex('owner', 'ownerId');
          segments.createIndex('activity', ['ownerId', 'clientId']);
          db.createObjectStore('video_chunks', {
            keyPath: ['segmentId', 'order'],
          }).createIndex('segment', 'segmentId');
        }
        if (event.oldVersion < 4) {
          for (const name of ['video_overlay_configs', 'video_exports']) {
            const store = db.createObjectStore(name, {
              keyPath:
                name === 'video_exports' ? 'id' : ['ownerId', 'segmentId'],
            });
            store.createIndex('activity', ['ownerId', 'clientId']);
          }
          db.createObjectStore('video_export_chunks', {
            keyPath: ['exportId', 'order'],
          });
        }
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(
          new Error(
            'Feche outra aba antiga do Apex Ride para atualizar o banco local.',
          ),
        );
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        resolve(db);
      };
    }).catch((error) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }
  async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T> | T,
  ) {
    const db = await this.open();
    const tx = db.transaction(stores, mode);
    const done = transactionDone(tx);
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already completed */
      }
      await done.catch(() => {});
      throw error;
    }
  }
  async close() {
    (await this.opening)?.close();
    this.opening = null;
  }
}
export const localDatabase = new LocalDatabase();
