import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ALL_BOARD_FACES,
  BOARD_FACES_BY_ID,
  FACTORY_BOARD_FACES,
  boardElementCounts
} from './board-catalog';
import {
  BEGINNER_COURSES,
  EXPERT_COURSES,
  PUBLISHED_COURSES,
  TEAM_COURSES
} from './course-catalog';
import {
  compilePublishedCourse,
  completeRepresentativeRace,
  rotateLocalPoint
} from './course-geometry';
import {
  courseRuleSummary,
  createCourseRuleState,
  evaluateCourseVictory,
  movePublishedFlags,
  publishedCourseRuleProbes,
  resolveCourseRepair,
  transferSuperbot
} from './course-rules';

const EXPECTED_FACE_HASHES: Record<string, string> = {
  island: 'b7430d88be64b66ecadd4dedce9a8082d76358a5889ca58ac71951e9e15b4831',
  'chop-shop': '24765fc7a65e5dcaa19a4766dae30975abda9b5de24a9d41a785114a55e1697f',
  'spin-zone': '7730cecf82498abc80dda8a467d279ceff8d76b2c1446d338d89a52c0eb96116',
  maelstrom: 'ed7409748b98afa4a91421e559f7fa178e3e39f565586be338bd08cedec501b4',
  chess: '8467e5cf7156df49124c3347989024c5779ff517a878eede865bec7d32e9bdab',
  cross: '39cf7d535ca1e9847f02862a8f32d37f69995414f10b7648fa789b143a3150ff',
  vault: '2d5376b40bd35e2f80f1826c18a99c6650b77a9bcb32405d696c04928bbffaf5',
  exchange: 'dab3b5eb216c88413c2e2f95452bb1db0183e0101792d04fbd22b47c9a6d9802',
  'docking-bay-a': 'f4667898f9ff2578175b6a6d0201b1330261b64716405b69ad4cf8f8e303bc92',
  'docking-bay-b': 'e64c91c414edf53825a16582779a98d9b0e1da30e7ce04a1150faa050eacb447'
};

