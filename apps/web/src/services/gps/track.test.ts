import { expect, it } from 'vitest';
import { GPS_CONFIG } from './config';
import { normalizePosition } from './readings';
import { testPosition } from './testFixtures';
import { PreviewTrack } from './track';

it('mantém segmentos separados após lacuna ou interrupção explícita', () => {
  const track = new PreviewTrack();
  const r = normalizePosition(testPosition());
  track.append(r);
  expect(track.append({ ...r, timestamp: r.timestamp + 1_000 })).toHaveLength(
    1,
  );
  expect(track.append({ ...r, timestamp: r.timestamp + 20_000 })).toHaveLength(
    2,
  );
  track.breakSegment();
  expect(track.append({ ...r, timestamp: r.timestamp + 21_000 })).toHaveLength(
    3,
  );
  track.clear();
  expect(track.append(r)).toHaveLength(1);
});
it('limita pontos e segmentos sem alterar snapshots anteriores', () => {
  const track = new PreviewTrack();
  const r = normalizePosition(testPosition());
  const original = track.append(r);
  let segments = original;
  for (let i = 1; i < GPS_CONFIG.maxPreviewPoints + 10; i++) {
    track.breakSegment();
    segments = track.append({ ...r, timestamp: r.timestamp + i });
  }
  expect(segments.flat()).toHaveLength(GPS_CONFIG.maxPreviewPoints);
  expect(segments).toHaveLength(GPS_CONFIG.maxPreviewPoints);
  expect(original).toEqual([[r]]);
});
