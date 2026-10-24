export type ReplayState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'completed'
  | 'error';
export interface ReplaySnapshot {
  state: ReplayState;
  time: number;
  duration: number;
  speed: number;
  error: string;
}
export interface ReplayScheduler {
  now(): number;
  request(callback: () => void): number;
  cancel(id: number): void;
}
const browserScheduler: ReplayScheduler = {
  now: () => performance.now(),
  request: (f) => requestAnimationFrame(f),
  cancel: (id) => cancelAnimationFrame(id),
};
const active = new Map<string, ReplayEngine>();

/** Independent monotonic playback clock; React is only a subscriber. */
export class ReplayEngine {
  private snapshot: ReplaySnapshot = {
    state: 'idle',
    time: 0,
    duration: 0,
    speed: 1,
    error: '',
  };
  private listeners = new Set<() => void>();
  private frames = new Set<(time: number) => void>();
  private loop: number | null = null;
  private anchor = 0;
  private base = 0;
  private lastPublished = -Infinity;
  private resumeAfterSeek = false;
  constructor(
    readonly id: string,
    private scheduler: ReplayScheduler = browserScheduler,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onFrame = (listener: (time: number) => void) => {
    this.frames.add(listener);
    return () => {
      this.frames.delete(listener);
    };
  };
  private publish(update: Partial<ReplaySnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((f) => f());
  }
  private cancel() {
    if (this.loop !== null) this.scheduler.cancel(this.loop);
    this.loop = null;
  }
  private current() {
    return Math.min(
      this.snapshot.duration,
      this.base +
        Math.max(0, this.scheduler.now() - this.anchor) * this.snapshot.speed,
    );
  }
  loading() {
    this.stop();
    this.publish({ state: 'loading' });
  }
  load(duration: number) {
    this.cancel();
    this.base = 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      this.fail('Duração ativa insuficiente.');
      return;
    }
    this.publish({ state: 'ready', time: 0, duration, speed: 1, error: '' });
  }
  fail(error: string) {
    this.stop();
    this.publish({ state: 'error', error });
  }
  play = () => {
    if (
      this.snapshot.state === 'playing' ||
      !['ready', 'paused', 'completed'].includes(this.snapshot.state)
    )
      return;
    const previous = active.get(this.id);
    if (previous && previous !== this) previous.pause();
    active.set(this.id, this);
    if (this.snapshot.time >= this.snapshot.duration) this.base = 0;
    else this.base = this.snapshot.time;
    this.anchor = this.scheduler.now();
    this.lastPublished = -Infinity;
    this.publish({ state: 'playing', time: this.base });
    this.schedule();
  };
  resume = this.play;
  private schedule() {
    if (this.loop === null && this.snapshot.state === 'playing')
      this.loop = this.scheduler.request(this.tick);
  }
  private tick = () => {
    this.loop = null;
    if (this.snapshot.state !== 'playing') return;
    const time = this.current();
    this.frames.forEach((f) => f(time));
    if (time >= this.snapshot.duration) {
      this.base = time;
      this.publish({ state: 'completed', time });
      if (active.get(this.id) === this) active.delete(this.id);
      return;
    }
    if (this.scheduler.now() - this.lastPublished >= 100) {
      this.lastPublished = this.scheduler.now();
      this.publish({ time });
    }
    this.schedule();
  };
  pause = () => {
    if (this.snapshot.state !== 'playing') return;
    this.base = this.current();
    this.cancel();
    this.publish({
      state: this.base >= this.snapshot.duration ? 'completed' : 'paused',
      time: this.base,
    });
    this.frames.forEach((f) => f(this.base));
    if (active.get(this.id) === this) active.delete(this.id);
  };
  restart = () => {
    const playing = this.snapshot.state === 'playing';
    this.cancel();
    this.base = 0;
    this.publish({ state: 'ready', time: 0 });
    this.frames.forEach((f) => f(0));
    if (playing) this.play();
  };
  beginSeek = () => {
    this.resumeAfterSeek = this.snapshot.state === 'playing';
    this.pause();
    this.publish({ state: 'seeking' });
  };
  endSeek = () => {
    if (this.snapshot.state !== 'seeking') return;
    const ended = this.snapshot.time >= this.snapshot.duration;
    this.publish({ state: ended ? 'completed' : 'paused' });
    if (this.resumeAfterSeek && !ended) this.play();
    this.resumeAfterSeek = false;
  };
  seek = (time: number) => {
    if (!Number.isFinite(time) || !this.snapshot.duration) return;
    this.base = Math.max(0, Math.min(this.snapshot.duration, time));
    this.anchor = this.scheduler.now();
    const state =
      this.snapshot.state === 'seeking'
        ? 'seeking'
        : this.base === this.snapshot.duration
          ? 'completed'
          : this.snapshot.state === 'completed'
            ? 'paused'
            : this.snapshot.state;
    if (state === 'completed') {
      this.cancel();
      if (active.get(this.id) === this) active.delete(this.id);
    }
    this.publish({ state, time: this.base });
    this.frames.forEach((f) => f(this.base));
  };
  setPlaybackSpeed = (speed: number) => {
    if (![0.5, 1, 2, 4].includes(speed)) return;
    if (this.snapshot.state === 'playing') this.base = this.current();
    else this.base = this.snapshot.time;
    this.anchor = this.scheduler.now();
    this.publish({ time: this.base, speed });
  };
  stop = () => {
    this.cancel();
    this.base = 0;
    this.publish({ state: 'idle', time: 0 });
    if (active.get(this.id) === this) active.delete(this.id);
  };
  bindVisibility(
    target: Pick<
      Document,
      'hidden' | 'addEventListener' | 'removeEventListener'
    > = document,
  ) {
    const hidden = () => {
      if (target.hidden) {
        this.pause();
        if (this.snapshot.state === 'seeking') {
          this.resumeAfterSeek = false;
          this.endSeek();
        }
      }
    };
    target.addEventListener('visibilitychange', hidden);
    hidden();
    return () => target.removeEventListener('visibilitychange', hidden);
  }
  cleanup = () => {
    this.stop();
    this.frames.clear();
    this.listeners.clear();
  };
}
