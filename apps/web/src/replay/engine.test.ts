import { describe, it, expect } from 'vitest';
import { ReplayEngine, type ReplayScheduler } from './engine';
function setup(id = 'ride') {
  let now = 0,
    next = 0;
  const callbacks = new Map<number, () => void>();
  const scheduler: ReplayScheduler = {
    now: () => now,
    request: (f) => {
      callbacks.set(++next, f);
      return next;
    },
    cancel: (n) => {
      callbacks.delete(n);
    },
  };
  const engine = new ReplayEngine(id, scheduler);
  engine.load(10000);
  const advance = (ms: number) => {
    now += ms;
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((f) => f());
  };
  return { engine, advance, callbacks };
}
describe('13B monotonic replay engine', () => {
  it('initializes and supports loading and error states', () => {
    const { engine } = setup();
    expect(engine.getSnapshot().state).toBe('ready');
    engine.loading();
    expect(engine.getSnapshot().state).toBe('loading');
    engine.load(NaN);
    expect(engine.getSnapshot().state).toBe('error');
  });
  it.each([0.5, 1, 2, 4])(
    'plays at %s× with real elapsed intervals',
    (speed) => {
      const { engine: e, advance } = setup();
      e.setPlaybackSpeed(speed);
      e.play();
      advance(1234);
      expect(e.getSnapshot().time).toBe(1234 * speed);
      e.cleanup();
    },
  );
  it('pause freezes time, resume uses a new anchor', () => {
    const { engine: e, advance } = setup();
    e.play();
    advance(500);
    e.pause();
    advance(90000);
    expect(e.getSnapshot().time).toBe(500);
    e.resume();
    advance(300);
    expect(e.getSnapshot().time).toBe(800);
    e.cleanup();
  });
  it('changes speed without changing position or measurements', () => {
    const { engine: e, advance } = setup();
    e.play();
    advance(750);
    e.setPlaybackSpeed(4);
    expect(e.getSnapshot().time).toBe(750);
    advance(500);
    expect(e.getSnapshot().time).toBe(2750);
    e.cleanup();
  });
  it('seek uses exact time and resumes after dragging', () => {
    const { engine: e, advance } = setup();
    e.play();
    advance(100);
    e.beginSeek();
    e.seek(2345);
    advance(1000);
    expect(e.getSnapshot()).toMatchObject({ time: 2345, state: 'seeking' });
    e.endSeek();
    advance(100);
    expect(e.getSnapshot()).toMatchObject({ time: 2445, state: 'playing' });
    e.cleanup();
  });
  it('seek while paused stays paused; clamps endpoints and rejects NaN', () => {
    const { engine: e } = setup();
    e.seek(5000);
    e.beginSeek();
    e.seek(-5);
    e.endSeek();
    expect(e.getSnapshot()).toMatchObject({ time: 0, state: 'paused' });
    e.seek(NaN);
    expect(e.getSnapshot().time).toBe(0);
    e.seek(50000);
    expect(e.getSnapshot()).toMatchObject({ time: 10000, state: 'completed' });
    e.cleanup();
  });
  it('never schedules multiple loops; finishes at exact duration', () => {
    const { engine: e, advance, callbacks } = setup();
    e.play();
    e.play();
    expect(callbacks.size).toBe(1);
    advance(15000);
    expect(e.getSnapshot()).toMatchObject({ time: 10000, state: 'completed' });
    expect(callbacks.size).toBe(0);
    e.play();
    expect(e.getSnapshot().time).toBe(0);
    e.cleanup();
  });
  it('restart preserves playing state or readies a paused replay', () => {
    const { engine: e, advance } = setup();
    e.play();
    advance(500);
    e.restart();
    expect(e.getSnapshot()).toMatchObject({ time: 0, state: 'playing' });
    e.pause();
    e.restart();
    expect(e.getSnapshot().state).toBe('ready');
    e.cleanup();
  });
  it('cleanup cancels all callbacks and listeners', () => {
    const { engine: e, advance, callbacks } = setup();
    e.play();
    e.cleanup();
    advance(500);
    expect(callbacks.size).toBe(0);
    expect(e.getSnapshot().state).toBe('idle');
  });
  it('prevents concurrent playback of the same activity', () => {
    const a = setup('same'),
      b = setup('same');
    a.engine.play();
    b.engine.play();
    expect(a.engine.getSnapshot().state).toBe('paused');
    expect(a.callbacks.size).toBe(0);
    expect(b.callbacks.size).toBe(1);
    a.engine.cleanup();
    b.engine.cleanup();
  });
  it('hidden page pauses without jumping when visible again', () => {
    const { engine: e, advance } = setup();
    const target = new EventTarget() as EventTarget & { hidden: boolean };
    target.hidden = false;
    const unbind = e.bindVisibility(target);
    e.play();
    advance(450);
    target.hidden = true;
    target.dispatchEvent(new Event('visibilitychange'));
    advance(80000);
    target.hidden = false;
    target.dispatchEvent(new Event('visibilitychange'));
    expect(e.getSnapshot()).toMatchObject({ state: 'paused', time: 450 });
    e.resume();
    advance(100);
    expect(e.getSnapshot().time).toBe(550);
    unbind();
    e.cleanup();
  });
});
