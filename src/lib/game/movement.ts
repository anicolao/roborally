import {
  DOCKING_BAY_A,
  EXCHANGE_BOARD,
  type Direction,
  type Wall
} from './course-manifest';
import { PROGRAM_CARDS, type ProgramAction, type ProgramCard } from './program-manifest';
import type { ProgrammingState } from './programming';
import type { RaceSetup } from './setup';

export type RobotBoardStatus = 'active' | 'destroyed' | 'eliminated';

export interface RaceRobotPosition {
  uid: string;
  name: string;
  robotId: string;
  x: number;
  y: number;
  facing: Direction;
  archive: { x: number; y: number };
  lives: number;
  damage: number;
  status: RobotBoardStatus;
  destructionOrder: number | null;
  optionLossPending: boolean;
}

export type ResolutionTraceKind =
  | 'reveal'
  | 'move'
  | 'rotate'
  | 'blocked-wall'
  | 'pushed'
  | 'push-blocked-wall'
  | 'destroyed-pit'
  | 'destroyed-edge'
  | 'option-loss-placeholder'
  | 'life-lost'
  | 'eliminated'
  | 'reentry-required'
  | 'reentered';

export interface ResolutionTraceEntry {
  id: string;
  register: number;
  actorUid: string;
  cardId: ProgramCard['id'] | null;
  priority: number | null;
  kind: ResolutionTraceKind;
  text: string;
}

export interface ReentryChoice {
  x: number;
  y: number;
  facing: Direction;
}

