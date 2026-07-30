import { describe, expect, it } from 'vitest';
import { PROGRAM_CARDS, type ProgramAction } from './program-manifest';
import {
  applyProgramCard,
  applyReentryChoice,
  legalReentryChoices,
  movementBlockedByWall,
  resolveProgrammedTurn,
  type ProgramResolution,
  type RaceRobotPosition,
  type ResolutionTraceEntry
} from './movement';
import { createProgrammingState, submitProgram } from './programming';
import { deriveRaceSetup, riskyExchangeConfig } from './setup';

function card(action: ProgramAction) {
  return PROGRAM_CARDS.find((candidate) => candidate.action === action)!;
}

function raceRobot(
  overrides: Partial<RaceRobotPosition> & Pick<RaceRobotPosition, 'uid' | 'name' | 'x' | 'y'>
): RaceRobotPosition {
  return {
    robotId: 'axle',
    facing: 'north',
    archive: { x: overrides.x, y: overrides.y },
    lives: 3,
    damage: 0,
    status: 'active',
    destructionOrder: null,
    optionLossPending: false,
    ...overrides
  };
}

describe('priority Program movement', () => {
  it('accepts every one of the 84 unique printed priorities', () => {
    for (const programCard of PROGRAM_CARDS) {
      const robot = raceRobot({
        uid: 'robot',
        name: 'Robot',
        x: 6,
        y: 10
      });
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
    const robot = raceRobot({
      uid: 'robot',
      name: 'Robot',
      x: 6,
      y: 10
    });
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

    const robot = raceRobot({
      uid: 'robot',
      name: 'Robot',
      x: 6,
      y: 13,
      facing: 'north'
    });
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
        .map(({ priority }) => priority!);
      expect(priorities).toEqual([...priorities].sort((left, right) => right - left));
    }
    expect(resolution?.phase).toBe('turn-complete');
  });

  it('pushes chains transactionally and cancels the entire chain at a wall', () => {
    const robots = [
      raceRobot({ uid: 'actor', name: 'Actor', x: 4, y: 5, facing: 'east' }),
      raceRobot({ uid: 'middle', name: 'Middle', x: 5, y: 5 }),
      raceRobot({ uid: 'end', name: 'End', x: 6, y: 5 })
    ];
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard(robots, 'actor', card('move-1'), 1, trace);
    expect(robots.map(({ x, y }) => [x, y])).toEqual([
      [4, 5],
      [5, 5],
      [6, 5]
    ]);
    expect(trace).toContainEqual(expect.objectContaining({ kind: 'push-blocked-wall' }));
  });

  it('advances a push chain farthest-first and destroys pushed robots at the edge', () => {
    const robots = [
      raceRobot({ uid: 'actor', name: 'Actor', x: 9, y: 6, facing: 'east' }),
      raceRobot({ uid: 'middle', name: 'Middle', x: 10, y: 6 }),
      raceRobot({ uid: 'end', name: 'End', x: 11, y: 6 })
    ];
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard(robots, 'actor', card('move-3'), 1, trace);

    expect(robots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: 'actor', x: 12, y: 6, status: 'active' }),
        expect.objectContaining({
          uid: 'end',
          status: 'destroyed',
          destructionOrder: 1
        }),
        expect.objectContaining({
          uid: 'middle',
          status: 'destroyed',
          destructionOrder: 2
        })
      ])
    );
    expect(trace.filter(({ kind }) => kind === 'pushed')).toHaveLength(3);
  });

  it('destroys a pushed robot immediately when it enters a pit', () => {
    const robots = [
      raceRobot({ uid: 'actor', name: 'Actor', x: 1, y: 2, facing: 'east' }),
      raceRobot({ uid: 'victim', name: 'Victim', x: 2, y: 2 })
    ];
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard(robots, 'actor', card('move-1'), 1, trace);

    expect(robots[0]).toMatchObject({ x: 2, y: 2, status: 'active' });
    expect(robots[1]).toMatchObject({ status: 'destroyed', lives: 2 });
    expect(trace).toContainEqual(expect.objectContaining({ kind: 'destroyed-pit' }));
  });

  it('destroys robots immediately in pits and off course in exact destruction order', () => {
    const robots = [
      raceRobot({ uid: 'pit', name: 'Pit', x: 3, y: 1, facing: 'south' }),
      raceRobot({ uid: 'edge', name: 'Edge', x: 12, y: 6, facing: 'east' })
    ];
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard(robots, 'pit', card('move-1'), 1, trace);
    applyProgramCard(robots, 'edge', card('move-1'), 2, trace);

    expect(robots[0]).toMatchObject({
      status: 'destroyed',
      lives: 2,
      destructionOrder: 1
    });
    expect(robots[1]).toMatchObject({
      status: 'destroyed',
      lives: 2,
      destructionOrder: 2
    });
    expect(trace.map(({ kind }) => kind)).toEqual([
      'reveal',
      'destroyed-pit',
      'option-loss-placeholder',
      'life-lost',
      'reveal',
      'destroyed-edge',
      'option-loss-placeholder',
      'life-lost'
    ]);
  });

  it('eliminates a robot that loses its final Life', () => {
    const robot = raceRobot({
      uid: 'last-life',
      name: 'Last Life',
      x: 12,
      y: 6,
      facing: 'east',
      lives: 1
    });
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard([robot], robot.uid, card('move-1'), 1, trace);
    expect(robot).toMatchObject({ status: 'eliminated', lives: 0 });
    expect(trace.at(-1)?.kind).toBe('eliminated');
  });

  it('re-enters shared archives in destruction order with adjacent line-of-sight limits', () => {
    const first = raceRobot({
      uid: 'first',
      name: 'First',
      x: 8,
      y: 8,
      archive: { x: 6, y: 10 },
      status: 'destroyed',
      destructionOrder: 1,
      lives: 2
    });
    const second = raceRobot({
      uid: 'second',
      name: 'Second',
      x: 9,
      y: 8,
      archive: { x: 6, y: 10 },
      status: 'destroyed',
      destructionOrder: 2,
      lives: 2
    });
    let resolution: ProgramResolution = {
      phase: 'awaiting-reentry',
      robots: [first, second],
      trace: [] as ResolutionTraceEntry[],
      nextReentryUid: 'first'
    };

    expect(legalReentryChoices(resolution, 'second')).toEqual([]);
    resolution = applyReentryChoice(resolution, 'first', {
      x: 6,
      y: 10,
      facing: 'north'
    });
    expect(resolution.nextReentryUid).toBe('second');
    const secondChoices = legalReentryChoices(resolution, 'second');
    expect(secondChoices).not.toContainEqual({ x: 6, y: 10, facing: 'north' });
    expect(secondChoices.some(({ x, y }) => x !== 6 || y !== 10)).toBe(true);
    const selected = secondChoices.find(
      ({ x, y, facing }) => x === 5 && y === 9 && facing === 'west'
    )!;
    resolution = applyReentryChoice(resolution, 'second', selected);
    expect(resolution.phase).toBe('turn-complete');
    expect(resolution.robots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: 'first', x: 6, y: 10, damage: 2, status: 'active' }),
        expect.objectContaining({ uid: 'second', x: 5, y: 9, damage: 2, status: 'active' })
      ])
    );
  });
});