describe('complete Avalon Hill 2005 board catalog', () => {
  it('pins all eight factory faces and both Docking Bay faces by golden geometry hash', () => {
    expect(FACTORY_BOARD_FACES).toHaveLength(8);
    expect(ALL_BOARD_FACES).toHaveLength(10);
    expect(new Set(ALL_BOARD_FACES.map(({ id }) => id))).toHaveLength(10);
    expect(
      Object.fromEntries(
        ALL_BOARD_FACES.map((face) => [
          face.id,
          createHash('sha256')
            .update(JSON.stringify({ cells: face.cells, walls: face.walls }))
            .digest('hex')
        ])
      )
    ).toEqual(EXPECTED_FACE_HASHES);
    expect(
      ALL_BOARD_FACES.every(
        ({ reviewStatus, provenance }) =>
          reviewStatus === 'reviewed-two-pass' && provenance.length >= 2
      )
    ).toBe(true);
  });

  it('keeps every element executable and every wall on its declared face', () => {
    for (const face of ALL_BOARD_FACES) {
      expect(face.cells.every(({ x, y }) => x >= 1 && x <= 12 && y >= 1 && y <= face.height)).toBe(
        true
      );
      expect(face.walls.every(({ x, y }) => x >= 1 && x <= 12 && y >= 1 && y <= face.height)).toBe(
        true
      );
      expect(Object.values(boardElementCounts(face)).every((count) => count > 0)).toBe(true);
      expect(
        face.cells
          .flatMap(({ elements }) => elements)
          .filter((element) => element.kind === 'conveyor')
          .every((element) => element.incomingDirections?.length)
      ).toBe(true);
    }
    expect(boardElementCounts(BOARD_FACES_BY_ID.get('docking-bay-b')!)).toMatchObject({
      dock: 8,
      conveyor: 12
    });
  });

  it('keeps conveyor rotation and rendered merge topology as separate manifest data', () => {
    const island = BOARD_FACES_BY_ID.get('island')!;
    const conveyorAt = (x: number, y: number) =>
      island.cells
        .find((cell) => cell.x === x && cell.y === y)
        ?.elements.find((element) => element.kind === 'conveyor');

    expect(conveyorAt(5, 6)).toMatchObject({
      direction: 'west',
      turn: 'left',
      incomingDirections: ['west']
    });
    expect(conveyorAt(4, 6)).toMatchObject({
      direction: 'south',
      incomingDirections: ['south', 'west']
    });
    expect(conveyorAt(4, 6)?.turn).toBeUndefined();
    expect(conveyorAt(9, 7)).toMatchObject({
      direction: 'north',
      incomingDirections: ['north', 'east']
    });

    expect(
      Object.fromEntries(
        ALL_BOARD_FACES.map((board) => [
          board.id,
          board.cells.flatMap((cell) =>
            cell.elements.some(
              (element) =>
                element.kind === 'conveyor' && (element.incomingDirections?.length ?? 0) > 1
            )
              ? [`${cell.x},${cell.y}`]
              : []
          )
        ]).filter(([, coordinates]) => coordinates.length)
      )
    ).toEqual({
      island: ['4,6', '9,7'],
      'chop-shop': ['3,9'],
      maelstrom: ['6,2', '11,2', '11,6', '2,7', '2,11', '7,11'],
      cross: ['6,2', '7,11'],
      vault: ['9,1']
    });
  });

  it('keeps the Maelstrom pit laser cross and the Cross edge wall exact', () => {
    const maelstrom = BOARD_FACES_BY_ID.get('maelstrom')!;
    const eastboundLasers = maelstrom.cells.flatMap(({ x, y, elements }) =>
      elements
        .filter((element) => element.kind === 'laser' && element.direction === 'east')
        .map(() => `${x},${y}`)
    );
    const pitLaserDirections = maelstrom.cells
      .filter(({ x, y }) => (x === 6 || x === 7) && (y === 6 || y === 7))
      .map(({ x, y, elements }) => ({
        coordinate: `${x},${y}`,
        directions: elements
          .filter((element) => element.kind === 'laser')
          .map(({ direction }) => direction)
          .sort()
      }));

    expect(eastboundLasers).toEqual([
      '5,6',
      '6,6',
      '7,6',
      '8,6',
      '9,6',
      '4,7',
      '5,7',
      '6,7',
      '7,7',
      '8,7'
    ]);
    expect(pitLaserDirections).toEqual([
      { coordinate: '6,6', directions: ['east', 'south'] },
      { coordinate: '7,6', directions: ['east', 'south'] },
      { coordinate: '6,7', directions: ['east', 'south'] },
      { coordinate: '7,7', directions: ['east', 'south'] }
    ]);

    const cross = BOARD_FACES_BY_ID.get('cross')!;
    expect(cross.walls.filter(({ x, y }) => x === 10 && y === 12)).toEqual([
      { x: 10, y: 12, edge: 'south' }
    ]);
  });
});

