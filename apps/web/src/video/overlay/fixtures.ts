import { start } from '../../replay/fixtures';
import { defaultVideoSettings, type VideoSegment } from '../types';
export function segment(elapsed = 0): VideoSegment {
  const a = {
    wallMs: start + elapsed,
    monotonicMs: elapsed,
    rideElapsedMs: elapsed,
    rideActiveMs: elapsed,
    mediaEstimatedMs: 0,
  };
  return {
    id: 'segment',
    version: 1,
    ownerId: 'alice',
    clientId: 'ride',
    order: 0,
    writer: 'w',
    leaseUntil: 0,
    state: 'complete',
    requested: defaultVideoSettings,
    applied: { width: 1280, height: 720, frameRate: 30 },
    audio: false,
    mimeType: 'video/webm',
    start: a,
    end: { ...a, rideElapsedMs: elapsed + 10000 },
    createdAt: start,
    lastReceivedAt: null,
    chunks: 1,
    bytes: 10,
    reason: null,
    durationEstimatedMs: 10000,
    mediaDurationMs: 10000,
  };
}
