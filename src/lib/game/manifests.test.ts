import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DOCKING_BAY_A,
  EXCHANGE_BOARD,
  RISKY_EXCHANGE
} from './course-manifest';
import { PROGRAM_CARDS, PROGRAM_MANIFEST } from './program-manifest';
import {
  createPrng,
  deriveRaceSetup,
  factoryRejectsConfig,
  riskyExchangeConfig,
  seedToUint32
} from './setup';

describe('reviewed 2005 manifests', () => {
  it('contains every unique Program priority and the exact action inventory', () => {
    expect(PROGRAM_MANIFEST.reviewStatus).toBe('reviewed-two-pass');
    expect(PROGRAM_CARDS).toHaveLength(84);
    expect(new Set(PROGRAM_CARDS.map(({ id }) => id))).toHaveLength(84);
    expect(PROGRAM_CARDS.map(({ priority }) => priority).sort((left, right) => left - right)).toEqual(
      Array.from({ length: 84 }, (_, index) => (index + 1) * 10)
    );
    expect(
      Object.fromEntries(
        [...new Set(PROGRAM_CARDS.map(({ action }) => action))].map((action) => [
          action,
          PROGRAM_CARDS.filter((card) => card.action === action).length
        ])
      )
    ).toEqual({
      'u-turn': 6,
      'rotate-right': 18,
      'rotate-left': 18,
      'back-up': 6,
      'move-1': 18,
      'move-2': 12,
      'move-3': 6
    });
  });

  it('pins the reviewed Exchange, Docking Bay, and Risky Exchange coordinates', () => {
    expect(EXCHANGE_BOARD.reviewStatus).toBe('reviewed-two-pass');
    expect(DOCKING_BAY_A.reviewStatus).toBe('reviewed-two-pass');
    expect(RISKY_EXCHANGE.reviewStatus).toBe('reviewed-two-pass');
    expect(RISKY_EXCHANGE.boardPlacements).toEqual([
      { instanceId: 'exchange-1', boardId: 'exchange', origin: [1, 1], rotation: 0 },
      { instanceId: 'docking-bay-1', boardId: 'docking-bay-a', origin: [1, 13], rotation: 0 }
    ]);
    expect(RISKY_EXCHANGE.flags).toEqual([
      { number: 1, x: 8, y: 2 },
      { number: 2, x: 10, y: 8 },
      { number: 3, x: 2, y: 5 }
    ]);
    expect(
      EXCHANGE_BOARD.cells.flatMap(({ elements }) => elements).reduce<Record<string, number>>(
        (counts, element) => {
          counts[element.kind] = (counts[element.kind] ?? 0) + 1;
          return counts;
        },
        {}
      )
    ).toEqual({
      repair: 3,
      conveyor: 68,
      pit: 2,
      gear: 5,
      laser: 3
    });
    expect(EXCHANGE_BOARD.walls).toHaveLength(27);
    expect(DOCKING_BAY_A.walls).toHaveLength(15);
    expect(
      createHash('sha256')
        .update(JSON.stringify({ cells: EXCHANGE_BOARD.cells, walls: EXCHANGE_BOARD.walls }))
        .digest('hex')
    ).toBe('ab8ccb3c3dc53cf1e76616a9fa3de3c3291ff57eb6f19aac063ab7b6a7954a31');
    expect(
      DOCKING_BAY_A.cells
        .flatMap((entry) =>
          entry.elements
            .filter((element) => element.kind === 'dock')
            .map((element) => ({ dock: element.number, x: entry.x, y: entry.y + 12 }))
        )
        .sort((left, right) => left.dock - right.dock)
    ).toEqual([
      { dock: 1, x: 6, y: 15 },
      { dock: 2, x: 7, y: 15 },
      { dock: 3, x: 4, y: 15 },
      { dock: 4, x: 9, y: 15 },
      { dock: 5, x: 2, y: 14 },
      { dock: 6, x: 11, y: 14 },
      { dock: 7, x: 1, y: 13 },
      { dock: 8, x: 12, y: 13 }
    ]);
  });
});

describe('versioned deterministic setup', () => {
  const players = [
    { uid: 'host', name: 'Ada', robotId: 'axle' },
    { uid: 'guest', name: 'Grace', robotId: 'bit' }
  ];

  it('has stable PRNG golden vectors', () => {
    const random = createPrng('RISKY-6');
    expect(seedToUint32('RISKY-6')).toBe(2863186414);
    expect([random(), random(), random()]).toEqual([
      0.8759505832567811,
      0.12063263938762248,
      0.8955754237249494
    ]);
  });

  it('uses the seeded first player, clockwise Dock order, archives, Lives, and facing', () => {
    expect(deriveRaceSetup(players, riskyExchangeConfig('RISKY-6'))).toEqual({
      courseId: 'risky-exchange',
      startingDamage: 0,
      powerDownAllowed: true,
      firstPlayerUid: 'guest',
      players: [
        {
          uid: 'guest',
          name: 'Grace',
          robotId: 'bit',
          dock: 1,
          originalDockOrder: 1,
          lives: 3,
          position: { x: 6, y: 15 },
          archive: { x: 6, y: 15 },
          facing: 'north'
        },
        {
          uid: 'host',
          name: 'Ada',
          robotId: 'axle',
          dock: 2,
          originalDockOrder: 2,
          lives: 3,
          position: { x: 7, y: 15 },
          archive: { x: 7, y: 15 },
          facing: 'north'
        }
      ]
    });
  });

  it('derives Factory Rejects from Docking Bay B with its printed setup rules', () => {
    const rejectsPlayers = Array.from({ length: 5 }, (_, index) => ({
      uid: `player-${index}`,
      name: `Player ${index + 1}`,
      robotId: `robot-${index}`
    }));
    const setup = deriveRaceSetup(rejectsPlayers, factoryRejectsConfig('REJECTS-2005'));

    expect(setup).toMatchObject({
      courseId: 'factory-rejects',
      startingDamage: 2,
      powerDownAllowed: false
    });
    expect(setup.players.map(({ dock, position }) => ({ dock, position }))).toEqual([
      { dock: 1, position: { x: 6, y: 16 } },
      { dock: 2, position: { x: 7, y: 16 } },
      { dock: 3, position: { x: 4, y: 15 } },
      { dock: 4, position: { x: 9, y: 15 } },
      { dock: 5, position: { x: 2, y: 14 } }
    ]);
    expect(() =>
      deriveRaceSetup(rejectsPlayers.slice(0, 4), factoryRejectsConfig('TOO-FEW'))
    ).toThrow('does not support 4 players');
  });

  it('permits the published four-Life option only with at least five players', () => {
    expect(() => deriveRaceSetup(players, riskyExchangeConfig('seed', 4))).toThrow(
      'requires five or more'
    );
    expect(
      deriveRaceSetup(
        Array.from({ length: 5 }, (_, index) => ({
          uid: `p${index}`,
          name: `P${index}`,
          robotId: `r${index}`
        })),
        riskyExchangeConfig('seed', 4)
      ).players.every(({ lives }) => lives === 4)
    ).toBe(true);
  });
});