describe('all 34 published course diagrams', () => {
  it('contains the exact category inventory and only reviewed, resolvable board instances', () => {
    expect(BEGINNER_COURSES).toHaveLength(10);
    expect(EXPERT_COURSES).toHaveLength(19);
    expect(TEAM_COURSES).toHaveLength(5);
    expect(PUBLISHED_COURSES).toHaveLength(34);
    expect(new Set(PUBLISHED_COURSES.map(({ id }) => id))).toHaveLength(34);
    for (const course of PUBLISHED_COURSES) {
      expect(course.reviewStatus).toBe('reviewed-two-pass');
      expect(course.boardPlacements.length).toBeGreaterThan(1);
      expect(new Set(course.boardPlacements.map(({ instanceId }) => instanceId))).toHaveLength(
        course.boardPlacements.length
      );
      expect(
        course.boardPlacements.every(({ boardId }) => BOARD_FACES_BY_ID.has(boardId))
      ).toBe(true);
      expect(course.flags.map(({ number }) => number)).toEqual(
        Array.from({ length: course.flags.length }, (_, index) => index + 1)
      );
    }
  });

  it('pins every printed board transform and flag cell as one reviewed golden fixture', () => {
    const geometry = PUBLISHED_COURSES.map(({ id, boardPlacements, flags }) => ({
      id,
      boardPlacements,
      flags
    }));
    expect(createHash('sha256').update(JSON.stringify(geometry)).digest('hex')).toBe(
      'bc44440b4c68baa13cb4e201c4b250650ffaaa2d2505642237567cf34743c46b'
    );
    expect(PUBLISHED_COURSES.find(({ id }) => id === 'factory-rejects')?.flags).toHaveLength(3);
    expect(PUBLISHED_COURSES.find(({ id }) => id === 'option-world')?.flags).toHaveLength(4);
    expect(PUBLISHED_COURSES.find(({ id }) => id === 'war-zone')?.flags).toHaveLength(0);
  });

  it('pins all ten beginner diagram flags and multi-board transforms', () => {
    expect(
      Object.fromEntries(BEGINNER_COURSES.map(({ id, flags }) => [id, flags]))
    ).toMatchObject({
      'risky-exchange': [
        { number: 1, x: 8, y: 2 },
        { number: 2, x: 10, y: 8 },
        { number: 3, x: 2, y: 5 }
      ],
      'checkmate': [
        { number: 1, x: 8, y: 3 },
        { number: 2, x: 4, y: 9 }
      ],
      'around-the-world': [
        { number: 1, x: 13, y: 3 },
        { number: 2, x: 2, y: 5 },
        { number: 3, x: 23, y: 6 }
      ],
      pilgrimage: [
        { number: 1, x: 9, y: 8 },
        { number: 2, x: 20, y: 3 },
        { number: 3, x: 15, y: 10 }
      ]
    });
    for (const id of ['around-the-world', 'pilgrimage']) {
      const course = BEGINNER_COURSES.find((entry) => entry.id === id)!;
      expect(course.boardPlacements).toHaveLength(3);
      expect(course.boardPlacements.at(-1)).toMatchObject({
        origin: [25, 1],
        rotation: 1
      });
    }
  });

  it('compiles rotations, seams, and one complete multi-board race from manifest geometry', () => {
    expect(rotateLocalPoint(6, 4, 12, 4, 1)).toEqual([1, 6]);
    const around = compilePublishedCourse('around-the-world');
    expect(around.width).toBe(28);
    expect(around.height).toBe(12);
    expect(around.cells.size).toBe(336);

    const rotatedIsland = compilePublishedCourse({
      ...PUBLISHED_COURSES.find(({ id }) => id === 'death-trap')!,
      id: 'rotated-island-probe',
      boardPlacements: [
        {
          instanceId: 'island-rotated',
          boardId: 'island',
          origin: [1, 1],
          rotation: 1
        }
      ]
    });
    expect(
      rotatedIsland.cells
        .get('7,4')
        ?.elements.find((element) => element.kind === 'conveyor')
    ).toMatchObject({
      direction: 'west',
      incomingDirections: ['west', 'north']
    });

    const race = completeRepresentativeRace();
    expect(race.start).toEqual([26, 6]);
    expect(race.touchedFlags).toEqual([1, 2, 3]);
    expect(race.crossedBoardInstances).toEqual([
      'docking-bay-a-1',
      'spin-zone-2',
      'island-1'
    ]);
    expect(race.route.at(-1)).toEqual([23, 6]);
    expect(race.winner).toBe('geometry-auditor');
  });

  it('models every published exception as a typed executable rule', () => {
    const kinds = new Set(
      PUBLISHED_COURSES.flatMap(({ specialRules }) => specialRules.map(({ kind }) => kind))
    );
    expect([...kinds].sort()).toEqual(
      [
        'capture-the-flag',
        'moving-flags',
        'power-down-disabled',
        'programming-limit',
        'repair-sites-draw-options',
        'robot-laser-multiplier',
        'rotate-board-on-flag',
        'starting-damage',
        'starting-option-draft',
        'starting-options',
        'superbot',
        'team-elimination',
        'team-individual-racer',
        'team-shared-flag-progress',
        'toggle-flag-control',
        'two-controlled-robots'
      ].sort()
    );
    expect(courseRuleSummary('vault-assault')).toEqual(['Standard 2005 race rules']);
    expect(courseRuleSummary('factory-rejects')).toEqual([
      'all robots start with 2 damage',
      'power down disabled'
    ]);
    expect(courseRuleSummary('option-world')).toEqual([
      'repair sites draw 1/2 Options; flags draw 1'
    ]);
  });
});

