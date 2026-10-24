import { vi } from 'vitest';
export function testStream(facingMode = 'environment') {
  const track = Object.assign(new EventTarget(), {
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => ({ facingMode, width: 1280, height: 720 }),
  });
  const stream = {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  return { stream, track };
}
export class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = (mime: string) => mime === 'video/mp4';
  state: RecordingState = 'inactive';
  mimeType = 'video/mp4';
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
    queueMicrotask(() => this.onstart?.());
  }
  data(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) });
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.data('final');
      this.onstop?.();
    });
  }
}
