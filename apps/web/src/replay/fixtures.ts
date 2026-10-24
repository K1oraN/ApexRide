import type { RidePayload, RidePoint } from '@apex-ride/ride-core';
export const start = 1792742400000;
export const point = (ms: number, segment = 0): RidePoint => ({
  timestamp: start + ms,
  latitude: -9.66,
  longitude: -35.73 + (ms / 1000) * 0.0001,
  accuracy: 5,
  heading: 90,
  speed: 10,
  altitude: null,
  segment,
});
export function fixture(): RidePayload {
  return {
    clientId: 'ride',
    motorcycleId: 'bike',
    mode: 'misto',
    visibility: 'private',
    startedAt: start,
    endedAt: start + 30000,
    intervals: [
      { start, end: start + 10000 },
      { start: start + 20000, end: start + 30000 },
    ],
    points: [
      point(0),
      point(1000),
      point(4000),
      point(9000),
      point(20000, 1),
      point(21000, 1),
    ],
  };
}