export interface ProgramResolution {
  phase: 'awaiting-reentry' | 'turn-complete';
  robots: RaceRobotPosition[];
  trace: ResolutionTraceEntry[];
  nextReentryUid: string | null;
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
const pitKeys = new Set(
  EXCHANGE_BOARD.cells
    .filter(({ elements }) => elements.some(({ kind }) => kind === 'pit'))
    .map(({ x, y }) => `${x},${y}`)
);

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

export function courseHasPit(x: number, y: number): boolean {
  return pitKeys.has(`${x},${y}`);
}

function movementDistance(action: ProgramAction): number {
  if (action === 'move-1') return 1;
  if (action === 'move-2') return 2;
  if (action === 'move-3') return 3;
  if (action === 'back-up') return -1;
  return 0;
}

function nextTraceId(trace: readonly ResolutionTraceEntry[], register: number) {
  return `r${register}-${String(trace.length + 1).padStart(3, '0')}`;
}

function addTrace(
  trace: ResolutionTraceEntry[],
  register: number,
  actorUid: string,
  card: ProgramCard | null,
  kind: ResolutionTraceKind,
  text: string
) {
  trace.push({
    id: nextTraceId(trace, register),
    register,
    actorUid,
    cardId: card?.id ?? null,
    priority: card?.priority ?? null,
    kind,
    text
  });
}

function activeRobotAt(
  robots: readonly RaceRobotPosition[],
  x: number,
  y: number,
  excludingUid?: string
) {
  return robots.find(
    (robot) =>
      robot.status === 'active' &&
      robot.uid !== excludingUid &&
      robot.x === x &&
      robot.y === y
  );
}

function destroyRobot(
  robots: RaceRobotPosition[],
  robot: RaceRobotPosition,
  hazard: 'pit' | 'edge',
  register: number,
  card: ProgramCard,
  trace: ResolutionTraceEntry[]
) {
  if (robot.status !== 'active') return;
  robot.destructionOrder =
    Math.max(0, ...robots.map(({ destructionOrder }) => destructionOrder ?? 0)) + 1;
  robot.lives -= 1;
  robot.damage = 0;
  robot.optionLossPending = false;
  robot.status = robot.lives > 0 ? 'destroyed' : 'eliminated';
  addTrace(
    trace,
    register,
    robot.uid,
    card,
    hazard === 'pit' ? 'destroyed-pit' : 'destroyed-edge',
    `${robot.name} was destroyed ${hazard === 'pit' ? 'by a pit' : 'off course'} ` +
      `as destruction ${robot.destructionOrder}.`
  );
  addTrace(
    trace,
    register,
    robot.uid,
    card,
    'option-loss-placeholder',
    `${robot.name} has no reviewed Option card to discard; the mandatory loss hook is preserved.`
  );
  addTrace(
    trace,
    register,
    robot.uid,
    card,
    'life-lost',
    `${robot.name} lost one Life and has ${robot.lives} remaining.`
  );
  if (robot.status === 'eliminated') {
    addTrace(
      trace,
      register,
      robot.uid,
      card,
      'eliminated',
      `${robot.name} lost the last Life and is permanently eliminated.`
    );
  }
}

interface TranslationResult {
  moved: boolean;
  actorDestroyed: boolean;
}

function translateOneCell(
  robots: RaceRobotPosition[],
  actor: RaceRobotPosition,
  direction: Direction,
  stepNumber: number,
  register: number,
  card: ProgramCard,
  trace: ResolutionTraceEntry[]
): TranslationResult {
  const chain: RaceRobotPosition[] = [actor];
  let cursor = actor;
  while (true) {
    if (movementBlockedByWall(cursor.x, cursor.y, direction)) {
      addTrace(
        trace,
        register,
        actor.uid,
        card,
        chain.length === 1 ? 'blocked-wall' : 'push-blocked-wall',
        chain.length === 1
          ? `${actor.name} stopped at (${actor.x},${actor.y}); a wall blocks ${direction}.`
          : `${actor.name}'s ${chain.length - 1}-robot push was cancelled; ` +
              `a wall blocks ${cursor.name} to the ${direction}.`
      );
      return { moved: false, actorDestroyed: false };
    }
    const [dx, dy] = steps[direction];
    const occupant = activeRobotAt(robots, cursor.x + dx, cursor.y + dy);
    if (!occupant) break;
    chain.push(occupant);
    cursor = occupant;
  }

  const [dx, dy] = steps[direction];
  for (const moving of [...chain].reverse()) {
    const nextX = moving.x + dx;
    const nextY = moving.y + dy;
    if (!courseContains(nextX, nextY)) {
      destroyRobot(robots, moving, 'edge', register, card, trace);
      continue;
    }
    if (courseHasPit(nextX, nextY)) {
      destroyRobot(robots, moving, 'pit', register, card, trace);
      continue;
    }
    moving.x = nextX;
    moving.y = nextY;
    addTrace(
      trace,
      register,
      moving.uid,
      card,
      moving.uid === actor.uid ? 'move' : 'pushed',
      moving.uid === actor.uid
        ? `${moving.name} completed step ${stepNumber} at (${moving.x},${moving.y}) ` +
            `facing ${moving.facing}.`
        : `${moving.name} was pushed ${direction} to (${moving.x},${moving.y}).`
    );
  }
  return { moved: true, actorDestroyed: actor.status !== 'active' };
}

export function applyProgramCard(
  robots: RaceRobotPosition[],
  actorUid: string,
  card: ProgramCard,
  register: number,
  trace: ResolutionTraceEntry[]
) {
  const robot = robots.find(({ uid }) => uid === actorUid);
  if (!robot || robot.status !== 'active') return;
  addTrace(
    trace,
    register,
    actorUid,
    card,
    'reveal',
    `${robot.name} revealed ${card.action} at priority ${card.priority}.`
  );

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
    addTrace(
      trace,
      register,
      actorUid,
      card,
      'rotate',
      `${robot.name} rotated from ${before} to ${robot.facing}.`
    );
    return;
  }

  const signedDistance = movementDistance(card.action);
  const direction = signedDistance < 0 ? opposite[robot.facing] : robot.facing;
  for (let step = 1; step <= Math.abs(signedDistance); step += 1) {
    const result = translateOneCell(robots, robot, direction, step, register, card, trace);
    if (!result.moved || result.actorDestroyed) return;
  }
}

function nextDestroyedRobot(robots: readonly RaceRobotPosition[]) {
  return [...robots]
    .filter(({ status }) => status === 'destroyed')
    .sort(
      (left, right) =>
        (left.destructionOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.destructionOrder ?? Number.MAX_SAFE_INTEGER)
    )[0];
}

function updateResolutionPhase(resolution: ProgramResolution) {
  const next = nextDestroyedRobot(resolution.robots);
  resolution.nextReentryUid = next?.uid ?? null;
  resolution.phase = next ? 'awaiting-reentry' : 'turn-complete';
}