describe('course-specific reducer probes', () => {
  const players = [
    { uid: 'ada', teamId: 'amber' },
    { uid: 'grace', teamId: 'cobalt' }
  ];

  it('applies setup, repair, moving-flag, timer, and laser exceptions', () => {
    const rejects = createCourseRuleState('factory-rejects', players);
    expect(rejects.robots.map(({ damage }) => damage)).toEqual([2, 2]);
    expect(rejects.powerDownAllowed).toBe(false);

    const options = createCourseRuleState('option-world', players);
    expect(resolveCourseRepair(options, 'ada', 'crossed').robots[0].options).toBe(2);
    expect(createCourseRuleState('ball-lightning', players).programmingSeconds).toBe(30);
    expect(createCourseRuleState('tight-collar', players).programmingSeconds).toBe(60);
    expect(createCourseRuleState('set-to-kill', players).robotLaserMultiplier).toBe(2);

    const moving = createCourseRuleState('moving-targets', players);
    expect(
      movePublishedFlags(moving, [{ number: 1, x: 4, y: 4 }], () => ({
        x: 5,
        y: 4,
        inPit: true
      }))
    ).toEqual([{ number: 1, x: 4, y: 4, inPit: false }]);
  });

  it('transfers SuperBot and evaluates ordinary and alternative victory conditions', () => {
    const superbot = createCourseRuleState('day-of-the-superbot', players);
    superbot.robots[0].flagProgress = 2;
    expect(evaluateCourseVictory(superbot, { kind: 'flags', uid: 'ada', flagCount: 2 })).toBe(
      'ada'
    );
    const transferred = transferSuperbot(superbot, 'ada', 'grace');
    expect(transferred.robots.map(({ isSuperbot }) => isSuperbot)).toEqual([false, true]);

    const capture = createCourseRuleState('capture-the-flag', players);
    expect(
      evaluateCourseVictory(capture, {
        kind: 'capture',
        uid: 'ada',
        teamId: 'amber',
        enemyFlagOnHomeBoard: true
      })
    ).toBe('amber');

    const toggle = createCourseRuleState('toggle-boggle', players);
    expect(
      evaluateCourseVictory(toggle, {
        kind: 'control',
        teamId: 'amber',
        controlledFlags: 3,
        flagCount: 3
      })
    ).toBe('amber');

    const war = createCourseRuleState('war-zone', players);
    expect(
      evaluateCourseVictory(war, { kind: 'elimination', teamId: 'amber', opposingLives: 0 })
    ).toBe('amber');
  });

  it('executes every exceptional published rule as a named passing probe', () => {
    const probes = publishedCourseRuleProbes();
    expect(probes).toHaveLength(14);
    expect(new Set(probes.map(({ id }) => id)).size).toBe(14);
    expect(probes.filter(({ passed }) => !passed)).toEqual([]);
    expect(probes.every(({ evidence }) => evidence.length >= 20)).toBe(true);
  });
});
