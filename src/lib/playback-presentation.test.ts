import { describe, expect, it } from 'vitest';
import type { ProgramPlaybackFrame } from '$lib/game/movement';
import {
  facingDegrees,
  playbackFrameDurationMs,
  firstChangedPlaybackFrame,
  nextFacingDegrees,
  programCardIdForPlayback,
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

  it('shows the effective card used by a scrambled register', () => {
    const frames: ProgramPlaybackFrame[] = [
      {
        register: 2,
        stage: 'program-card',
        actorUid: 'target',
        cardId: 'program-010',
        robots: [],
        trace: []
      }
    ];

    expect(programCardIdForPlayback(frames, 'target', 2, 'program-650')).toBe(
      'program-010'
    );
    expect(programCardIdForPlayback(frames, 'other', 2, 'program-650')).toBe(
      'program-650'
    );
  });
});


describe('playback frame timing', () => {
  const frame: ProgramPlaybackFrame = {
    register: 1, stage: 'conveyors', actorUid: null, cardId: null, robots: [], trace: []
  };
  it('briefly presents empty phases but preserves visible laser effects', () => {
    expect(playbackFrameDurationMs(frame)).toBe(100);
    expect(playbackFrameDurationMs({ ...frame, stage: 'lasers', laserBeams: [{ id: 'beam', sourceUid: 'a', targetUid: 'b', fromX: 0, fromY: 0, toX: 1, toY: 0, beamCount: 1 }] })).toBe(1000);
  });
  it('keeps meaningful actions and pending decisions readable', () => {
    for (const kind of ['move', 'blocked-wall', 'option-decision-required', 'damage-choice-required'] as const) {
      const trace = [{ id: 'event', register: 1 as const, actorUid: 'robot', cardId: null, priority: null, kind, text: 'Action' }];
      expect(playbackFrameDurationMs({ ...frame, stage: 'program-card', trace })).toBe(2000);
      expect(playbackFrameDurationMs({ ...frame, trace })).toBe(1000);
    }
  });
});
