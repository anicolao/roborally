import { describe, expect, it } from 'vitest';
import {
  DOCKING_BAY_A,
  EXCHANGE_BOARD,
  type BoardCell
} from './course-manifest';
import { PROGRAM_CARDS, type ProgramAction } from './program-manifest';
import {
  applyOptionLossChoice,
  applyProgramCard,
  applyReentryChoice,
  beginNextTurnPowerDowns,
  createRaceRobotPositions,
  legalReentryChoices,
  lockedRegisterNumbersForDamage,
  movementBlockedByWall,
  resolveBoardElements,
  resolveFlagsAndArchives,
  resolveLaserSnapshot,
  resolveProgrammedTurn,
  resolveRepairCleanup,
  type ProgramResolution,
  type RaceRobotPosition,
  type ResolutionTraceEntry
} from './movement';
import { createProgrammingState, submitProgram } from './programming';
import { deriveRaceSetup, riskyExchangeConfig } from './setup';
import { createOptionDeck } from './options';
import { compilePlayableCourse } from './playable-courses';

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
    lockedRegisters: [],
    touchedFlags: [],
    nextFlag: 1,
    pendingOptionDraws: 0,
    options: [],
    poweredDown: false,
    powerDownNextTurn: false,
    status: 'active',
    destructionOrder: null,
    optionLossPending: false,
    superiorArchivePending: false,
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
    expect(resolution?.playback.initialRobots).toEqual(
      expect.arrayContaining(
        setup.players.map((player) =>
          expect.objectContaining({
            uid: player.uid,
            x: player.position.x,
            y: player.position.y,
            facing: player.facing
          })
        )
      )
    );
    expect(resolution?.playback.frames).toHaveLength(32);
    for (let register = 1; register <= 5; register += 1) {
      const priorities = resolution!.trace
        .filter((entry) => entry.register === register && entry.kind === 'reveal')
        .map(({ priority }) => priority!);
      expect(priorities).toEqual([...priorities].sort((left, right) => right - left));
      const registerFrames = resolution!.playback.frames.filter(
        (frame) => frame.register === register
      );
      expect(registerFrames.map(({ stage }) => stage).slice(0, 6)).toEqual([
        'program-card',
        'program-card',
        'express-conveyors',
        'conveyors',
        'pushers',
        'gears'
      ]);
      expect(registerFrames.map(({ stage }) => stage).slice(6)).toEqual(
        registerFrames.length === 6 ? [] : ['lasers', 'laser-damage']
      );
      expect(
        registerFrames
          .filter(({ stage }) => stage === 'program-card')
          .map(({ trace }) => trace.find(({ kind }) => kind === 'reveal')?.priority)
      ).toEqual(priorities);
      expect(
        registerFrames.every(({ trace }) =>
          trace.every((entry) => entry.register === register)
        )
      ).toBe(true);
    }
    expect(resolution?.playback.frames.at(-1)?.robots).toEqual(resolution?.robots);
    expect(resolution?.phase).toBe('turn-complete');
  });

  it('keeps Program movement, conveyors, and gear rotation in separate playback stages', () => {
    const config = riskyExchangeConfig('STAGED-PLAYBACK');
    const setup = deriveRaceSetup(
      [
        { uid: 'hex', name: 'Hex', robotId: 'hex' },
        { uid: 'rivet', name: 'Rivet', robotId: 'rivet' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    programming.phase = 'programmed';
    const hexProgram = programming.players.find(({ uid }) => uid === 'hex')!;
    hexProgram.submitted = true;
    hexProgram.registers[0].cardId = card('move-1').id;
    hexProgram.registers[1].cardId = card('move-3').id;
    const robot = raceRobot({ uid: 'hex', name: 'Hex', x: 4, y: 11, facing: 'north' });
    const spectator = raceRobot({ uid: 'rivet', name: 'Rivet', x: 12, y: 12 });

    const resolution = resolveProgrammedTurn(programming, setup, [robot, spectator]);
    const firstRegister = resolution!.playback.frames.filter(({ register }) => register === 1);

    expect(firstRegister.map(({ stage }) => stage)).toEqual([
      'program-card',
      'express-conveyors',
      'conveyors',
      'pushers',
      'gears'
    ]);
    expect(firstRegister[0].robots[0]).toMatchObject({ x: 4, y: 10, facing: 'north' });
    expect(firstRegister[1].robots[0]).toMatchObject({ x: 4, y: 10, facing: 'north' });
    expect(firstRegister[2].robots[0]).toMatchObject({ x: 4, y: 9, facing: 'north' });
    expect(firstRegister[3].robots[0]).toMatchObject({ x: 4, y: 9, facing: 'north' });
    expect(firstRegister[4].robots[0]).toMatchObject({ x: 4, y: 9, facing: 'west' });
    expect(firstRegister[2].trace.map(({ kind }) => kind)).toContain('conveyor');
    expect(firstRegister[4].trace.map(({ kind }) => kind)).toContain('gear');

    const secondRegister = resolution!.playback.frames.filter(({ register }) => register === 2);
    expect(secondRegister[0]).toMatchObject({ stage: 'program-card' });
    expect(secondRegister[0].robots[0]).toMatchObject({
      x: 1,
      y: 9,
      facing: 'west',
      status: 'active',
      lives: 3
    });
    expect(secondRegister[1]).toMatchObject({ stage: 'express-conveyors' });
    expect(secondRegister[1].robots[0]).toMatchObject({ status: 'active', lives: 3 });
    expect(secondRegister[2]).toMatchObject({ stage: 'conveyors' });
    expect(secondRegister[2].robots[0]).toMatchObject({ status: 'destroyed', lives: 2 });
    expect(secondRegister[2].trace.map(({ kind }) => kind)).toContain('destroyed-edge');
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

  it('resolves movement against the configured Factory Rejects geometry', () => {
    const riskyRobot = raceRobot({
      uid: 'risky',
      name: 'Risky',
      x: 3,
      y: 3,
      facing: 'east'
    });
    const rejectRobot = raceRobot({
      uid: 'reject',
      name: 'Reject',
      x: 3,
      y: 3,
      facing: 'east'
    });
    const riskyTrace: ResolutionTraceEntry[] = [];
    const rejectTrace: ResolutionTraceEntry[] = [];

    applyProgramCard([riskyRobot], 'risky', card('move-1'), 1, riskyTrace);
    applyProgramCard(
      [rejectRobot],
      'reject',
      card('move-1'),
      1,
      rejectTrace,
      undefined,
      compilePlayableCourse('factory-rejects')
    );

    expect(riskyRobot).toMatchObject({ x: 4, y: 3, status: 'active' });
    expect(rejectRobot).toMatchObject({ status: 'destroyed', lives: 2 });
    expect(rejectTrace).toContainEqual(expect.objectContaining({ kind: 'destroyed-pit' }));
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
      'option-loss',
      'life-lost',
      'reveal',
      'destroyed-edge',
      'option-loss',
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
      turnNumber: 1,
      phase: 'awaiting-reentry',
      robots: [first, second],
      trace: [] as ResolutionTraceEntry[],
      optionDeck: createOptionDeck('reentry-order'),
      nextOptionChoiceUid: null,
      nextReentryUid: 'first',
      winnerUids: [],
      runnersUpUids: [],
      summary: null,
      playback: { initialRobots: [], frames: [] }
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

  it('lets a destroyed announcer decide whether re-entry begins the promised shutdown', () => {
    const destroyed = raceRobot({
      uid: 'announcer',
      name: 'Announcer',
      x: 8,
      y: 8,
      archive: { x: 6, y: 10 },
      damage: 0,
      status: 'destroyed',
      destructionOrder: 1,
      lives: 2,
      powerDownNextTurn: true
    });
    const awaiting: ProgramResolution = {
      turnNumber: 1,
      phase: 'awaiting-reentry',
      robots: [destroyed],
      trace: [],
      optionDeck: createOptionDeck('destroyed-announcer'),
      nextOptionChoiceUid: null,
      nextReentryUid: destroyed.uid,
      winnerUids: [],
      runnersUpUids: [],
      summary: null,
      playback: { initialRobots: [], frames: [] }
    };

    const reenteredDown = applyReentryChoice(awaiting, destroyed.uid, {
      x: 6,
      y: 10,
      facing: 'north',
      poweredDown: true
    });
    expect(reenteredDown.robots[0]).toMatchObject({
      status: 'active',
      damage: 2,
      powerDownNextTurn: true,
      poweredDown: false
    });
    expect(beginNextTurnPowerDowns(reenteredDown.robots)[0]).toMatchObject({
      damage: 0,
      powerDownNextTurn: false,
      poweredDown: true
    });

    const reenteredActive = applyReentryChoice(awaiting, destroyed.uid, {
      x: 6,
      y: 10,
      facing: 'north',
      poweredDown: false
    });
    expect(reenteredActive.robots[0]).toMatchObject({
      damage: 2,
      powerDownNextTurn: false,
      poweredDown: false
    });
  });

  it('has movement fixtures for every conveyor and gear on the selected course', () => {
    const cells = [
      ...EXCHANGE_BOARD.cells,
      ...DOCKING_BAY_A.cells.map((entry) => ({ ...entry, y: entry.y + 12 }))
    ];
    const conveyors = cells.filter(({ elements }) =>
      elements.some(({ kind }) => kind === 'conveyor')
    );
    const gears = cells.filter(({ elements }) => elements.some(({ kind }) => kind === 'gear'));
    expect(conveyors).toHaveLength(68);
    expect(gears).toHaveLength(5);

    for (const [index, cell] of [...conveyors, ...gears].entries()) {
      const robot = raceRobot({
        uid: `fixture-${index}`,
        name: `Fixture ${index}`,
        x: cell.x,
        y: cell.y
      });
      const trace: ResolutionTraceEntry[] = [];
      resolveBoardElements([robot], 1, trace);
      expect(trace.length, `element fixture at ${cell.x},${cell.y}`).toBeGreaterThan(0);
    }
  });

  it('moves express then normal conveyors, rotates curves, and follows dependencies', () => {
    const cells: BoardCell[] = [
      {
        x: 1,
        y: 1,
        elements: [{ kind: 'conveyor', direction: 'east', express: true, turn: 'right' }]
      },
      {
        x: 2,
        y: 1,
        elements: [{ kind: 'conveyor', direction: 'south', express: false }]
      },
      {
        x: 8,
        y: 8,
        elements: [{ kind: 'conveyor', direction: 'east', express: true, turn: 'left' }]
      },
      {
        x: 9,
        y: 8,
        elements: [{ kind: 'conveyor', direction: 'north', express: false }]
      },
      {
        x: 4,
        y: 4,
        elements: [{ kind: 'conveyor', direction: 'east', express: false }]
      },
      {
        x: 5,
        y: 4,
        elements: [{ kind: 'conveyor', direction: 'east', express: false }]
      }
    ];
    const curve = raceRobot({ uid: 'curve', name: 'Curve', x: 1, y: 1 });
    const leftCurve = raceRobot({ uid: 'left-curve', name: 'Left Curve', x: 8, y: 8 });
    const follower = raceRobot({ uid: 'follower', name: 'Follower', x: 4, y: 4 });
    const leader = raceRobot({ uid: 'leader', name: 'Leader', x: 5, y: 4 });
    const trace: ResolutionTraceEntry[] = [];
    resolveBoardElements([curve, leftCurve, follower, leader], 1, trace, cells);

    expect(curve).toMatchObject({ x: 2, y: 2, facing: 'east' });
    expect(leftCurve).toMatchObject({ x: 9, y: 7, facing: 'west' });
    expect(follower).toMatchObject({ x: 5, y: 4 });
    expect(leader).toMatchObject({ x: 6, y: 4 });
    expect(trace.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['express-conveyor', 'conveyor'])
    );
  });

  it('rejects converging conveyor destinations atomically', () => {
    const cells: BoardCell[] = [
      {
        x: 1,
        y: 2,
        elements: [{ kind: 'conveyor', direction: 'east', express: false }]
      },
      {
        x: 3,
        y: 2,
        elements: [{ kind: 'conveyor', direction: 'west', express: false }]
      }
    ];
    const left = raceRobot({ uid: 'left', name: 'Left', x: 1, y: 2 });
    const right = raceRobot({ uid: 'right', name: 'Right', x: 3, y: 2 });
    const trace: ResolutionTraceEntry[] = [];
    resolveBoardElements([left, right], 1, trace, cells);

    expect([left.x, left.y, right.x, right.y]).toEqual([1, 2, 3, 2]);
    expect(trace.filter(({ kind }) => kind === 'conveyor-conflict')).toHaveLength(2);
  });

  it('rejects ambiguous conveyor swaps and dependency cycles', () => {
    const cells: BoardCell[] = [
      {
        x: 5,
        y: 6,
        elements: [{ kind: 'conveyor', direction: 'east', express: false }]
      },
      {
        x: 6,
        y: 6,
        elements: [{ kind: 'conveyor', direction: 'west', express: false }]
      }
    ];
    const left = raceRobot({ uid: 'left', name: 'Left', x: 5, y: 6 });
    const right = raceRobot({ uid: 'right', name: 'Right', x: 6, y: 6 });
    const trace: ResolutionTraceEntry[] = [];
    resolveBoardElements([left, right], 1, trace, cells);

    expect([left.x, right.x]).toEqual([5, 6]);
    expect(trace.filter(({ kind }) => kind === 'conveyor-conflict')).toHaveLength(2);
  });

  it('activates only register-numbered pushers and rotates both gear directions', () => {
    const cells: BoardCell[] = [
      {
        x: 4,
        y: 6,
        elements: [{ kind: 'pusher', direction: 'east', activeRegisters: [2, 4] }]
      },
      {
        x: 7,
        y: 6,
        elements: [{ kind: 'gear', rotation: 'clockwise' }]
      },
      {
        x: 8,
        y: 6,
        elements: [{ kind: 'gear', rotation: 'counterclockwise' }]
      }
    ];
    const pushed = raceRobot({ uid: 'pushed', name: 'Pushed', x: 4, y: 6 });
    const clockwise = raceRobot({ uid: 'clockwise', name: 'Clockwise', x: 7, y: 6 });
    const counter = raceRobot({ uid: 'counter', name: 'Counter', x: 8, y: 6 });
    const trace: ResolutionTraceEntry[] = [];

    resolveBoardElements([pushed, clockwise, counter], 1, trace, cells);
    expect(pushed.x).toBe(4);
    expect(clockwise.facing).toBe('east');
    expect(counter.facing).toBe('west');
    resolveBoardElements([pushed], 2, trace, cells);
    expect(pushed.x).toBe(5);
    expect(trace).toContainEqual(expect.objectContaining({ kind: 'pusher' }));
  });

  it('casts robot lasers to the first target and stops at walls and intervening robots', () => {
    const programming = createProgrammingState(
      deriveRaceSetup(
        [
          { uid: 'shooter', name: 'Shooter', robotId: 'axle' },
          { uid: 'target', name: 'Target', robotId: 'bit' }
        ],
        riskyExchangeConfig('LASER-RAYS')
      ),
      riskyExchangeConfig('LASER-RAYS')
    );
    const shooter = raceRobot({
      uid: 'shooter',
      name: 'Shooter',
      x: 1,
      y: 6,
      facing: 'east'
    });
    const target = raceRobot({ uid: 'target', name: 'Target', x: 3, y: 6 });
    const behind = raceRobot({ uid: 'behind', name: 'Behind', x: 5, y: 6 });
    const trace: ResolutionTraceEntry[] = [];
    const fired = resolveLaserSnapshot([shooter, target, behind], 1, trace, programming, []);
    expect(target.damage).toBe(1);
    expect(behind.damage).toBe(0);
    expect(fired.laserBeams).toEqual([
      expect.objectContaining({
        sourceUid: 'shooter',
        targetUid: 'target',
        fromX: 1,
        toX: 3,
        beamCount: 1
      })
    ]);

    const blockedShooter = raceRobot({
      uid: 'blocked',
      name: 'Blocked',
      x: 4,
      y: 5,
      facing: 'east'
    });
    const blockedTarget = raceRobot({
      uid: 'blocked-target',
      name: 'Blocked Target',
      x: 6,
      y: 5
    });
    resolveLaserSnapshot(
      [blockedShooter, blockedTarget],
      2,
      trace,
      programming,
      []
    );
    expect(blockedTarget.damage).toBe(0);
  });

  it('takes board and robot targets from one snapshot and locks damage registers', () => {
    const config = riskyExchangeConfig('LASER-LOCKS');
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
        1_000
      );
    }
    const robots = createRaceRobotPositions(setup);
    const target = robots[0];
    const other = robots[1];
    target.x = 10;
    target.y = 3;
    target.damage = 4;
    other.x = 1;
    other.y = 16;
    other.facing = 'south';
    const laserLane: BoardCell[] = [
      {
        x: 10,
        y: 3,
        elements: [{ kind: 'laser', direction: 'east', beamCount: 1 }]
      }
    ];
    const trace: ResolutionTraceEntry[] = [];

    for (let register = 1; register <= 5; register += 1) {
      resolveLaserSnapshot(robots, register, trace, programming, laserLane);
    }

    expect(target.damage).toBe(9);
    expect(target.lockedRegisters.map(({ register }) => register)).toEqual([1, 2, 3, 4, 5]);
    expect(target.lockedRegisters.map(({ cardId }) => cardId)).toEqual(
      programming.players[0].registers.map(({ cardId }) => cardId)
    );
    expect(trace.filter(({ kind }) => kind === 'board-laser')).toHaveLength(5);
  });

  it('lets the nearest robot block a contiguous multi-beam board-laser lane', () => {
    const config = riskyExchangeConfig('BOARD-BEAM');
    const setup = deriveRaceSetup(
      [
        { uid: 'near', name: 'Near', robotId: 'axle' },
        { uid: 'far', name: 'Far', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    const near = raceRobot({
      uid: 'near',
      name: 'Near',
      x: 10,
      y: 3,
      facing: 'north'
    });
    const far = raceRobot({
      uid: 'far',
      name: 'Far',
      x: 12,
      y: 3,
      facing: 'south'
    });
    const cells: BoardCell[] = [10, 11, 12].map((x) => ({
      x,
      y: 3,
      elements: [{ kind: 'laser', direction: 'east', beamCount: 2 }]
    }));
    const trace: ResolutionTraceEntry[] = [];
    resolveLaserSnapshot([near, far], 1, trace, programming, cells);

    expect(near.damage).toBe(2);
    expect(far.damage).toBe(0);
    expect(trace.filter(({ kind }) => kind === 'board-laser')).toHaveLength(2);
  });

  it('destroys on tenth damage and repeats all five fully locked cards', () => {
    expect(
      Array.from({ length: 10 }, (_, damage) => lockedRegisterNumbersForDamage(damage))
    ).toEqual([
      [],
      [],
      [],
      [],
      [],
      [5],
      [4, 5],
      [3, 4, 5],
      [2, 3, 4, 5],
      [1, 2, 3, 4, 5]
    ]);

    const config = riskyExchangeConfig('FULLY-LOCKED');
    const setup = deriveRaceSetup(
      [
        { uid: 'host', name: 'Ada', robotId: 'axle' },
        { uid: 'guest', name: 'Grace', robotId: 'bit' }
      ],
      config
    );
    const lockedUid = setup.players[0].uid;
    const lockedCards = {
      1: 'program-010',
      2: 'program-020',
      3: 'program-030',
      4: 'program-040',
      5: 'program-050'
    } as const;
    let programming = createProgrammingState(
      setup,
      config,
      { [lockedUid]: 9 },
      { [lockedUid]: lockedCards }
    );
    for (const player of programming.players) {
      programming = submitProgram(
        programming,
        player.uid,
        player.uid === lockedUid ? [] : player.hand.slice(0, 5),
        1_000
      );
    }
    const repeated = resolveProgrammedTurn(programming, setup)!;
    expect(
      repeated.trace
        .filter(({ actorUid, kind }) => actorUid === lockedUid && kind === 'reveal')
        .map(({ cardId }) => cardId)
    ).toEqual(Object.values(lockedCards));

    const doomed = raceRobot({
      uid: 'doomed',
      name: 'Doomed',
      x: 10,
      y: 3,
      damage: 9,
      lives: 1
    });
    const trace: ResolutionTraceEntry[] = [];
    resolveLaserSnapshot(
      [doomed],
      1,
      trace,
      programming,
      [
        {
          x: 10,
          y: 3,
          elements: [{ kind: 'laser', direction: 'east', beamCount: 1 }]
        }
      ]
    );
    expect(doomed).toMatchObject({ status: 'eliminated', lives: 0, damage: 0 });
    expect(trace).toContainEqual(expect.objectContaining({ kind: 'destroyed-damage' }));
  });

  it('discards an Option chosen at the exact damage point', () => {
    const config = riskyExchangeConfig('OPTION-PREVENTION');
    const setup = deriveRaceSetup(
      [
        { uid: 'target', name: 'Target', robotId: 'axle' },
        { uid: 'observer', name: 'Observer', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    const target = raceRobot({
      uid: 'target',
      name: 'Target',
      x: 10,
      y: 3,
      damage: 4,
      options: [{ cardId: 'brakes', spent: 0, storedProgramCardId: null }]
    });
    const optionDeck = createOptionDeck('OPTION-PREVENTION');
    const trace: ResolutionTraceEntry[] = [];

    resolveLaserSnapshot(
      [target],
      1,
      trace,
      programming,
      [
        {
          x: 10,
          y: 3,
          elements: [{ kind: 'laser', direction: 'east', beamCount: 1 }]
        }
      ],
      optionDeck,
      {
        'r1-damage-01-target': {
          decisionId: 'r1-damage-01-target',
          uid: 'target',
          choiceId: 'discard:brakes'
        }
      }
    );

    expect(target.damage).toBe(4);
    expect(target.options).toEqual([]);
    expect(optionDeck.discardPile).toContain('brakes');
    expect(trace).toContainEqual(
      expect.objectContaining({ kind: 'option-damage-prevented' })
    );
  });

  it('pauses simultaneous laser damage for persisted choices in Dock order', () => {
    const config = riskyExchangeConfig('DOCK-ORDERED-DAMAGE');
    const setup = deriveRaceSetup(
      [
        { uid: 'dock-1', name: 'Dock One', robotId: 'axle' },
        { uid: 'dock-2', name: 'Dock Two', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    const robots = () => [
      raceRobot({
        uid: 'dock-1',
        name: 'Dock One',
        x: 3,
        y: 6,
        facing: 'east',
        options: [{ cardId: 'brakes', spent: 0, storedProgramCardId: null }]
      }),
      raceRobot({
        uid: 'dock-2',
        name: 'Dock Two',
        x: 3,
        y: 8,
        facing: 'east',
        options: [{ cardId: 'brakes', spent: 0, storedProgramCardId: null }]
      }),
      raceRobot({ uid: 'laser-1', name: 'Laser One', x: 1, y: 6, facing: 'east' }),
      raceRobot({ uid: 'laser-2', name: 'Laser Two', x: 1, y: 8, facing: 'east' })
    ];

    const firstRobots = robots();
    const first = resolveLaserSnapshot(firstRobots, 1, [], programming, []);
    expect(first.laserBeams).toHaveLength(2);
    expect(first.pendingOptionDecision).toMatchObject({
      decisionId: 'r1-damage-01-dock-1',
      uid: 'dock-1'
    });
    expect(firstRobots[0].damage).toBe(0);
    expect(firstRobots[1].damage).toBe(0);

    const secondRobots = robots();
    const second = resolveLaserSnapshot(secondRobots, 1, [], programming, [], undefined, {
      'r1-damage-01-dock-1': {
        decisionId: 'r1-damage-01-dock-1',
        uid: 'dock-1',
        choiceId: 'take-damage'
      }
    });
    expect(second.pendingOptionDecision).toMatchObject({
      decisionId: 'r1-damage-02-dock-2',
      uid: 'dock-2'
    });
    expect(secondRobots[0].damage).toBe(1);
    expect(secondRobots[1].damage).toBe(0);

    const finalRobots = robots();
    const final = resolveLaserSnapshot(finalRobots, 1, [], programming, [], createOptionDeck('DOCK-ORDERED-DAMAGE'), {
      'r1-damage-01-dock-1': {
        decisionId: 'r1-damage-01-dock-1',
        uid: 'dock-1',
        choiceId: 'take-damage'
      },
      'r1-damage-02-dock-2': {
        decisionId: 'r1-damage-02-dock-2',
        uid: 'dock-2',
        choiceId: 'discard:brakes'
      }
    });
    expect(final.pendingOptionDecision).toBeNull();
    expect(finalRobots[0].damage).toBe(1);
    expect(finalRobots[1].damage).toBe(0);
    expect(finalRobots[1].options).toEqual([]);
  });

  it('applies reviewed factory-rotation Option hooks', () => {
    const trace: ResolutionTraceEntry[] = [];
    const stable = raceRobot({
      uid: 'stable',
      name: 'Stable',
      x: 1,
      y: 1,
      options: [
        { cardId: 'gyroscopic-stabilizer', spent: 0, storedProgramCardId: null }
      ]
    });
    resolveBoardElements(
      [stable],
      1,
      trace,
      [{ x: 1, y: 1, elements: [{ kind: 'gear', rotation: 'clockwise' }] }],
      {
        stable: {
          kind: 'option-plan',
          activations: [
            {
              cardId: 'gyroscopic-stabilizer',
              register: null,
              mode: 'activate',
              targetUid: null,
              targetOptionId: null
            }
          ]
        }
      }
    );
    expect(stable.facing).toBe('north');
  });

  it('pauses Brakes at Move 1 execution and replays the persisted choice', () => {
    const createMover = () =>
      raceRobot({
        uid: 'braker',
        name: 'Braker',
        x: 6,
        y: 10,
        facing: 'north',
        options: [{ cardId: 'brakes', spent: 0, storedProgramCardId: null }]
      });
    const pendingMover = createMover();
    const pending = applyProgramCard(
      [pendingMover],
      pendingMover.uid,
      card('move-1'),
      2,
      []
    );
    expect(pending).toMatchObject({
      decisionId: 'r2-program-braker-brakes',
      uid: 'braker',
      cardId: 'brakes',
      timing: 'program-movement'
    });
    expect(pendingMover).toMatchObject({ x: 6, y: 10 });

    const stoppedMover = createMover();
    const trace: ResolutionTraceEntry[] = [];
    expect(
      applyProgramCard(
        [stoppedMover],
        stoppedMover.uid,
        card('move-1'),
        2,
        trace,
        undefined,
        undefined,
        {
          'r2-program-braker-brakes': {
            decisionId: 'r2-program-braker-brakes',
            uid: 'braker',
            choiceId: 'use'
          }
        }
      )
    ).toBeNull();
    expect(stoppedMover).toMatchObject({ x: 6, y: 10 });
    expect(trace).toContainEqual(
      expect.objectContaining({ kind: 'option-effect', text: expect.stringContaining('zero spaces') })
    );
  });

  it('pauses Fourth Gear at Move 3 execution and replays the persisted choice', () => {
    const createMover = () =>
      raceRobot({
        uid: 'mover',
        name: 'Mover',
        x: 6,
        y: 10,
        facing: 'north',
        options: [{ cardId: 'fourth-gear', spent: 0, storedProgramCardId: null }]
      });
    const pendingMover = createMover();
    const pending = applyProgramCard(
      [pendingMover],
      pendingMover.uid,
      card('move-3'),
      2,
      []
    );
    expect(pending).toMatchObject({
      decisionId: 'r2-program-mover-fourth-gear',
      uid: 'mover',
      cardId: 'fourth-gear',
      timing: 'program-movement'
    });
    expect(pendingMover).toMatchObject({ x: 6, y: 10 });

    const acceleratedMover = createMover();
    const trace: ResolutionTraceEntry[] = [];
    expect(
      applyProgramCard(
        [acceleratedMover],
        acceleratedMover.uid,
        card('move-3'),
        2,
        trace,
        undefined,
        undefined,
        {
          'r2-program-mover-fourth-gear': {
            decisionId: 'r2-program-mover-fourth-gear',
            uid: 'mover',
            choiceId: 'use'
          }
        }
      )
    ).toBeNull();
    expect(acceleratedMover).toMatchObject({ x: 6, y: 6 });
    expect(trace).toContainEqual(
      expect.objectContaining({
        kind: 'option-effect',
        text: expect.stringContaining('four spaces')
      })
    );
  });

  it('pauses Reverse Gears at Back Up execution and replays the persisted choice', () => {
    const createMover = () =>
      raceRobot({
        uid: 'reverser',
        name: 'Reverser',
        x: 6,
        y: 6,
        facing: 'north',
        options: [{ cardId: 'reverse-gears', spent: 0, storedProgramCardId: null }]
      });
    const pendingMover = createMover();
    const pending = applyProgramCard(
      [pendingMover],
      pendingMover.uid,
      card('back-up'),
      3,
      []
    );
    expect(pending).toMatchObject({
      decisionId: 'r3-program-reverser-reverse-gears',
      uid: 'reverser',
      cardId: 'reverse-gears',
      timing: 'program-movement'
    });
    expect(pendingMover).toMatchObject({ x: 6, y: 6 });

    const acceleratedMover = createMover();
    const trace: ResolutionTraceEntry[] = [];
    expect(
      applyProgramCard(
        [acceleratedMover],
        acceleratedMover.uid,
        card('back-up'),
        3,
        trace,
        undefined,
        undefined,
        {
          'r3-program-reverser-reverse-gears': {
            decisionId: 'r3-program-reverser-reverse-gears',
            uid: 'reverser',
            choiceId: 'use'
          }
        }
      )
    ).toBeNull();
    expect(acceleratedMover).toMatchObject({ x: 6, y: 8 });
    expect(trace).toContainEqual(
      expect.objectContaining({
        kind: 'option-effect',
        text: expect.stringContaining('backward two spaces')
      })
    );
  });

  it('applies armor, laser, circuit-breaker, and archive-copy hooks', () => {
    const config = riskyExchangeConfig('OPTION-HOOKS');
    const setup = deriveRaceSetup(
      [
        { uid: 'shooter', name: 'Shooter', robotId: 'axle' },
        { uid: 'target', name: 'Target', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    const shooter = raceRobot({
      uid: 'shooter',
      name: 'Shooter',
      x: 1,
      y: 6,
      facing: 'east',
      options: [
        { cardId: 'double-barrel-laser', spent: 0, storedProgramCardId: null }
      ]
    });
    const target = raceRobot({
      uid: 'target',
      name: 'Target',
      x: 3,
      y: 6,
      options: [{ cardId: 'ablative-coat', spent: 2, storedProgramCardId: null }]
    });
    const optionDeck = createOptionDeck('OPTION-HOOKS');
    const trace: ResolutionTraceEntry[] = [];
    resolveLaserSnapshot(
      [shooter, target],
      1,
      trace,
      programming,
      [],
      optionDeck,
      {
        'r1-damage-01-target': {
          decisionId: 'r1-damage-01-target',
          uid: 'target',
          choiceId: 'take-damage'
        }
      }
    );
    expect(target.damage).toBe(1);
    expect(target.options).toEqual([]);
    expect(optionDeck.discardPile).toContain('ablative-coat');

    target.options = [
      { cardId: 'circuit-breaker', spent: 0, storedProgramCardId: null }
    ];
    target.damage = 3;
    resolveRepairCleanup([target], trace, []);
    expect(target.powerDownNextTurn).toBe(true);
    target.powerDownNextTurn = false;
    resolveRepairCleanup([target], trace, [], undefined, false);
    expect(target.powerDownNextTurn).toBe(false);

    target.status = 'destroyed';
    target.destructionOrder = 1;
    target.archive = { x: 3, y: 6 };
    target.optionLossPending = false;
    target.superiorArchivePending = true;
    const awaiting: ProgramResolution = {
      turnNumber: 2,
      phase: 'awaiting-reentry',
      robots: [target],
      trace,
      optionDeck,
      nextOptionChoiceUid: null,
      nextReentryUid: target.uid,
      winnerUids: [],
      runnersUpUids: [],
      summary: null,
      playback: { initialRobots: [], frames: [] }
    };
    const reentered = applyReentryChoice(awaiting, target.uid, {
      x: 3,
      y: 6,
      facing: 'north'
    });
    expect(reentered.robots[0]).toMatchObject({
      damage: 3,
      superiorArchivePending: false
    });
  });

  it('applies all three mandatory Ablative Coat absorptions before offering choices', () => {
    const config = riskyExchangeConfig('ABLATIVE-COAT');
    const setup = deriveRaceSetup(
      [
        { uid: 'shooter', name: 'Shooter', robotId: 'axle' },
        { uid: 'target', name: 'Target', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(setup, config);
    const shooter = raceRobot({
      uid: 'shooter',
      name: 'Shooter',
      x: 1,
      y: 6,
      facing: 'east'
    });
    const target = raceRobot({
      uid: 'target',
      name: 'Target',
      x: 3,
      y: 6,
      options: [
        { cardId: 'ablative-coat', spent: 0, storedProgramCardId: null },
        { cardId: 'brakes', spent: 0, storedProgramCardId: null }
      ]
    });
    const optionDeck = createOptionDeck('ABLATIVE-COAT');
    const trace: ResolutionTraceEntry[] = [];

    for (let register = 1; register <= 3; register += 1) {
      const result = resolveLaserSnapshot(
        [shooter, target],
        register,
        trace,
        programming,
        [],
        optionDeck
      );
      expect(result.pendingOptionDecision).toBeNull();
      expect(target.damage).toBe(0);
    }
    expect(target.options.map(({ cardId }) => cardId)).toEqual(['brakes']);
    expect(optionDeck.discardPile).toContain('ablative-coat');
    expect(trace.filter(({ text }) => text.includes('ablative coat absorbed'))).toHaveLength(3);

    const fourth = resolveLaserSnapshot(
      [shooter, target],
      4,
      trace,
      programming,
      [],
      optionDeck
    );
    expect(fourth.pendingOptionDecision).toMatchObject({
      uid: 'target',
      timing: 'damage'
    });
  });

  it('requires named Option loss before the destroyed robot may re-enter', () => {
    const destroyed = raceRobot({
      uid: 'owner',
      name: 'Owner',
      x: 8,
      y: 8,
      archive: { x: 6, y: 10 },
      status: 'destroyed',
      destructionOrder: 1,
      lives: 2,
      optionLossPending: true,
      options: [
        { cardId: 'brakes', spent: 0, storedProgramCardId: null },
        { cardId: 'rear-laser', spent: 0, storedProgramCardId: null }
      ]
    });
    const awaiting: ProgramResolution = {
      turnNumber: 3,
      phase: 'awaiting-option',
      robots: [destroyed],
      trace: [],
      optionDeck: createOptionDeck('OPTION-LOSS'),
      nextOptionChoiceUid: 'owner',
      nextReentryUid: null,
      winnerUids: [],
      runnersUpUids: [],
      summary: null,
      playback: { initialRobots: [], frames: [] }
    };

    expect(applyOptionLossChoice(awaiting, 'other', 'brakes')).toBe(awaiting);
    const discarded = applyOptionLossChoice(awaiting, 'owner', 'rear-laser');
    expect(discarded).not.toBe(awaiting);
    expect(discarded.phase).toBe('awaiting-reentry');
    expect(discarded.nextReentryUid).toBe('owner');
    expect(discarded.robots[0].options.map(({ cardId }) => cardId)).toEqual(['brakes']);
    expect(discarded.optionDeck.discardPile).toContain('rear-laser');
  });

  it('updates archives every register but only touches flags in order', () => {
    const robot = raceRobot({ uid: 'runner', name: 'Runner', x: 10, y: 8 });
    const trace: ResolutionTraceEntry[] = [];
    const flags = [
      { number: 1, x: 8, y: 2 },
      { number: 2, x: 10, y: 8 },
      { number: 3, x: 2, y: 5 },
      { number: 4, x: 1, y: 1 }
    ];

    expect(resolveFlagsAndArchives([robot], 1, trace, undefined, flags)).toEqual([]);
    expect(robot).toMatchObject({
      archive: { x: 10, y: 8 },
      touchedFlags: [],
      nextFlag: 1
    });

    robot.x = 8;
    robot.y = 2;
    resolveFlagsAndArchives([robot], 2, trace, undefined, flags);
    robot.x = 10;
    robot.y = 8;
    resolveFlagsAndArchives([robot], 3, trace, undefined, flags);
    robot.x = 2;
    robot.y = 5;
    expect(resolveFlagsAndArchives([robot], 4, trace, undefined, flags)).toEqual([]);
    robot.x = 1;
    robot.y = 1;
    expect(resolveFlagsAndArchives([robot], 5, trace, undefined, flags)).toEqual(['runner']);
    expect(robot).toMatchObject({
      archive: { x: 1, y: 1 },
      touchedFlags: [1, 2, 3, 4],
      nextFlag: null
    });
    expect(trace.filter(({ kind }) => kind === 'flag-touched')).toHaveLength(4);
    expect(trace.filter(({ kind }) => kind === 'archive-updated')).toHaveLength(5);
  });

  it('repairs once in cleanup, unlocks low registers first, and preserves Option draws', () => {
    const single = raceRobot({
      uid: 'single',
      name: 'Single',
      x: 1,
      y: 1,
      damage: 9,
      lockedRegisters: [
        { register: 1, cardId: 'program-010' },
        { register: 2, cardId: 'program-020' },
        { register: 3, cardId: 'program-030' },
        { register: 4, cardId: 'program-040' },
        { register: 5, cardId: 'program-050' }
      ]
    });
    const crossed = raceRobot({
      uid: 'crossed',
      name: 'Crossed',
      x: 8,
      y: 8,
      damage: 5,
      lockedRegisters: [{ register: 5, cardId: 'program-060' }]
    });
    const trace: ResolutionTraceEntry[] = [];
    const optionDeck = createOptionDeck('repair-draw');
    const drawnCardId = optionDeck.drawPile[0];

    resolveRepairCleanup([single, crossed], trace, undefined, optionDeck);
    expect(single).toMatchObject({
      damage: 8,
      pendingOptionDraws: 0,
      lockedRegisters: [
        { register: 2 },
        { register: 3 },
        { register: 4 },
        { register: 5 }
      ]
    });
    expect(crossed).toMatchObject({
      damage: 4,
      pendingOptionDraws: 0,
      options: [{ cardId: drawnCardId, spent: 0, storedProgramCardId: null }],
      lockedRegisters: []
    });
    expect(trace).toContainEqual(
      expect.objectContaining({
        kind: 'register-unlocked',
        text: expect.stringContaining('register 1')
      })
    );
    expect(trace).toContainEqual(expect.objectContaining({ kind: 'option-drawn' }));
  });

  it('applies generic Option World repair and flag awards during real resolution cleanup', () => {
    const course = compilePlayableCourse('option-world');
    const cells = [...course.cells.values()];
    const robot = raceRobot({ uid: 'option-world', name: 'Optioner', x: 6, y: 6, damage: 4 });
    const trace: ResolutionTraceEntry[] = [];
    const optionDeck = createOptionDeck('OPTION-WORLD-RULES');
    const firstOption = optionDeck.drawPile[0];
    resolveRepairCleanup([robot], trace, cells, optionDeck, true, course);

    expect(robot.damage).toBe(4);
    expect(robot.options).toHaveLength(2);
    expect(robot.options[0].cardId).toBe(firstOption);
    expect(trace.filter(({ kind }) => kind === 'option-drawn')).toHaveLength(2);

    robot.x = 4;
    robot.y = 6;
    robot.nextFlag = 1;
    resolveFlagsAndArchives([robot], 1, trace, cells, course.course.flags, course, undefined, optionDeck);
    expect(robot.touchedFlags).toEqual([1]);
    expect(trace.filter(({ kind }) => kind === 'option-drawn')).toHaveLength(3);
  });

  it('ends immediately on Flag 3 with frozen simultaneous winners', () => {
    const config = riskyExchangeConfig('FLAG-FINISH');
    const setup = deriveRaceSetup(
      [
        { uid: 'winner', name: 'Winner', robotId: 'axle' },
        { uid: 'runner-up', name: 'Runner Up', robotId: 'bit' }
      ],
      config
    );
    let programming = createProgrammingState(setup, config);
    for (const player of programming.players) {
      programming = submitProgram(programming, player.uid, player.hand.slice(0, 5), 1_000);
    }
    const rotations = PROGRAM_CARDS.filter(({ action }) =>
      ['rotate-left', 'rotate-right', 'u-turn'].includes(action)
    );
    programming.players.forEach((player, playerIndex) => {
      player.registers.forEach((register, registerIndex) => {
        register.cardId = rotations[playerIndex * 5 + registerIndex].id;
      });
    });
    const robots = createRaceRobotPositions(setup);
    for (const robot of robots) {
      robot.x = 2;
      robot.y = 5;
      robot.touchedFlags = [1, 2];
      robot.nextFlag = 3;
    }

    const resolution = resolveProgrammedTurn(programming, setup, robots)!;
    expect(resolution).toMatchObject({
      phase: 'race-finished',
      winnerUids: [robots[0].uid, robots[1].uid],
      runnersUpUids: [],
      summary: {
        winnerUids: [robots[0].uid, robots[1].uid],
        runnersUpUids: []
      }
    });
    expect(Object.isFrozen(resolution.summary)).toBe(true);
    expect(Object.isFrozen(resolution.summary?.winnerUids)).toBe(true);
    expect(Object.isFrozen(resolution.summary?.standings)).toBe(true);
    expect(resolution.trace).toContainEqual(
      expect.objectContaining({
        kind: 'winner',
        text: `${robots.map(({ name }) => name).join(' and ')} touched the final Flag simultaneously and tied for the win.`
      })
    );
  });

  it('begins and continues power down by clearing damage and every retained lock', () => {
    const announced = raceRobot({
      uid: 'down',
      name: 'Down',
      x: 6,
      y: 10,
      damage: 8,
      lockedRegisters: [
        { register: 2, cardId: 'program-020' },
        { register: 3, cardId: 'program-030' },
        { register: 4, cardId: 'program-040' },
        { register: 5, cardId: 'program-050' }
      ],
      powerDownNextTurn: true
    });
    const [poweredDown] = beginNextTurnPowerDowns([announced]);
    expect(poweredDown).toMatchObject({
      poweredDown: true,
      powerDownNextTurn: false,
      damage: 0,
      lockedRegisters: []
    });

    poweredDown.damage = 6;
    poweredDown.lockedRegisters = [
      { register: 4, cardId: 'program-060' },
      { register: 5, cardId: 'program-070' }
    ];
    poweredDown.powerDownNextTurn = true;
    expect(beginNextTurnPowerDowns([poweredDown])[0]).toMatchObject({
      poweredDown: true,
      damage: 0,
      lockedRegisters: []
    });
  });

  it('skips powered-down Programs and robot fire but keeps factory and damage vulnerability', () => {
    const config = riskyExchangeConfig('POWERED-DOWN-LOCK');
    const setup = deriveRaceSetup(
      [
        { uid: 'down', name: 'Down', robotId: 'axle' },
        { uid: 'active', name: 'Active', robotId: 'bit' }
      ],
      config
    );
    const programming = createProgrammingState(
      setup,
      config,
      {},
      {},
      2,
      new Set(['active'])
    );
    const reservedCard = programming.drawPile[0];
    const down = raceRobot({
      uid: 'down',
      name: 'Down',
      x: 10,
      y: 3,
      facing: 'west',
      poweredDown: true,
      damage: 4
    });
    const active = raceRobot({
      uid: 'active',
      name: 'Active',
      x: 8,
      y: 3,
      facing: 'west'
    });
    const trace: ResolutionTraceEntry[] = [];
    applyProgramCard([down, active], 'down', card('move-3'), 1, trace);
    expect(down).toMatchObject({ x: 10, y: 3 });
    resolveLaserSnapshot(
      [down, active],
      1,
      trace,
      programming,
      [
        {
          x: 10,
          y: 3,
          elements: [{ kind: 'laser', direction: 'east', beamCount: 1 }]
        }
      ]
    );
    expect(down).toMatchObject({
      damage: 5,
      lockedRegisters: [{ register: 5, cardId: reservedCard }]
    });
    expect(programming.drawPile).not.toContain(reservedCard);
    expect(
      trace.some(({ kind, actorUid }) => kind === 'robot-laser' && actorUid === 'down')
    ).toBe(false);

    const conveyorCells: BoardCell[] = [
      {
        x: 10,
        y: 3,
        elements: [{ kind: 'conveyor', direction: 'south', express: false }]
      }
    ];
    resolveBoardElements([down, active], 2, trace, conveyorCells);
    expect(down).toMatchObject({ x: 10, y: 4, poweredDown: true });
  });
});
