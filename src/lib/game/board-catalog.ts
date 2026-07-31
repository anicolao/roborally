import {
  DOCKING_BAY_A,
  EXCHANGE_BOARD,
  type BoardCell,
  type BoardElement,
  type BoardFaceManifest,
  type Direction,
  type Wall
} from './course-manifest';

export const COMPLETE_BOARD_MANIFEST_VERSION = 'boards-avalon-hill-2005-complete-v1';

type DirectionCode =
  | 'u'
  | 'r'
  | 'd'
  | 'l'
  | 'up'
  | 'right'
  | 'down'
  | 'left';

const directionByCode: Record<DirectionCode, Direction> = {
  u: 'north',
  up: 'north',
  r: 'east',
  right: 'east',
  d: 'south',
  down: 'south',
  l: 'west',
  left: 'west'
};

const opposite: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east'
};

const stepByDirection: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0]
};

function conveyorTurn(
  from: Direction,
  to: Direction | undefined
): 'left' | 'right' | undefined {
  if (!to || from === to) return undefined;
  const order: Direction[] = ['north', 'east', 'south', 'west'];
  const difference = (order.indexOf(to) - order.indexOf(from) + 4) % 4;
  return difference === 1 ? 'right' : difference === 3 ? 'left' : undefined;
}

class BoardBuilder {
  private readonly elements = new Map<string, BoardElement[]>();
  private readonly wallList: Wall[] = [];

  private key(x: number, y: number) {
    return `${x + 1},${y + 1}`;
  }

  private direction(code: DirectionCode) {
    return directionByCode[code];
  }

  private add(x: number, y: number, element: BoardElement) {
    const key = this.key(x, y);
    this.elements.set(key, [...(this.elements.get(key) ?? []), element]);
  }

  private set(x: number, y: number, element: BoardElement) {
    const key = this.key(x, y);
    this.elements.set(key, [
      ...(this.elements.get(key) ?? []).filter((entry) => entry.kind !== element.kind),
      element
    ]);
  }

  pit(x: number, y: number) {
    this.set(x, y, { kind: 'pit' });
  }

  repair(x: number, y: number, option = false) {
    this.set(x, y, { kind: 'repair', option });
  }

  gear(x: number, y: number, rotation: 'cw' | 'ccw') {
    this.set(x, y, {
      kind: 'gear',
      rotation: rotation === 'cw' ? 'clockwise' : 'counterclockwise'
    });
  }

  conveyor(x: number, y: number, route: string, express = false) {
    const directions = [...route].map((code) => this.direction(code as DirectionCode));
    directions.forEach((direction, index) => {
      this.set(x, y, {
        kind: 'conveyor',
        direction,
        express,
        turn: conveyorTurn(direction, directions[index + 1])
      });
      if (index === directions.length - 1) return;
      const [dx, dy] = stepByDirection[direction];
      x += dx;
      y += dy;
    });
  }

  pusher(x: number, y: number, direction: DirectionCode, active: 'odd' | 'even') {
    const absolute = this.direction(direction);
    this.set(x, y, {
      kind: 'pusher',
      direction: absolute,
      activeRegisters: active === 'odd' ? [1, 3, 5] : [2, 4]
    });
    this.wall(x, y, opposite[absolute]);
  }

  laser(
    x: number,
    y: number,
    direction: DirectionCode,
    length: number,
    beamCount: 1 | 2 | 3 = 1
  ) {
    const absolute = this.direction(direction);
    for (let index = 0; index < length; index += 1) {
      this.add(x, y, { kind: 'laser', direction: absolute, beamCount });
      if (index === 0) this.wall(x, y, opposite[absolute]);
      if (index === length - 1) this.wall(x, y, absolute);
      const [dx, dy] = stepByDirection[absolute];
      x += dx;
      y += dy;
    }
  }

  dock(x: number, y: number, number: number) {
    this.set(x, y, { kind: 'dock', number });
  }

