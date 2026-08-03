export interface E2ePlaybackClockControl {
  enabled: boolean;
  pending?: () => number;
  advanceBy?: (milliseconds: number) => Promise<number>;
  advanceToNext?: () => Promise<number>;
  runAll?: () => Promise<number>;
}

declare global {
  interface Window {
    __roborallyE2ePlaybackClock?: E2ePlaybackClockControl;
  }
}

interface SyntheticTask {
  id: number;
  at: number;
  callback: () => void;
}

export class SyntheticPlaybackClock {
  private now = 0;
  private nextId = 1;
  private tasks = new Map<number, SyntheticTask>();

  schedule(callback: () => void, delay: number) {
    const id = this.nextId++;
    this.tasks.set(id, {
      id,
      at: this.now + Math.max(0, delay),
      callback
    });
    return id;
  }

  clear(id: number) {
    this.tasks.delete(id);
  }

  pending() {
    return this.tasks.size;
  }

  async advanceBy(milliseconds: number) {
    const target = this.now + Math.max(0, milliseconds);
    let fired = 0;
    while (true) {
      const next = [...this.tasks.values()]
        .filter(({ at }) => at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (!next) break;
      this.now = next.at;
      this.tasks.delete(next.id);
      next.callback();
      fired += 1;
      await Promise.resolve();
    }
    this.now = target;
    return fired;
  }

  async advanceToNext() {
    const next = [...this.tasks.values()].sort(
      (left, right) => left.at - right.at || left.id - right.id
    )[0];
    return next ? await this.advanceBy(next.at - this.now) : 0;
  }

  async runAll() {
    let fired = 0;
    while (this.tasks.size > 0) {
      const advanced = await this.advanceToNext();
      if (advanced === 0) break;
      fired += advanced;
    }
    return fired;
  }
}

const syntheticClock = new SyntheticPlaybackClock();

function syntheticControl() {
  if (
    import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true' ||
    typeof window === 'undefined' ||
    !window.__roborallyE2ePlaybackClock?.enabled
  ) {
    return null;
  }

  const control = window.__roborallyE2ePlaybackClock;
  control.pending ??= () => syntheticClock.pending();
  control.advanceBy ??= (milliseconds) => syntheticClock.advanceBy(milliseconds);
  control.advanceToNext ??= () => syntheticClock.advanceToNext();
  control.runAll ??= () => syntheticClock.runAll();
  return control;
}

export type PlaybackTimer =
  | { kind: 'real'; id: ReturnType<typeof setTimeout> }
  | { kind: 'synthetic'; id: number };

export function schedulePlaybackTimer(callback: () => void, delay: number): PlaybackTimer {
  if (syntheticControl()) {
    return { kind: 'synthetic', id: syntheticClock.schedule(callback, delay) };
  }
  return { kind: 'real', id: setTimeout(callback, delay) };
}

export function clearPlaybackTimer(timer: PlaybackTimer) {
  if (timer.kind === 'synthetic') {
    syntheticClock.clear(timer.id);
  } else {
    clearTimeout(timer.id);
  }
}
