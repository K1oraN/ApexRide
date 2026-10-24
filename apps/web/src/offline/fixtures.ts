import type { Activity } from '../ride/controller';
export function offlineActivity(count = 3): Activity {
  const start = Date.now() - (count + 60) * 1000;
  return {
    ownerId: 'alice',
    activeStart: null,
    bike: {
      id: crypto.randomUUID(),
      brand: 'Honda',
      model: 'CB 650R',
      year: 2024,
      displacementCc: 649,
      isPrimary: true,
      photoUrl: null,
      createdAt: '',
      updatedAt: '',
    },
    payload: {
      clientId: crypto.randomUUID(),
      motorcycleId: crypto.randomUUID(),
      mode: 'passeio',
      visibility: 'private',
      startedAt: start,
      endedAt: start + count * 1000,
      intervals: [{ start, end: start + count * 1000 }],
      points: Array.from({ length: count }, (_, i) => ({
        latitude: -9.665,
        longitude: -35.735 + i * 0.00001,
        timestamp: start + i * 1000,
        accuracy: 5,
        speed: 1,
        heading: null,
        altitude: null,
        segment: 0,
      })),
    },
  };
}
