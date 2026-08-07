import { describe, expect, it } from 'vitest';
import type { ProgramPlaybackFrame } from '$lib/game/movement';
import {
  facingDegrees,
  firstChangedPlaybackFrame,
  nextFacingDegrees,
  robotsForPlaybackPresentation
} from './playback-presentation';

describe('playback presentation', () => {
  it('unwraps quarter-turns across north instead of animating the long way around', () => {
    expect(nextFacingDegrees('west', facingDegrees('west'), 'north')).toBe(360);
    expect(nextFacingDegrees('north', facingDegrees('north'), 'west')).toBe(-90);
    expect(nextFacingDegrees('south', facingDegrees('south'), 'west')).toBe(270);
    expect(nextFacingDegrees('west', 270, 'south')).toBe(180);
  });

  it('finds a replaced provisional frame even when playback length is unchanged', () => {
    const frame = (text: string): ProgramPlaybackFrame => ({
      register: 5,
      stage: 'laser-damage',
      actorUid: 'target',
      cardId: null,
      robots: [],
      trace: [{
        id: `trace-${text}`,
        register: 5,
        actorUid: 'target',
        cardId: null,
        priority: null,
        kind: 'option-damage-prevented',
        text
      }]
    });

    expect(firstChangedPlaybackFrame([frame('pending')], [frame('discarded')])).toBe(0);
    expect(firstChangedPlaybackFrame([frame('same')], [frame('same')])).toBeNull();
    expect(firstChangedPlaybackFrame([frame('same')], [frame('same'), frame('continued')])).toBe(1);
  });

  it('presents the turn-start snapshot before a new resolution can flash its final state', () => {
    const initial = [{ uid: 'robot', x: 1, y: 2 }] as never;
    const final = [{ uid: 'robot', x: 8, y: 9 }] as never;
    const resolution = {
      robots: final,
      playback: { initialRobots: initial, frames: [{}] }
    } as never;

    expect(robotsForPlaybackPresentation(resolution, undefined, 'race:2', 'race:1')).toBe(initial);
    expect(robotsForPlaybackPresentation(resolution, undefined, 'race:2', 'race:2')).toBe(final);
  });
});
