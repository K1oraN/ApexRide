import type { User } from '../services/auth';
import type { Motorcycle } from '../services/motorcycles';
import { localDatabase, requestResult } from './database';

// An already authorized device context; never a password, cookie or CSRF token.
export const deviceContext = {
  async user() {
    const row = await localDatabase.transaction(
      ['sync_metadata'],
      'readonly',
      (tx) =>
        requestResult<{ user: User } | undefined>(
          tx.objectStore('sync_metadata').get('device-user'),
        ),
    );
    return row?.user ?? null;
  },
  async remember(user: User) {
    // Keep only fields necessary for offline Ride and avoid persisting email/profile text.
    const minimal = { ...user, email: '', biography: '', avatarRef: null };
    await localDatabase.transaction(['sync_metadata'], 'readwrite', (tx) => {
      tx.objectStore('sync_metadata').put({ id: 'device-user', user: minimal });
    });
  },
  async forget() {
    await localDatabase.transaction(['sync_metadata'], 'readwrite', (tx) => {
      tx.objectStore('sync_metadata').delete('device-user');
    });
  },
  async bikes(ownerId: string) {
    const row = await localDatabase.transaction(
      ['sync_metadata'],
      'readonly',
      (tx) =>
        requestResult<{ bikes: Motorcycle[] } | undefined>(
          tx.objectStore('sync_metadata').get(`bikes:${ownerId}`),
        ),
    );
    return row?.bikes ?? [];
  },
  async rememberBikes(ownerId: string, bikes: Motorcycle[]) {
    await localDatabase.transaction(['sync_metadata'], 'readwrite', (tx) => {
      tx.objectStore('sync_metadata').put({
        id: `bikes:${ownerId}`,
        bikes: bikes.map((b) => ({ ...b, photoUrl: null })),
      });
    });
  },
};
