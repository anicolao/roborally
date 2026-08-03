import { describe, expect, it } from 'vitest';
import { SyntheticPlaybackClock } from './playback-clock';

describe('SyntheticPlaybackClock', () => {
  it('runs callbacks in deadline and registration order without elapsed wall time', async () => {
    const clock = new SyntheticPlaybackClock();
    const events: string[] = [];

    clock.schedule(() => events.push('later'), 2_000);
    clock.schedule(() => events.push('first'), 1_000);
    clock.schedule(() => events.push('second'), 1_000);

    expect(await clock.advanceToNext()).toBe(2);
    expect(events).toEqual(['first', 'second']);
    expect(clock.pending()).toBe(1);

    expect(await clock.runAll()).toBe(1);
    expect(events).toEqual(['first', 'second', 'later']);
  });

  it('runs work scheduled by a callback and honors cancellation', async () => {
    const clock = new SyntheticPlaybackClock();
    const events: string[] = [];

    const cancelled = clock.schedule(() => events.push('cancelled'), 1_000);
    clock.clear(cancelled);
    clock.schedule(() => {
      events.push('outer');
      clock.schedule(() => events.push('inner'), 500);
    }, 1_000);

    expect(await clock.runAll()).toBe(2);
    expect(events).toEqual(['outer', 'inner']);
    expect(clock.pending()).toBe(0);
  });
});
