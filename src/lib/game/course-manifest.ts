export const BOARD_MANIFEST_VERSION = 'boards-avalon-hill-2005-exchange-v1';
export const COURSE_MANIFEST_VERSION = 'courses-avalon-hill-2005-risky-exchange-v1';

export type Direction = 'north' | 'east' | 'south' | 'west';
export type BoardElement =
  | { kind: 'pit' }
  | { kind: 'repair'; option: boolean }
  | { kind: 'gear'; rotation: 'clockwise' | 'counterclockwise' }
  | { kind: 'conveyor'; direction: Direction; express: boolean; turn?: 'left' | 'right' }
  | { kind: 'pusher'; direction: Direction; activeRegisters: readonly number[] }
  | { kind: 'laser'; direction: Direction; beamCount: 1 | 2 | 3 }
  | { kind: 'dock'; number: number };

export interface BoardCell {
  x: number;
  y: number;
  elements: readonly BoardElement[];
}

export interface Wall {
  x: number;
  y: number;
  edge: Direction;
}

export interface BoardFaceManifest {
  id: string;
  width: 12;
  height: number;
  sourceEdition: 'avalon-hill-2005';
  manifestVersion: string;
  reviewStatus: 'reviewed-two-pass';
  provenance: readonly string[];
  cells: readonly BoardCell[];
  walls: readonly Wall[];
}

const cell = (x: number, y: number, ...elements: BoardElement[]): BoardCell => ({
  x,
  y,
  elements
});

const directionForCode: Record<string, Direction> = {
  u: 'north',
  r: 'east',
  d: 'south',
  l: 'west'
};

const stepForCode: Record<string, readonly [number, number]> = {
  u: [0, -1],
  r: [1, 0],
  d: [0, 1],
  l: [-1, 0]
};

function turnForCodes(from: string, to: string | undefined): 'left' | 'right' | undefined {
  if (!to) return undefined;
  const order = ['u', 'r', 'd', 'l'];
  const difference = (order.indexOf(to) - order.indexOf(from) + 4) % 4;
  if (difference === 1) return 'right';
  if (difference === 3) return 'left';
  return undefined;
}

