import { describe, expect, it } from 'vitest';
import { PROGRAM_CARDS, type ProgramAction } from './program-manifest';
import {
  applyProgramCard,
  movementBlockedByWall,
  resolveProgrammedTurn,
  type RaceRobotPosition,
  type ResolutionTraceEntry
} from './movement';
import { createProgrammingState, submitProgram } from './programming';
import { deriveRaceSetup, riskyExchangeConfig } from './setup';

function card(action: ProgramAction) {
  return PROGRAM_CARDS.find((candidate) => candidate.action === action)!;
}

describe('priority Program movement', () => {
  it('accepts every one of the 84 unique printed priorities', () => {
    for (const programCard of PROGRAM_CARDS) {
      const robot: RaceRobotPosition = {
        uid: 'robot',
        name: 'Robot',
        robotId: 'axle',
        x: 6,
        y: 10,
        facing: 'north'
      };
      const trace: ResolutionTraceEntry[] = [];
      applyProgramCard([robot], 'robot', programCard, 1, trace);
      expect(trace[0]).toMatchObject({
        cardId: programCard.id,
        priority: programCard.priority,
        kind: 'reveal'
      });
    }
  });

  it('executes all seven instruction classes with stepwise movement and rotations', () => {
    const robot: RaceRobotPosition = {
      uid: 'robot',
      name: 'Robot',
      robotId: 'axle',
      x: 6,
      y: 10,
      facing: 'north'
    };
    const trace: ResolutionTraceEntry[] = [];
    const robots = [robot];

    applyProgramCard(robots, 'robot', card('move-1'), 1, trace);
    expect(robot).toMatchObject({ x: 6, y: 9, facing: 'north' });
    applyProgramCard(robots, 'robot', card('move-2'), 2, trace);
    expect(robot).toMatchObject({ x: 6, y: 7 });
    applyProgramCard(robots, 'robot', card('move-3'), 3, trace);
    expect(robot).toMatchObject({ x: 6, y: 4 });
    applyProgramCard(robots, 'robot', card('back-up'), 4, trace);
    expect(robot).toMatchObject({ x: 6, y: 5, facing: 'north' });
    applyProgramCard(robots, 'robot', card('rotate-right'), 5, trace);
    expect(robot.facing).toBe('east');
    applyProgramCard(robots, 'robot', card('rotate-left'), 6, trace);
    expect(robot.facing).toBe('north');
    applyProgramCard(robots, 'robot', card('u-turn'), 7, trace);
    expect(robot.facing).toBe('south');
    expect(trace.filter(({ kind }) => kind === 'move')).toHaveLength(7);
  });

  it('checks both sides of wall edges and crosses an open board seam', () => {
    expect(movementBlockedByWall(6, 15, 'east')).toBe(true);
    expect(movementBlockedByWall(7, 15, 'west')).toBe(true);
    expect(movementBlockedByWall(6, 13, 'north')).toBe(false);

    const robot: RaceRobotPosition = {
      uid: 'robot',
      name: 'Robot',
      robotId: 'axle',
      x: 6,
      y: 13,
      facing: 'north'
    };
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard([robot], 'robot', card('move-1'), 1, trace);
    expect(robot).toMatchObject({ x: 6, y: 12 });
  });

  it('resolves each register by descending unique priority and stops every step at walls', () => {
    const config = riskyExchangeConfig('MOVEMENT-GOLDEN');
    const setup = deriveRaceSetup(
      [
        { uid: 'host', name: 'Ada', robotId: 'axle' },
        { uid: 'guest', name: 'Grace', robotId: 'bit' }
      ],
      config
    );
    let programming = createProgrammingState(setup, config);
    for (const player of programming.players) {
      programming = submitProgram(
        programming,
        player.uid,
        player.hand.slice(0, 5),
        player.uid === 'host' ? 1_000 : 2_000
      );
    }

    const resolution = resolveProgrammedTurn(programming, setup);
    expect(resolution?.trace.filter(({ kind }) => kind === 'reveal')).toHaveLength(10);
    for (let register = 1; register <= 5; register += 1) {
      const priorities = resolution!.trace
        .filter((entry) => entry.register === register && entry.kind === 'reveal')
        .map(({ priority }) => priority);
      expect(priorities).toEqual([...priorities].sort((left, right) => right - left));
    }
    expect(resolution?.phase).toBe('turn-complete');
  });
});