  wall(x: number, y: number, ...edges: (Direction | DirectionCode)[]) {
    for (const edge of edges) {
      const absolute =
        edge === 'north' || edge === 'east' || edge === 'south' || edge === 'west'
          ? edge
          : this.direction(edge);
      const wall = { x: x + 1, y: y + 1, edge: absolute };
      if (
        !this.wallList.some(
          (entry) => entry.x === wall.x && entry.y === wall.y && entry.edge === wall.edge
        )
      ) {
        this.wallList.push(wall);
      }
    }
  }

  compoundWall(x: number, y: number, edges: string) {
    this.wall(x, y, ...(edges.split('-') as DirectionCode[]));
  }

  boundaryWalls() {
    [
      [2, 0, 'u'],
      [4, 0, 'u'],
      [7, 0, 'u'],
      [9, 0, 'u'],
      [2, 11, 'd'],
      [4, 11, 'd'],
      [7, 11, 'd'],
      [9, 11, 'd'],
      [0, 2, 'l'],
      [0, 4, 'l'],
      [0, 7, 'l'],
      [0, 9, 'l'],
      [11, 2, 'r'],
      [11, 4, 'r'],
      [11, 7, 'r'],
      [11, 9, 'r']
    ].forEach(([x, y, edge]) => this.wall(x as number, y as number, edge as DirectionCode));
  }

  finish(): { cells: BoardCell[]; walls: Wall[] } {
    return {
      cells: [...this.elements.entries()]
        .map(([coordinate, elements]) => {
          const [x, y] = coordinate.split(',').map(Number);
          return { x, y, elements };
        })
        .sort((left, right) => left.y - right.y || left.x - right.x),
      walls: [...this.wallList].sort(
        (left, right) =>
          left.y - right.y || left.x - right.x || left.edge.localeCompare(right.edge)
      )
    };
  }
}

function board(
  id: string,
  build: (builder: BoardBuilder) => void,
  ...provenance: string[]
): BoardFaceManifest {
  const builder = new BoardBuilder();
  build(builder);
  const geometry = builder.finish();
  return Object.freeze({
    id,
    width: 12,
    height: 12,
    sourceEdition: 'avalon-hill-2005',
    manifestVersion: COMPLETE_BOARD_MANIFEST_VERSION,
    reviewStatus: 'reviewed-two-pass',
    provenance: [
      'Robo Rally 2005 physical factory face and Course Manual diagrams',
      'Independent coordinate comparison with marcelpanse/roborally both/area.js.coffee',
      ...provenance
    ],
    ...geometry
  });
}