function buildExchangeCells(): BoardCell[] {
  const elements = new Map<string, BoardElement[]>();
  const add = (x: number, y: number, element: BoardElement) => {
    const key = `${x + 1},${y + 1}`;
    elements.set(key, [...(elements.get(key) ?? []), element]);
  };
  const route = (x: number, y: number, directions: string, express = false) => {
    [...directions].forEach((direction, index) => {
      add(x, y, {
        kind: 'conveyor',
        direction: directionForCode[direction],
        express,
        turn: turnForCodes(direction, directions[index + 1])
      });
      if (index < directions.length - 1) {
        const [dx, dy] = stepForCode[direction];
        x += dx;
        y += dy;
      }
    });
  };

  add(10, 1, { kind: 'gear', rotation: 'clockwise' });
  add(10, 10, { kind: 'gear', rotation: 'clockwise' });
  add(3, 3, { kind: 'gear', rotation: 'counterclockwise' });
  add(3, 8, { kind: 'gear', rotation: 'counterclockwise' });
  add(8, 8, { kind: 'gear', rotation: 'counterclockwise' });
  add(0, 0, { kind: 'repair', option: false });
  add(11, 11, { kind: 'repair', option: false });
  add(7, 7, { kind: 'repair', option: true });

  route(0, 1, 'l');
  route(0, 3, 'rrr');
  route(4, 5, 'lllll');
  route(11, 5, 'lllll');
  route(1, 6, 'rrrr');
  route(2, 8, 'lll');
  route(3, 2, 'uuu');
  route(3, 11, 'uuu');
  route(5, 0, 'ddddd');
  route(6, 4, 'uuuuu');
  route(6, 10, 'uuuu');
  route(8, 0, 'dddd');
  route(8, 9, 'ddd');
  route(10, 0, 'u');
  route(11, 1, 'l');
  route(11, 8, 'lll');
  route(11, 10, 'r');
  route(10, 11, 'u');
  route(5, 7, 'ddddd', true);
  route(7, 6, 'rrrrr', true);
  route(9, 3, 'rrr', true);

  add(2, 1, { kind: 'pit' });
  add(0, 10, { kind: 'pit' });
  for (let x = 9; x <= 11; x += 1) {
    add(x, 2, { kind: 'laser', direction: 'east', beamCount: 1 });
  }

  return [...elements.entries()]
    .map(([coordinate, cellElements]) => {
      const [x, y] = coordinate.split(',').map(Number);
      return cell(x, y, ...cellElements);
    })
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

/**
 * Semantic transcription of the Exchange face. Empty floor cells are implicit.
 * The coordinate origin is the upper-left printed cell and coordinates are
 * one-based in the review listing.
 */
export const EXCHANGE_BOARD: BoardFaceManifest = Object.freeze({
  id: 'exchange',
  width: 12,
  height: 12,
  sourceEdition: 'avalon-hill-2005',
  manifestVersion: BOARD_MANIFEST_VERSION,
  reviewStatus: 'reviewed-two-pass',
  provenance: [
    'Robo Rally 2005 Course Manual, Risky Exchange diagram and Exchange face',
    'Independent coordinate comparison with marcelpanse/roborally both/area.js.coffee'
  ],
  cells: buildExchangeCells(),
  walls: [
    { x: 3, y: 1, edge: 'north' },
    { x: 5, y: 1, edge: 'north' },
    { x: 8, y: 1, edge: 'north' },
    { x: 10, y: 1, edge: 'north' },
    { x: 3, y: 12, edge: 'south' },
    { x: 5, y: 12, edge: 'south' },
    { x: 8, y: 12, edge: 'south' },
    { x: 10, y: 12, edge: 'south' },
    { x: 1, y: 3, edge: 'west' },
    { x: 1, y: 5, edge: 'west' },
    { x: 1, y: 8, edge: 'west' },
    { x: 1, y: 10, edge: 'west' },
    { x: 12, y: 3, edge: 'east' },
    { x: 12, y: 5, edge: 'east' },
    { x: 12, y: 8, edge: 'east' },
    { x: 12, y: 10, edge: 'east' },
    { x: 5, y: 5, edge: 'east' },
    { x: 5, y: 5, edge: 'south' },
    { x: 5, y: 8, edge: 'north' },
    { x: 5, y: 8, edge: 'east' },
    { x: 8, y: 8, edge: 'west' },
    { x: 8, y: 8, edge: 'north' },
    { x: 8, y: 5, edge: 'west' },
    { x: 8, y: 5, edge: 'south' },
    { x: 2, y: 11, edge: 'south' },
    { x: 11, y: 10, edge: 'north' },
    { x: 10, y: 3, edge: 'west' }
  ] as Wall[]
});

export const DOCKING_BAY_A: BoardFaceManifest = Object.freeze({
  id: 'docking-bay-a',
  width: 12,
  height: 4,
  sourceEdition: 'avalon-hill-2005',
  manifestVersion: BOARD_MANIFEST_VERSION,
  reviewStatus: 'reviewed-two-pass',
  provenance: [
    'Robo Rally 2005 Course Manual, Risky Exchange diagram',
    'Independent coordinate comparison with marcelpanse/roborally Area.start.simple'
  ],
  cells: [
    cell(1, 1, { kind: 'dock', number: 7 }),
    cell(12, 1, { kind: 'dock', number: 8 }),
    cell(2, 2, { kind: 'dock', number: 5 }),
    cell(11, 2, { kind: 'dock', number: 6 }),
    cell(4, 3, { kind: 'dock', number: 3 }),
    cell(6, 3, { kind: 'dock', number: 1 }),
    cell(7, 3, { kind: 'dock', number: 2 }),
    cell(9, 3, { kind: 'dock', number: 4 })
  ],
  walls: [
    { x: 3, y: 1, edge: 'north' },
    { x: 5, y: 1, edge: 'north' },
    { x: 8, y: 1, edge: 'north' },
    { x: 10, y: 1, edge: 'north' },
    { x: 2, y: 3, edge: 'west' },
    { x: 4, y: 3, edge: 'west' },
    { x: 6, y: 3, edge: 'west' },
    { x: 7, y: 3, edge: 'west' },
    { x: 9, y: 3, edge: 'west' },
    { x: 11, y: 3, edge: 'west' },
    { x: 12, y: 3, edge: 'west' },
    { x: 3, y: 4, edge: 'south' },
    { x: 5, y: 4, edge: 'south' },
    { x: 8, y: 4, edge: 'south' },
    { x: 10, y: 4, edge: 'south' }
  ] as Wall[]
});

export interface CourseManifest {
  id: string;
  name: string;
  sourceEdition: 'avalon-hill-2005';
  manifestVersion: string;
  reviewStatus: 'reviewed-two-pass';
  playerRange: readonly [number, number];
  difficulty: 'medium';
  boardPlacements: readonly {
    instanceId: string;
    boardId: string;
    origin: readonly [number, number];
    rotation: 0 | 1 | 2 | 3;
  }[];
  flags: readonly { number: 1 | 2 | 3; x: number; y: number }[];
}

export const RISKY_EXCHANGE: CourseManifest = Object.freeze({
  id: 'risky-exchange',
  name: 'Risky Exchange',
  sourceEdition: 'avalon-hill-2005',
  manifestVersion: COURSE_MANIFEST_VERSION,
  reviewStatus: 'reviewed-two-pass',
  playerRange: [2, 8] as const,
  difficulty: 'medium',
  boardPlacements: [
    { instanceId: 'exchange-1', boardId: 'exchange', origin: [1, 1] as const, rotation: 0 as const },
    {
      instanceId: 'docking-bay-1',
      boardId: 'docking-bay-a',
      origin: [1, 13] as const,
      rotation: 0 as const
    }
  ],
  flags: [
    { number: 1 as const, x: 8, y: 2 },
    { number: 2 as const, x: 10, y: 8 },
    { number: 3 as const, x: 2, y: 5 }
  ]
});
