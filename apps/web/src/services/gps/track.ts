import { GPS_CONFIG } from './config';
import type { LocationReading } from './readings';

export type PreviewSegments = readonly (readonly LocationReading[])[];

/** Traçado efêmero, sem armazenamento, rede ou associação com usuário/moto. */
export class PreviewTrack {
  private segments: LocationReading[][] = [];
  private gap = true;

  breakSegment() {
    this.gap = true;
  }

  clear() {
    this.segments = [];
    this.gap = true;
  }

  append(reading: LocationReading): PreviewSegments {
    const lastSegment = this.segments.at(-1);
    const last = lastSegment?.at(-1);
    if (
      this.gap ||
      !last ||
      reading.timestamp - last.timestamp >= GPS_CONFIG.segmentGapMs
    ) {
      this.segments = [...this.segments, [reading]];
    } else {
      this.segments = [
        ...this.segments.slice(0, -1),
        [...lastSegment!, reading],
      ];
    }
    this.gap = false;
    let count = this.segments.reduce((sum, segment) => sum + segment.length, 0);
    while (count > GPS_CONFIG.maxPreviewPoints) {
      const first = this.segments[0]!;
      const remove = Math.min(
        count - GPS_CONFIG.maxPreviewPoints,
        first.length,
      );
      this.segments =
        remove === first.length
          ? this.segments.slice(1)
          : [first.slice(remove), ...this.segments.slice(1)];
      count -= remove;
    }
    return this.segments;
  }
}
