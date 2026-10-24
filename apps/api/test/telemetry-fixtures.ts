import { randomUUID } from 'node:crypto';
import type { RidePayload } from '@apex-ride/ride-core';
export const TRACE = [
  0, 0, 0, 0, 0, 5, 10, 15, 20, 25, 28, 30, 30, 27.5, 22.5, 17.5, 12.5, 7.5,
  2.5, 0, 0, 0, 0, 0,
];
export function telemetryFixture(speeds = TRACE, step = 500): RidePayload {
  const start = Date.now() - 100000;
  let meters = 0;
  return {
    clientId: randomUUID(),
    motorcycleId: randomUUID(),
    mode: 'misto',
    visibility: 'private',
    startedAt: start,
    endedAt: start + (speeds.length - 1) * step + 1,
    intervals: [{ start, end: start + (speeds.length - 1) * step }],
    points: speeds.map((speed, i) => {
      meters += i ? (((speeds[i - 1]! + speed) / 2) * step) / 1000 : 0;
      return {
        latitude: -9.6,
        longitude: -35.7 + meters / 109600,
        timestamp: start + i * step,
        accuracy: 3,
        speed,
        heading: 90,
        altitude: null,
        segment: 0,
      };
    }),
  };
}
