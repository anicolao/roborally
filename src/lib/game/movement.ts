import {
  DOCKING_BAY_A,
  EXCHANGE_BOARD,
  type Direction,
  type Wall
} from './course-manifest';
import { PROGRAM_CARDS, type ProgramAction, type ProgramCard } from './program-manifest';
import type { ProgrammingState } from './programming';
import type { RaceSetup } from './setup';

export interface RaceRobotPosition {
  uid: string;
  name: string;
  robotId: string;
  x: number;
  y: number;
  facing: Direction;
}

export interface ResolutionTraceEntry {
  id: string;
  register: number;
  actorUid: string;
  cardId: ProgramCard['id'];
  priority: number;
  kind: 'reveal' | 'move' | 'rotate' | 'blocked-wall' | 'blocked-robot' | 'edge-deferred';
  text: string;
}

export interface ProgramResolution {
  phase: 'turn-complete';
  robots: RaceRobotPosition[];
  trace: ResolutionTraceEntry[];
}

const directionOrder: Direction[] = ['north', 'east', 'south', 'west'];
const steps: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0]
};
const opposite: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east'
};

function rotate(facing: Direction, quarterTurns: number): Direction {
  return directionOrder[
    (directionOrder.indexOf(facing) + quarterTurns + directionOrder.length) %
      directionOrder.length
  ];
}

function worldWalls(): Wall[] {
  return [
    ...EXCHANGE_BOARD.walls,
    ...DOCKING_BAY_A.walls.map((wall) => ({ ...wall, y: wall.y + 12 }))
  ];
}

const wallKeys = new Set(worldWalls().map(({ x, y, edge }) => `${x},${y},${edge}`));

export function movementBlockedByWall(
  x: number,
  y: number,
  direction: Direction
): boolean {
  const [dx, dy] = steps[direction];
  return (
    wallKeys.has(`${x},${y},${direction}`) ||
    wallKeys.has(`${x + dx},${y + dy},${opposite[direction]}`)
  );
}

export function courseContains(x: number, y: number): boolean {
  return x >= 1 && x <= 12 && y >= 1 && y <= 16;
}

function movementDistance(action: ProgramAction): number {
  if (action === 'move-1') return 1;
  if (action === 'move-2') return 2;
  if (action === 'move-3') return 3;
  if (action === 'back-up') return -1;
  return 0;
}

export function applyProgramCard(
  robots: RaceRobotPosition[],
  actorUid: string,
  card: ProgramCard,
  register: number,
  trace: ResolutionTraceEntry[]
) {
  const robot = robots.find(({ uid }) => uid === actorUid);
  if (!robot) return;
  const traceId = () => `r${register}-${String(trace.length + 1).padStart(3, '0')}`;
  trace.push({
    id: traceId(),
    register,
    actorUid,
    cardId: card.id,
    priority: card.priority,
    kind: 'reveal',
    text: `${robot.name} revealed ${card.action} at priority ${card.priority}.`
  });

  const rotation =
    card.action === 'rotate-right'
      ? 1
      : card.action === 'rotate-left'
        ? -1
        : card.action === 'u-turn'
          ? 2
          : 0;
  if (rotation) {
    const before = robot.facing;
    robot.facing = rotate(robot.facing, rotation);
    trace.push({
      id: traceId(),
      register,
      actorUid,
      cardId: card.id,
      priority: card.priority,
      kind: 'rotate',
      text: `${robot.name} rotated from ${before} to ${robot.facing}.`
    });
    return;
  }

  const signedDistance = movementDistance(card.action);
  const direction = signedDistance < 0 ? opposite[robot.facing] : robot.facing;
  for (let step = 1; step <= Math.abs(signedDistance); step += 1) {
    if (movementBlockedByWall(robot.x, robot.y, direction)) {
      trace.push({
        id: traceId(),
        register,
        actorUid,
        cardId: card.id,
        priority: card.priority,
        kind: 'blocked-wall',
        text: `${robot.name} stopped at (${robot.x},${robot.y}); a wall blocks ${direction}.`
      });
      return;
    }
    const [dx, dy] = steps[direction];
    const nextX = robot.x + dx;
    const nextY = robot.y + dy;
    if (!courseContains(nextX, nextY)) {
      trace.push({
        id: traceId(),
        register,
        actorUid,
        cardId: card.id,
        priority: card.priority,
        kind: 'edge-deferred',
        text: `${robot.name} reached the course edge; destruction is resolved in Step 6.`
      });
      return;
    }
    if (robots.some((other) => other.uid !== actorUid && other.x === nextX && other.y === nextY)) {
      trace.push({
        id: traceId(),
        register,
        actorUid,
        cardId: card.id,
        priority: card.priority,
        kind: 'blocked-robot',
        text: `${robot.name} reached another robot; pushing is resolved in Step 6.`
      });
      return;
    }
    robot.x = nextX;
    robot.y = nextY;
    trace.push({
      id: traceId(),
      register,
      actorUid,
      cardId: card.id,
      priority: card.priority,
      kind: 'move',
      text: `${robot.name} completed step ${step} at (${robot.x},${robot.y}) facing ${robot.facing}.`
    });
  }
}

export function resolveProgrammedTurn(
  programming: ProgrammingState,
  setup: RaceSetup
): ProgramResolution | null {
  if (programming.phase !== 'programmed') return null;
  const robots = setup.players.map((player) => ({
    uid: player.uid,
    name: player.name,
    robotId: player.robotId,
    x: player.position.x,
    y: player.position.y,
    facing: player.facing
  }));
  const trace: ResolutionTraceEntry[] = [];
  const cards = new Map(PROGRAM_CARDS.map((card) => [card.id, card]));

  for (let register = 1; register <= 5; register += 1) {
    const queue = programming.players
      .map((player) => {
        const cardId = player.registers[register - 1].cardId;
        const card = cardId ? cards.get(cardId) : undefined;
        return card ? { uid: player.uid, card } : null;
      })
      .filter((entry): entry is { uid: string; card: ProgramCard } => entry !== null)
      .sort((left, right) => right.card.priority - left.card.priority);
    for (const entry of queue) applyProgramCard(robots, entry.uid, entry.card, register, trace);
  }

  return { phase: 'turn-complete', robots, trace };
}