export const CROSS_BOARD = board('cross', (b) => {
  [
    [9, 2],
    [1, 4],
    [2, 4],
    [5, 4],
    [4, 5],
    [5, 5],
    [6, 5],
    [5, 6],
    [9, 8],
    [2, 10],
    [0, 11]
  ].forEach(([x, y]) => b.pit(x, y));
  [
    [1, 0, 'drrrrddldldllll'],
    [5, 0, 'dd'],
    [11, 1, 'luu'],
    [11, 5, 'lllluluuuuu'],
    [0, 6, 'rrrrdrddddd'],
    [0, 10, 'rdd'],
    [10, 11, 'ulllluuuurrrrrr'],
    [6, 11, 'uu']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  b.repair(11, 0);
  b.repair(0, 9);
  b.repair(2, 3, true);
  b.repair(9, 7, true);
  [
    [1, 3, 'right-down'],
    [3, 3, 'right'],
    [7, 3, 'left-down'],
    [9, 4, 'down'],
    [0, 7, 'down'],
    [7, 7, 'left-up'],
    [10, 7, 'up'],
    [4, 8, 'up'],
    [2, 9, 'right'],
    [9, 11, 'right'],
    [7, 11, 'right']
  ].forEach(([x, y, edges]) => b.compoundWall(x as number, y as number, edges as string));
  b.laser(4, 0, 'd', 3);
  b.laser(2, 8, 'r', 2);
  b.laser(7, 8, 'r', 2);
  b.laser(8, 1, 'd', 3, 2);
  b.boundaryWalls();
});

export const VAULT_BOARD = board('vault', (b) => {
  [
    [2, 3],
    [9, 3],
    [2, 8],
    [9, 8]
  ].forEach(([x, y]) => b.pit(x, y));
  [
    [1, 0, 'dll'],
    [3, 0, 'u'],
    [9, 0, 'ldlllll'],
    [8, 0, 'd'],
    [0, 6, 'rddddrrrrdd'],
    [8, 10, 'rrrr']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  b.conveyor(10, 1, 'ddrr', true);
  b.conveyor(10, 6, 'rr', true);
  b.repair(0, 11);
  b.repair(11, 0);
  [
    [5, 5],
    [5, 6],
    [6, 5],
    [6, 6]
  ].forEach(([x, y]) => b.repair(x, y, true));
  b.gear(3, 1, 'cw');
  b.gear(10, 0, 'cw');
  b.pusher(5, 2, 'up', 'odd');
  b.pusher(10, 5, 'down', 'even');
  b.pusher(2, 6, 'left', 'odd');
  b.pusher(9, 6, 'right', 'odd');
  b.pusher(5, 9, 'down', 'even');
  b.pusher(6, 9, 'down', 'odd');
  [
    [6, 2, 'down'],
    [11, 2, 'right'],
    [4, 4, 'left'],
    [7, 4, 'right'],
    [2, 5, 'right'],
    [9, 5, 'left'],
    [3, 7, 'left'],
    [7, 7, 'right']
  ].forEach(([x, y, edges]) => b.compoundWall(x as number, y as number, edges as string));
  b.laser(4, 0, 'd', 4);
  b.laser(7, 0, 'd', 4);
  b.laser(0, 2, 'r', 4);
  b.laser(4, 8, 'd', 4);
  b.laser(7, 8, 'd', 4);
  b.boundaryWalls();
});

export const MAELSTROM_BOARD = board('maelstrom', (b) => {
  [
    [5, 5],
    [6, 5],
    [5, 6],
    [6, 6]
  ].forEach(([x, y]) => b.pit(x, y));
  [
    [1, 0, 'drrrrrrrrrddddddddlllllllluuuuuurrrrrrddddlllluur'],
    [5, 0, 'dr'],
    [6, 0, 'u'],
    [11, 1, 'ld'],
    [11, 5, 'ld'],
    [0, 5, 'l']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  [
    [10, 11, 'ullllllllluuuuuuuurrrrrrrrddddddlllllluuuurrrrddl'],
    [6, 11, 'ul'],
    [0, 10, 'ru'],
    [0, 6, 'ru']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string, true));
  [
    [4, 0, 'down', 'odd'],
    [7, 0, 'down', 'odd'],
    [4, 11, 'up', 'odd'],
    [7, 11, 'up', 'odd'],
    [11, 4, 'left', 'odd'],
    [11, 7, 'left', 'odd'],
    [0, 4, 'right', 'odd'],
    [0, 7, 'right', 'odd'],
    [2, 0, 'down', 'even'],
    [9, 0, 'down', 'even'],
    [2, 11, 'up', 'even'],
    [9, 11, 'up', 'even'],
    [11, 2, 'left', 'even'],
    [11, 9, 'left', 'even'],
    [0, 2, 'right', 'even'],
    [0, 9, 'right', 'even']
  ].forEach(([x, y, direction, active]) =>
    b.pusher(
      x as number,
      y as number,
      direction as DirectionCode,
      active as 'odd' | 'even'
    )
  );
  b.repair(0, 0);
  b.repair(11, 11);
  b.repair(11, 3, true);
  b.repair(0, 8, true);
  b.laser(5, 3, 'd', 5);
  b.laser(6, 4, 'd', 5);
  b.laser(4, 5, 'r', 5);
  b.laser(3, 4, 'r', 5);
});

export const CHESS_BOARD = board('chess', (b) => {
  [
    [3, 3],
    [6, 4],
    [8, 6],
    [5, 7]
  ].forEach(([x, y]) => b.pit(x, y));
  b.conveyor(2, 1, 'rrrrrrrrdddddddddllllllllluuuuuuuuurr', true);
  [
    [2, 2, 'r'],
    [2, 4, 'r'],
    [2, 6, 'r'],
    [2, 8, 'r'],
    [4, 2, 'r'],
    [4, 4, 'r'],
    [4, 6, 'r'],
    [4, 8, 'r'],
    [3, 5, 'r'],
    [3, 7, 'r'],
    [3, 9, 'r'],
    [5, 3, 'r'],
    [5, 9, 'r'],
    [7, 3, 'l'],
    [7, 5, 'l'],
    [7, 7, 'l'],
    [7, 9, 'l'],
    [9, 3, 'l'],
    [9, 5, 'l'],
    [9, 7, 'l'],
    [9, 9, 'l'],
    [8, 2, 'l'],
    [8, 4, 'l'],
    [8, 8, 'l'],
    [6, 2, 'l'],
    [6, 8, 'l']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  b.repair(5, 5, true);
  b.repair(6, 6, true);
  b.repair(11, 0);
  b.repair(0, 11);
  [
    [3, 1, 'd'],
    [5, 1, 'd'],
    [6, 1, 'd'],
    [8, 1, 'd'],
    [3, 10, 'u'],
    [5, 10, 'u'],
    [6, 10, 'u'],
    [8, 10, 'u'],
    [1, 3, 'r'],
    [1, 5, 'r'],
    [1, 6, 'r'],
    [1, 8, 'r'],
    [10, 3, 'l'],
    [10, 5, 'l'],
    [10, 6, 'l'],
    [10, 8, 'l']
  ].forEach(([x, y, edge]) =>
    b.wall(x as number, y as number, edge as DirectionCode)
  );
  b.boundaryWalls();
});

export const SPIN_ZONE_BOARD = board('spin-zone', (b) => {
  [
    [2, 2],
    [3, 3],
    [2, 8],
    [3, 9],
    [8, 2],
    [9, 3],
    [8, 8],
    [9, 9]
  ].forEach(([x, y]) => b.gear(x, y, 'cw'));
  [
    [5, 2],
    [6, 4],
    [4, 5],
    [9, 5],
    [2, 6],
    [7, 6],
    [5, 7],
    [6, 9]
  ].forEach(([x, y]) => b.gear(x, y, 'ccw'));
  b.repair(2, 3);
  b.repair(9, 8);
  b.repair(8, 3, true);
  b.repair(3, 8, true);
  [
    [2, 1],
    [8, 1],
    [2, 7],
    [8, 7]
  ].forEach(([x, y]) => b.conveyor(x, y, 'rrdddllluuurr', true));
  b.laser(3, 3, 'd', 4);
  b.laser(5, 3, 'r', 2);
  b.laser(8, 5, 'd', 4);
  b.laser(5, 8, 'r', 2);
  b.boundaryWalls();
});

export const ISLAND_BOARD = board('island', (b) => {
  b.gear(2, 9, 'cw');
  b.gear(9, 9, 'cw');
  [
    [3, 3],
    [3, 8],
    [8, 3],
    [8, 8]
  ].forEach(([x, y]) => b.gear(x, y, 'ccw'));
  b.repair(0, 11);
  b.repair(11, 2);
  b.repair(5, 6, true);
  [
    [3, 2, 'rrrrrrr'],
    [9, 3, 'dddddd'],
    [8, 9, 'llllll'],
    [2, 8, 'uuuuuuu'],
    [7, 3, 'llll'],
    [4, 8, 'rrrr'],
    [3, 4, 'dddd'],
    [5, 5, 'lld'],
    [8, 7, 'uuuu'],
    [6, 6, 'rru']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  [
    [1, 1],
    [2, 1],
    [1, 2],
    [9, 1],
    [10, 1],
    [10, 2],
    [1, 9],
    [1, 10],
    [2, 10],
    [10, 9],
    [10, 10],
    [9, 10],
    [6, 4],
    [7, 4],
    [7, 5],
    [4, 6],
    [4, 7],
    [5, 7]
  ].forEach(([x, y]) => b.pit(x, y));
  b.boundaryWalls();
});

export const CHOP_SHOP_BOARD = board('chop-shop', (b) => {
  [
    [5, 3],
    [8, 7],
    [5, 9]
  ].forEach(([x, y]) => b.gear(x, y, 'cw'));
  [
    [8, 3],
    [4, 5],
    [8, 6],
    [6, 9]
  ].forEach(([x, y]) => b.gear(x, y, 'ccw'));
  b.repair(0, 11);
  b.repair(11, 0);
  b.repair(4, 2, true);
  b.repair(5, 6, true);
  b.repair(9, 9, true);
  [
    [3, 2],
    [9, 2],
    [6, 4],
    [9, 6],
    [1, 10]
  ].forEach(([x, y]) => b.pit(x, y));
  [
    [1, 0, 'ddrr'],
    [5, 0, 'ddd'],
    [8, 0, 'ddd'],
    [0, 3, 'rrr'],
    [9, 3, 'rrr'],
    [5, 4, 'drrr'],
    [3, 5, 'llll'],
    [4, 6, 'u'],
    [11, 8, 'lll'],
    [5, 10, 'dd'],
    [6, 11, 'urrrr'],
    [11, 10, 'r']
  ].forEach(([x, y, route]) => b.conveyor(x as number, y as number, route as string));
  b.conveyor(7, 8, 'llllllll', true);
  b.conveyor(0, 6, 'rrddl', true);
  b.laser(4, 3, 'r', 3);
  b.laser(10, 2, 'd', 3);
  b.laser(1, 6, 'd', 3);
  b.laser(2, 9, 'r', 6);
  b.laser(8, 5, 'd', 4, 2);
  b.laser(10, 10, 'd', 1, 3);
  b.wall(6, 1, 'r');
  b.wall(5, 5, 'd');
  b.compoundWall(3, 6, 'right-down');
  b.boundaryWalls();
});

function dockingBayB(): BoardFaceManifest {
  const builder = new BoardBuilder();
  builder.conveyor(0, 2, 'rrdrrr');
  builder.conveyor(11, 2, 'lldlll');
  [
    [2, 0, 'up'],
    [4, 0, 'up'],
    [7, 0, 'up'],
    [9, 0, 'up'],
    [4, 0, 'left'],
    [7, 0, 'right'],
    [1, 1, 'left'],
    [2, 1, 'left'],
    [10, 1, 'left'],
    [11, 1, 'left'],
    [8, 2, 'left'],
    [6, 2, 'left'],
    [6, 3, 'left']
  ].forEach(([x, y, edge]) =>
    builder.wall(x as number, y as number, edge as DirectionCode)
  );
  [
    [5, 3],
    [6, 3],
    [3, 2],
    [8, 2],
    [1, 1],
    [10, 1],
    [0, 0],
    [11, 0]
  ].forEach(([x, y], index) => builder.dock(x, y, index + 1));
  const geometry = builder.finish();
  return Object.freeze({
    id: 'docking-bay-b',
    width: 12,
    height: 4,
    sourceEdition: 'avalon-hill-2005',
    manifestVersion: COMPLETE_BOARD_MANIFEST_VERSION,
    reviewStatus: 'reviewed-two-pass',
    provenance: [
      'Robo Rally 2005 Course Manual beginner diagrams with the conveyor Docking Bay face',
      'Independent coordinate comparison with marcelpanse/roborally Area.start.roller'
    ],
    ...geometry
  });
}

export const DOCKING_BAY_B = dockingBayB();

export const FACTORY_BOARD_FACES = Object.freeze([
  ISLAND_BOARD,
  CHOP_SHOP_BOARD,
  SPIN_ZONE_BOARD,
  MAELSTROM_BOARD,
  CHESS_BOARD,
  CROSS_BOARD,
  VAULT_BOARD,
  EXCHANGE_BOARD
]);

export const ALL_BOARD_FACES = Object.freeze([
  ...FACTORY_BOARD_FACES,
  DOCKING_BAY_A,
  DOCKING_BAY_B
]);

export const BOARD_FACES_BY_ID = new Map(ALL_BOARD_FACES.map((face) => [face.id, face]));

export function boardElementCounts(face: BoardFaceManifest): Record<string, number> {
  return face.cells
    .flatMap(({ elements }) => elements)
    .reduce<Record<string, number>>((counts, element) => {
      counts[element.kind] = (counts[element.kind] ?? 0) + 1;
      return counts;
    }, {});
}