function hasRobotInLineOfSight(
  robots: readonly RaceRobotPosition[],
  x: number,
  y: number,
  facing: Direction
) {
  let cursorX = x;
  let cursorY = y;
  const [dx, dy] = steps[facing];
  for (let distance = 1; distance <= 3; distance += 1) {
    if (movementBlockedByWall(cursorX, cursorY, facing)) return false;
    cursorX += dx;
    cursorY += dy;
    if (activeRobotAt(robots, cursorX, cursorY)) return true;
  }
  return false;
}

export function legalReentryChoices(
  resolution: ProgramResolution,
  uid: string
): ReentryChoice[] {
  if (resolution.nextReentryUid !== uid) return [];
  const robot = resolution.robots.find((candidate) => candidate.uid === uid);
  if (!robot || robot.status !== 'destroyed') return [];
  const archiveOpen =
    !activeRobotAt(resolution.robots, robot.archive.x, robot.archive.y) &&
    !courseHasPit(robot.archive.x, robot.archive.y);
  const cells = archiveOpen
    ? [robot.archive]
    : [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1]
          .filter((dx) => dx !== 0 || dy !== 0)
          .map((dx) => ({ x: robot.archive.x + dx, y: robot.archive.y + dy }))
      );

  return cells
    .filter(
      ({ x, y }) =>
        courseContains(x, y) &&
        !courseHasPit(x, y) &&
        !activeRobotAt(resolution.robots, x, y)
    )
    .flatMap(({ x, y }) =>
      directionOrder
        .filter(
          (facing) =>
            archiveOpen || !hasRobotInLineOfSight(resolution.robots, x, y, facing)
        )
        .map((facing) => ({ x, y, facing }))
    );
}

export function applyReentryChoice(
  current: ProgramResolution,
  uid: string,
  choice: ReentryChoice
): ProgramResolution {
  const resolution: ProgramResolution = {
    ...current,
    robots: current.robots.map((robot) => ({
      ...robot,
      archive: { ...robot.archive }
    })),
    trace: [...current.trace]
  };
  const legal = legalReentryChoices(resolution, uid);
  if (!legal.some(({ x, y, facing }) => x === choice.x && y === choice.y && facing === choice.facing)) {
    return current;
  }
  const robot = resolution.robots.find((candidate) => candidate.uid === uid)!;
  robot.x = choice.x;
  robot.y = choice.y;
  robot.facing = choice.facing;
  robot.damage += 2;
  robot.status = 'active';
  addTrace(
    resolution.trace,
    6,
    uid,
    null,
    'reentered',
    `${robot.name} re-entered at (${robot.x},${robot.y}) facing ${robot.facing} with ` +
      `${robot.damage} damage.`
  );
  updateResolutionPhase(resolution);
  const next = nextDestroyedRobot(resolution.robots);
  if (next) {
    addTrace(
      resolution.trace,
      6,
      next.uid,
      null,
      'reentry-required',
      `${next.name} must choose a legal re-entry cell and facing.`
    );
  }
  return resolution;
}

export function createRaceRobotPositions(setup: RaceSetup): RaceRobotPosition[] {
  return setup.players.map((player) => ({
    uid: player.uid,
    name: player.name,
    robotId: player.robotId,
    x: player.position.x,
    y: player.position.y,
    facing: player.facing,
    archive: { ...player.archive },
    lives: player.lives,
    damage: 0,
    status: 'active',
    destructionOrder: null,
    optionLossPending: false
  }));
}

export function resolveProgrammedTurn(
  programming: ProgrammingState,
  setup: RaceSetup,
  initialRobots = createRaceRobotPositions(setup)
): ProgramResolution | null {
  if (programming.phase !== 'programmed') return null;
  const robots = initialRobots.map((robot) => ({ ...robot, archive: { ...robot.archive } }));
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

  const resolution: ProgramResolution = {
    phase: 'turn-complete',
    robots,
    trace,
    nextReentryUid: null
  };
  updateResolutionPhase(resolution);
  const next = nextDestroyedRobot(robots);
  if (next) {
    addTrace(
      trace,
      6,
      next.uid,
      null,
      'reentry-required',
      `${next.name} must choose a legal re-entry cell and facing.`
    );
  }
  return resolution;
}
