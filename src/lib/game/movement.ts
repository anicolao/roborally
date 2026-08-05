import type { BoardCell, BoardElement, Direction } from './course-manifest';
import type { CompiledCourse } from './course-geometry';
import { compilePlayableCourse } from './playable-courses';
import { PROGRAM_CARDS, type ProgramAction, type ProgramCard } from './program-manifest';
import { OPTION_CARDS_BY_ID, type OptionCardId } from './option-manifest';
import {
  cloneOptionDeck,
  createOptionDeck,
  discardOwnedOption,
  drawOption,
  optionPlanFor,
  type OptionDeckState,
  type OptionTurnPlan,
  type OwnedOption
} from './options';
import type { ProgrammingState } from './programming';
import type { PlayableCourseId, RaceSetup } from './setup';
import { applyOptionEffect } from './option-effects';
import { scenarioResolutionRules, type ScenarioResolutionRules } from './course-rules';

export type RobotBoardStatus = 'active' | 'destroyed' | 'eliminated';
export type RegisterNumber = 1 | 2 | 3 | 4 | 5;

export interface LockedRegisterState {
  register: RegisterNumber;
  cardId: ProgramCard['id'];
}

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
  lockedRegisters: LockedRegisterState[];
  touchedFlags: number[];
  nextFlag: number | null;
  pendingOptionDraws: number;
  options: OwnedOption[];
  poweredDown: boolean;
  powerDownNextTurn: boolean;
  status: RobotBoardStatus;
  destructionOrder: number | null;
  optionLossPending: boolean;
  superiorArchivePending: boolean;
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
  | 'option-loss'
  | 'life-lost'
  | 'eliminated'
  | 'reentry-required'
  | 'reentered'
  | 'express-conveyor'
  | 'conveyor'
  | 'conveyor-conflict'
  | 'pusher'
  | 'pusher-blocked'
  | 'gear'
  | 'board-laser'
  | 'robot-laser'
  | 'option-decision-required'
  | 'option-decision-resolved'
  | 'damage-choice-required'
  | 'damage-choice-resolved'
  | 'damage'
  | 'option-damage-prevented'
  | 'option-effect'
  | 'destroyed-damage'
  | 'flag-touched'
  | 'archive-updated'
  | 'repair'
  | 'register-unlocked'
  | 'option-drawn'
  | 'winner';

export interface ResolutionTraceEntry {
  id: string;
  register: number;
  actorUid: string;
  cardId: ProgramCard['id'] | null;
  priority: number | null;
  kind: ResolutionTraceKind;
  text: string;
}

export interface RobotLaserBeam {
  id: string;
  sourceUid: string;
  targetUid: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  beamCount: 1 | 2;
}

export interface OptionDecision {
  decisionId: string;
  uid: string;
  choiceId: string;
}

export interface OptionDecisionChoice {
  id: string;
  label: string;
  description: string;
  cardId?: OptionCardId;
}

export interface PendingOptionDecision {
  decisionId: string;
  uid: string;
  cardId: OptionCardId | null;
  timing: 'before-register' | 'damage' | 'program-movement' | 'robot-lasers';
  register: RegisterNumber;
  heading: string;
  prompt: string;
  tabletopPrompt: string;
  choices: OptionDecisionChoice[];
}

export interface ProgramPlaybackFrame {
  register: RegisterNumber;
  stage:
    | 'program-card'
    | 'express-conveyors'
    | 'conveyors'
    | 'pushers'
    | 'gears'
    | 'lasers'
    | 'laser-damage';
  actorUid: string | null;
  cardId: ProgramCard['id'] | null;
  robots: RaceRobotPosition[];
  trace: ResolutionTraceEntry[];
  laserBeams?: RobotLaserBeam[];
}

export interface ProgramPlayback {
  initialRobots: RaceRobotPosition[];
  frames: ProgramPlaybackFrame[];
}

export interface ReentryChoice {
  x: number;
  y: number;
  facing: Direction;
  poweredDown?: boolean;
}

export interface ProgramResolution {
  courseId?: PlayableCourseId;
  turnNumber: number;
  phase:
    | 'awaiting-option-decision'
    | 'awaiting-option'
    | 'awaiting-reentry'
    | 'turn-complete'
    | 'race-finished';
  robots: RaceRobotPosition[];
  trace: ResolutionTraceEntry[];
  optionDeck: OptionDeckState;
  nextOptionChoiceUid: string | null;
  pendingOptionDecision?: PendingOptionDecision | null;
  nextReentryUid: string | null;
  winnerUids: string[];
  runnersUpUids: string[];
  summary: RaceSummary | null;
  playback: ProgramPlayback;
  /** Immutable turn-start deck used when persisted execution choices replay the turn. */
  initialOptionDeck?: OptionDeckState;
}

export interface RaceSummary {
  winnerUids: readonly string[];
  runnersUpUids: readonly string[];
  standings: readonly {
    uid: string;
    touchedFlags: readonly number[];
    lives: number;
    damage: number;
    status: RobotBoardStatus;
  }[];
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

const defaultCourse = compilePlayableCourse('risky-exchange');
const defaultCourseCells: BoardCell[] = [...defaultCourse.cells.values()];

function resolutionCourse(resolution: Pick<ProgramResolution, 'courseId'>): CompiledCourse {
  return compilePlayableCourse(resolution.courseId ?? 'risky-exchange');
}

export function movementBlockedByWall(
  x: number,
  y: number,
  direction: Direction,
  course: CompiledCourse = defaultCourse,
  rules: ScenarioResolutionRules = scenarioResolutionRules(course.course),
  optionDeck?: OptionDeckState
): boolean {
  const [dx, dy] = steps[direction];
  return (
    course.walls.has(`${x},${y},${direction}`) ||
    course.walls.has(`${x + dx},${y + dy},${opposite[direction]}`)
  );
}

export function courseContains(
  x: number,
  y: number,
  course: CompiledCourse = defaultCourse
): boolean {
  return course.cells.has(`${x},${y}`);
}

export function courseHasPit(
  x: number,
  y: number,
  course: CompiledCourse = defaultCourse
): boolean {
  return course.cells
    .get(`${x},${y}`)
    ?.elements.some(({ kind }) => kind === 'pit') ?? false;
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
  hazard: 'pit' | 'edge' | 'damage',
  register: number,
  card: ProgramCard | null,
  trace: ResolutionTraceEntry[]
) {
  if (robot.status !== 'active') return;
  robot.destructionOrder =
    Math.max(0, ...robots.map(({ destructionOrder }) => destructionOrder ?? 0)) + 1;
  robot.lives -= 1;
  robot.damage = 0;
  robot.lockedRegisters = [];
  robot.optionLossPending = robot.options.length > 0;
  robot.superiorArchivePending =
    robot.superiorArchivePending ||
    robot.options.some(({ cardId }) => cardId === 'superior-archive-copy');
  robot.status = robot.lives > 0 ? 'destroyed' : 'eliminated';
  addTrace(
    trace,
    register,
    robot.uid,
    card,
    hazard === 'pit'
      ? 'destroyed-pit'
      : hazard === 'edge'
        ? 'destroyed-edge'
        : 'destroyed-damage',
    `${robot.name} was destroyed ${
      hazard === 'pit' ? 'by a pit' : hazard === 'edge' ? 'off course' : 'by tenth damage'
    } ` +
      `as destruction ${robot.destructionOrder}.`
  );
  if (robot.options.length === 0) {
    addTrace(
      trace,
      register,
      robot.uid,
      card,
      'option-loss',
      `${robot.name} owned no Option card, so destruction caused no Option loss.`
    );
  }
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
  pendingOptionDecision?: PendingOptionDecision;
}

function translateOneCell(
  robots: RaceRobotPosition[],
  actor: RaceRobotPosition,
  direction: Direction,
  stepNumber: number,
  register: number,
  card: ProgramCard | null,
  trace: ResolutionTraceEntry[],
  source: 'program' | 'pusher' | 'weapon' = 'program',
  course: CompiledCourse = defaultCourse,
  programming?: ProgrammingState,
  optionDeck?: OptionDeckState,
  optionDecisions: Readonly<Record<string, OptionDecision>> = {}
): TranslationResult {
  const chain: RaceRobotPosition[] = [actor];
  let cursor = actor;
  while (true) {
    if (movementBlockedByWall(cursor.x, cursor.y, direction, course)) {
      addTrace(
        trace,
        register,
        actor.uid,
        card,
        source === 'pusher'
          ? 'pusher-blocked'
          : chain.length === 1
            ? 'blocked-wall'
            : 'push-blocked-wall',
        source === 'pusher'
          ? `The register ${register} pusher under ${actor.name} was blocked by a wall.`
          : chain.length === 1
          ? `${actor.name} stopped at (${actor.x},${actor.y}); a wall blocks ${direction}.`
          : `${actor.name}'s ${chain.length - 1}-robot push was cancelled; ` +
              `a wall blocks ${cursor.name} to the ${direction}.`
      );
      return { moved: false, actorDestroyed: false };
    }
    const [dx, dy] = steps[direction];
    const occupant = activeRobotAt(robots, cursor.x + dx, cursor.y + dy);
    if (!occupant) break;
    if (
      chain.length === 1 &&
      source === 'program' &&
      programming &&
      actor.options.some(({ cardId }) => cardId === 'ramming-gear')
    ) {
      const pendingOptionDecision = resolveOptionDamage(
        robots,
        occupant,
        register,
        trace,
        programming,
        optionDeck,
        optionDecisions,
        `r${register}-program-${actor.uid}-ramming-gear-step-${stepNumber}-${occupant.uid}`,
        'Ramming Gear damage'
      );
      if (pendingOptionDecision) {
        return { moved: false, actorDestroyed: false, pendingOptionDecision };
      }
      addTrace(
        trace,
        register,
        actor.uid,
        card,
        'option-effect',
        `${actor.name}'s ramming gear hit ${occupant.name} for one damage.`
      );
      if (occupant.status !== 'active') continue;
    }
    chain.push(occupant);
    cursor = occupant;
  }

  const [dx, dy] = steps[direction];
  for (const moving of [...chain].reverse()) {
    const nextX = moving.x + dx;
    const nextY = moving.y + dy;
    if (!courseContains(nextX, nextY, course)) {
      destroyRobot(robots, moving, 'edge', register, card, trace);
      continue;
    }
    if (courseHasPit(nextX, nextY, course)) {
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
      moving.uid === actor.uid
        ? source === 'pusher'
          ? 'pusher'
          : source === 'weapon'
            ? 'pushed'
            : 'move'
        : 'pushed',
      moving.uid === actor.uid && source === 'pusher'
        ? `${moving.name} was moved ${direction} by a register ${register} pusher to ` +
          `(${moving.x},${moving.y}).`
        : moving.uid === actor.uid && source === 'weapon'
          ? `${moving.name} was pushed ${direction} by an Option weapon to ` +
            `(${moving.x},${moving.y}).`
        : moving.uid === actor.uid
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
  trace: ResolutionTraceEntry[],
  optionPlan?: OptionTurnPlan,
  course: CompiledCourse = defaultCourse,
  optionDecisions: Readonly<Record<string, OptionDecision>> = {},
  programming?: ProgrammingState,
  optionDeck?: OptionDeckState
): PendingOptionDecision | null {
  const robot = robots.find(({ uid }) => uid === actorUid);
  if (!robot || robot.status !== 'active' || robot.poweredDown) return null;
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
    return null;
  }

  let signedDistance = movementDistance(card.action);
  let direction = signedDistance < 0 ? opposite[robot.facing] : robot.facing;
  let rotationAfterMovement: -1 | 1 | 2 | undefined;
  if (
    card.action === 'move-1' &&
    robot.options.some(({ cardId }) => cardId === 'brakes')
  ) {
    const decisionId = `r${register}-program-${robot.uid}-brakes`;
    const decision = optionDecisions[decisionId];
    if (!decision || decision.uid !== robot.uid || !['use', 'decline'].includes(decision.choiceId)) {
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-decision-required',
        `${robot.name} must decide whether to use brakes for this Move 1.`
      );
      return {
        decisionId,
        uid: robot.uid,
        cardId: 'brakes',
        timing: 'program-movement',
        register: register as RegisterNumber,
        heading: 'Use Brakes?',
        prompt: `${robot.name} is about to execute Move 1. It may move zero spaces instead.`,
        tabletopPrompt: 'Use Brakes or execute Move 1 normally',
        choices: [
          {
            id: 'use',
            label: 'Use Brakes',
            description: 'Move zero spaces at this card’s printed priority.',
            cardId: 'brakes'
          },
          {
            id: 'decline',
            label: 'Move normally',
            description: 'Execute Move 1 normally.'
          }
        ]
      };
    }
    if (decision.choiceId === 'use') {
      signedDistance = 0;
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-effect',
        `${robot.name} used brakes and moved zero spaces.`
      );
    }
  }
  if (
    card.action === 'move-3' &&
    robot.options.some(({ cardId }) => cardId === 'fourth-gear')
  ) {
    const decisionId = `r${register}-program-${robot.uid}-fourth-gear`;
    const decision = optionDecisions[decisionId];
    if (!decision || decision.uid !== robot.uid || !['use', 'decline'].includes(decision.choiceId)) {
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-decision-required',
        `${robot.name} must decide whether to use fourth gear for this Move 3.`
      );
      return {
        decisionId,
        uid: robot.uid,
        cardId: 'fourth-gear',
        timing: 'program-movement',
        register: register as RegisterNumber,
        heading: 'Use Fourth Gear?',
        prompt: `${robot.name} is about to execute Move 3. It may move four spaces instead.`,
        tabletopPrompt: 'Use Fourth Gear or execute Move 3 normally',
        choices: [
          {
            id: 'use',
            label: 'Use Fourth Gear',
            description: 'Move four spaces at this card’s printed priority.',
            cardId: 'fourth-gear'
          },
          {
            id: 'decline',
            label: 'Move normally',
            description: 'Execute Move 3 normally.'
          }
        ]
      };
    }
    if (decision.choiceId === 'use') {
      signedDistance = 4;
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-effect',
        `${robot.name} used fourth gear and will move four spaces.`
      );
    }
  }
  if (
    card.action === 'back-up' &&
    robot.options.some(({ cardId }) => cardId === 'reverse-gears')
  ) {
    const decisionId = `r${register}-program-${robot.uid}-reverse-gears`;
    const decision = optionDecisions[decisionId];
    if (!decision || decision.uid !== robot.uid || !['use', 'decline'].includes(decision.choiceId)) {
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-decision-required',
        `${robot.name} must decide whether to use reverse gears for this Back Up.`
      );
      return {
        decisionId,
        uid: robot.uid,
        cardId: 'reverse-gears',
        timing: 'program-movement',
        register: register as RegisterNumber,
        heading: 'Use Reverse Gears?',
        prompt: `${robot.name} is about to execute Back Up. It may move backward two spaces instead.`,
        tabletopPrompt: 'Use Reverse Gears or execute Back Up normally',
        choices: [
          {
            id: 'use',
            label: 'Use Reverse Gears',
            description: 'Move backward two spaces at this card’s printed priority.',
            cardId: 'reverse-gears'
          },
          {
            id: 'decline',
            label: 'Move normally',
            description: 'Execute Back Up normally.'
          }
        ]
      };
    }
    if (decision.choiceId === 'use') {
      signedDistance = -2;
      direction = opposite[robot.facing];
      addTrace(
        trace,
        register,
        robot.uid,
        card,
        'option-effect',
        `${robot.name} used reverse gears and will move backward two spaces.`
      );
    }
  }
  const programmingPlayer = programming?.players.find(({ uid }) => uid === robot.uid);
  const pairedCardIds = new Set(
    Object.values(optionDecisions).flatMap((decision) =>
      decision.uid === robot.uid &&
      decision.choiceId.startsWith('pair:') &&
      !decision.decisionId.startsWith(`r${register}-program-${robot.uid}-`)
        ? [decision.choiceId.slice('pair:'.length)]
        : []
    )
  );
  const availableRotations = (programmingPlayer?.unusedCardIds ?? []).flatMap(
    (cardId) => {
      const pairedCard = PROGRAM_CARDS.find(({ id }) => id === cardId);
      return pairedCard &&
        ['rotate-left', 'rotate-right', 'u-turn'].includes(pairedCard.action) &&
        !pairedCardIds.has(cardId)
        ? [pairedCard]
        : [];
    }
  );
  if (
    card.action === 'move-1' &&
    signedDistance === 1 &&
    robot.options.some(({ cardId }) => cardId === 'crab-legs')
  ) {
    const crabRotations = availableRotations.filter(
      ({ action }) => action === 'rotate-left' || action === 'rotate-right'
    );
    if (crabRotations.length > 0) {
      const decisionId = `r${register}-program-${robot.uid}-crab-legs`;
      const decision = optionDecisions[decisionId];
      const validChoiceIds = new Set([
        'decline',
        ...crabRotations.map(({ id }) => `pair:${id}`)
      ]);
      if (
        !decision ||
        decision.uid !== robot.uid ||
        !validChoiceIds.has(decision.choiceId)
      ) {
        addTrace(
          trace,
          register,
          robot.uid,
          card,
          'option-decision-required',
          `${robot.name} must decide whether to pair Move 1 with Crab Legs.`
        );
        return {
          decisionId,
          uid: robot.uid,
          cardId: 'crab-legs',
          timing: 'program-movement',
          register: register as RegisterNumber,
          heading: 'Use Crab Legs?',
          prompt: 'Pair an unused Rotate Left or Rotate Right to sidestep without rotating?',
          tabletopPrompt: 'Use Crab Legs for this Move 1',
          choices: [
            ...crabRotations.map((pairedCard) => ({
              id: `pair:${pairedCard.id}`,
              label: `Sidestep ${pairedCard.action === 'rotate-left' ? 'left' : 'right'}`,
              description: `Pair the unused ${pairedCard.action} ${pairedCard.priority} card.`,
              cardId: 'crab-legs' as const
            })),
            {
              id: 'decline',
              label: 'Move normally',
              description: 'Keep the unused Rotate card and execute Move 1.'
            }
          ]
        };
      }
      if (decision.choiceId.startsWith('pair:')) {
        const pairedCard = crabRotations.find(
          ({ id }) => `pair:${id}` === decision.choiceId
        )!;
        direction = rotate(robot.facing, pairedCard.action === 'rotate-left' ? -1 : 1);
        signedDistance = 1;
        addTrace(
          trace,
          register,
          robot.uid,
          card,
          'option-effect',
          `${robot.name} paired ${pairedCard.action} with Crab Legs and sidestepped ${direction}.`
        );
      }
    }
  }
  for (let step = 1; step <= Math.abs(signedDistance); step += 1) {
    const result = translateOneCell(
      robots,
      robot,
      direction,
      step,
      register,
      card,
      trace,
      'program',
      course,
      programming,
      optionDeck,
      optionDecisions
    );
    if (result.pendingOptionDecision) return result.pendingOptionDecision;
    if (!result.moved || result.actorDestroyed) return null;
  }
  if (rotationAfterMovement) {
    const before = robot.facing;
    robot.facing = rotate(robot.facing, rotationAfterMovement);
    addTrace(
      trace,
      register,
      robot.uid,
      card,
      'option-effect',
      `${robot.name}'s dual processor rotated from ${before} to ${robot.facing}.`
    );
  }
  return null;
}

interface ConveyorIntent {
  robot: RaceRobotPosition;
  conveyor: Extract<BoardElement, { kind: 'conveyor' }>;
  nextX: number;
  nextY: number;
}

function elementAt(
  cells: readonly BoardCell[],
  x: number,
  y: number,
  kind: BoardElement['kind']
) {
  return cells
    .find((cell) => cell.x === x && cell.y === y)
    ?.elements.find((element) => element.kind === kind);
}

function resolveConveyorSubstep(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  expressOnly: boolean,
  cells: readonly BoardCell[],
  optionPlans: Readonly<Record<string, OptionTurnPlan>>,
  course: CompiledCourse
) {
  const intents: ConveyorIntent[] = [];
  for (const robot of robots.filter(({ status }) => status === 'active')) {
    const conveyor = elementAt(cells, robot.x, robot.y, 'conveyor') as
      | Extract<BoardElement, { kind: 'conveyor' }>
      | undefined;
    if (!conveyor || (expressOnly && !conveyor.express)) continue;
    const [dx, dy] = steps[conveyor.direction];
    if (movementBlockedByWall(robot.x, robot.y, conveyor.direction, course)) {
      addTrace(
        trace,
        register,
        robot.uid,
        null,
        'conveyor-conflict',
        `${robot.name}'s ${expressOnly ? 'express ' : ''}conveyor move was blocked by a wall.`
      );
      continue;
    }
    intents.push({
      robot,
      conveyor,
      nextX: robot.x + dx,
      nextY: robot.y + dy
    });
  }

  const rejected = new Set<string>();
  const destinations = new Map<string, ConveyorIntent[]>();
  for (const intent of intents) {
    const key = `${intent.nextX},${intent.nextY}`;
    destinations.set(key, [...(destinations.get(key) ?? []), intent]);
  }
  for (const destinationIntents of destinations.values()) {
    if (destinationIntents.length > 1) {
      for (const { robot } of destinationIntents) rejected.add(robot.uid);
    }
  }

  for (const origin of intents) {
    const path: string[] = [];
    let current: ConveyorIntent | undefined = origin;
    while (current && !rejected.has(current.robot.uid)) {
      const repeatedAt = path.indexOf(current.robot.uid);
      if (repeatedAt >= 0) {
        for (const uid of path.slice(repeatedAt)) rejected.add(uid);
        break;
      }
      path.push(current.robot.uid);
      const occupant = activeRobotAt(
        robots,
        current.nextX,
        current.nextY,
        current.robot.uid
      );
      current = occupant
        ? intents.find(({ robot }) => robot.uid === occupant.uid)
        : undefined;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const intent of intents) {
      if (rejected.has(intent.robot.uid)) continue;
      const occupant = activeRobotAt(robots, intent.nextX, intent.nextY, intent.robot.uid);
      if (!occupant) continue;
      const occupantIntent = intents.find(({ robot }) => robot.uid === occupant.uid);
      if (!occupantIntent || rejected.has(occupant.uid)) {
        rejected.add(intent.robot.uid);
        changed = true;
      }
    }
  }

  for (const intent of intents.filter(({ robot }) => rejected.has(robot.uid))) {
    addTrace(
      trace,
      register,
      intent.robot.uid,
      null,
      'conveyor-conflict',
      `${intent.robot.name}'s ${expressOnly ? 'express ' : ''}conveyor intent to ` +
        `(${intent.nextX},${intent.nextY}) conflicted; the robot stayed still.`
    );
  }

  for (const { robot, conveyor, nextX, nextY } of intents.filter(
    ({ robot }) => !rejected.has(robot.uid)
  )) {
    if (!courseContains(nextX, nextY, course)) {
      destroyRobot(robots, robot, 'edge', register, null, trace);
      continue;
    }
    if (courseHasPit(nextX, nextY, course)) {
      destroyRobot(robots, robot, 'pit', register, null, trace);
      continue;
    }
    robot.x = nextX;
    robot.y = nextY;
    const gyroscopeActive =
      robot.options.some(({ cardId }) => cardId === 'gyroscopic-stabilizer') &&
      optionPlanFor(optionPlans, robot.uid).activations.some(
        ({ cardId }) => cardId === 'gyroscopic-stabilizer'
      );
    if (!gyroscopeActive && conveyor.turn === 'left') {
      robot.facing = rotate(robot.facing, -1);
    }
    if (!gyroscopeActive && conveyor.turn === 'right') {
      robot.facing = rotate(robot.facing, 1);
    }
    addTrace(
      trace,
      register,
      robot.uid,
      null,
      expressOnly ? 'express-conveyor' : 'conveyor',
      `${robot.name} rode the ${expressOnly ? 'express ' : ''}conveyor to ` +
        `(${robot.x},${robot.y})${conveyor.turn ? ` and turned ${conveyor.turn}` : ''}.`
    );
  }
}

function resolveExpressConveyors(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  course: CompiledCourse = defaultCourse
) {
  resolveConveyorSubstep(robots, register, trace, true, cells, optionPlans, course);
}

function resolveNormalConveyors(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  course: CompiledCourse = defaultCourse
) {
  resolveConveyorSubstep(robots, register, trace, false, cells, optionPlans, course);
}

function resolvePushers(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  course: CompiledCourse = defaultCourse
) {
  for (const robot of [...robots]) {
    if (robot.status !== 'active') continue;
    const pusher = elementAt(cells, robot.x, robot.y, 'pusher') as
      | Extract<BoardElement, { kind: 'pusher' }>
      | undefined;
    if (!pusher?.activeRegisters.includes(register)) continue;
    translateOneCell(
      robots,
      robot,
      pusher.direction,
      1,
      register,
      null,
      trace,
      'pusher',
      course
    );
  }
}

function resolveGears(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {}
) {
  for (const robot of robots) {
    if (robot.status !== 'active') continue;
    const gear = elementAt(cells, robot.x, robot.y, 'gear') as
      | Extract<BoardElement, { kind: 'gear' }>
      | undefined;
    if (!gear) continue;
    if (
      robot.options.some(({ cardId }) => cardId === 'gyroscopic-stabilizer') &&
      optionPlanFor(optionPlans, robot.uid).activations.some(
        ({ cardId }) => cardId === 'gyroscopic-stabilizer'
      )
    ) {
      addTrace(
        trace,
        register,
        robot.uid,
        null,
        'option-effect',
        `${robot.name}'s gyroscopic stabilizer ignored the gear rotation.`
      );
      continue;
    }
    const before = robot.facing;
    robot.facing = rotate(robot.facing, gear.rotation === 'clockwise' ? 1 : -1);
    addTrace(
      trace,
      register,
      robot.uid,
      null,
      'gear',
      `${robot.name} rotated ${gear.rotation} from ${before} to ${robot.facing}.`
    );
  }
}

export function resolveBoardElements(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  course: CompiledCourse = defaultCourse
) {
  resolveExpressConveyors(robots, register, trace, cells, optionPlans, course);
  resolveNormalConveyors(robots, register, trace, cells, optionPlans, course);
  resolvePushers(robots, register, trace, cells, optionPlans, course);
  resolveGears(robots, register, trace, cells, optionPlans);
}

export function lockedRegisterNumbersForDamage(damage: number): RegisterNumber[] {
  if (!Number.isInteger(damage) || damage < 0 || damage > 9) {
    throw new Error('Lockable damage must be an integer from zero through nine.');
  }
  const lockedCount = Math.max(0, damage - 4);
  return Array.from(
    { length: lockedCount },
    (_, index) => (5 - index) as RegisterNumber
  ).sort((left, right) => left - right);
}

function synchronizeLockedRegisters(
  robot: RaceRobotPosition,
  programming: ProgrammingState
) {
  const player = programming.players.find(({ uid }) => uid === robot.uid);
  if (robot.status !== 'active') return;
  const expected = lockedRegisterNumbersForDamage(robot.damage);
  robot.lockedRegisters = expected.flatMap((register) => {
    const retained = robot.lockedRegisters.find((locked) => locked.register === register);
    const cardId =
      retained?.cardId ??
      player?.registers[register - 1].cardId ??
      (robot.poweredDown ? programming.drawPile.shift() : undefined);
    return cardId ? [{ register, cardId }] : [];
  });
}

interface LaserHit {
  sourceUid: string | null;
  targetUid: string;
  kind: 'board-laser' | 'robot-laser';
  damage: 1 | 2 | 3;
  direction: Direction;
  pushDirection?: Direction;
  beam?: RobotLaserBeam;
}

interface LaserDamageStep {
  robots: RaceRobotPosition[];
  trace: ResolutionTraceEntry[];
}

interface LaserSnapshotResult {
  laserTrace: ResolutionTraceEntry[];
  laserBeams: RobotLaserBeam[];
  damageSteps: LaserDamageStep[];
  pendingOptionDecision: PendingOptionDecision | null;
  programOverrides?: {
    targetUid: string;
    register: RegisterNumber;
    cardId: ProgramCard['id'];
  }[];
  programCardsConsumed?: number;
}

function cloneRaceRobots(source: readonly RaceRobotPosition[]): RaceRobotPosition[] {
  return source.map((robot) => ({
    ...robot,
    archive: { ...robot.archive },
    options: robot.options.map((option) => ({ ...option })),
    lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
    touchedFlags: [...robot.touchedFlags]
  }));
}

function dealOneDamage(
  robots: RaceRobotPosition[],
  target: RaceRobotPosition,
  register: number,
  trace: ResolutionTraceEntry[],
  programming: ProgrammingState,
  optionDeck?: OptionDeckState,
  cardId: OptionCardId | null = null
) {
  if (cardId && optionDeck && discardOwnedOption(target.options, optionDeck, cardId)) {
    addTrace(
      trace,
      register,
      target.uid,
      null,
      'option-damage-prevented',
      `${target.name} discarded ${cardId.replaceAll('-', ' ')} to prevent one damage.`
    );
    return;
  }
  const ablative = target.options.find(({ cardId }) => cardId === 'ablative-coat');
  if (ablative) {
    const effect = applyOptionEffect('ablative-coat', {
      payloadSpent: ablative.spent
    });
    ablative.spent = effect.payloadSpent ?? ablative.spent;
    addTrace(
      trace,
      register,
      target.uid,
      null,
      'option-damage-prevented',
      `${target.name}'s ablative coat absorbed one damage (${ablative.spent}/3).`
    );
    if (effect.discard) {
      if (optionDeck) {
        discardOwnedOption(target.options, optionDeck, 'ablative-coat');
      } else {
        target.options.splice(target.options.indexOf(ablative), 1);
      }
    }
    return;
  }
  target.damage += 1;
  addTrace(
    trace,
    register,
    target.uid,
    null,
    'damage',
    `${target.name} took one damage and now has ${target.damage}.`
  );
  if (target.damage >= 10) {
    destroyRobot(robots, target, 'damage', register, null, trace);
  } else {
    synchronizeLockedRegisters(target, programming);
  }
}

function resolveOptionDamage(
  robots: RaceRobotPosition[],
  target: RaceRobotPosition,
  register: number,
  trace: ResolutionTraceEntry[],
  programming: ProgrammingState,
  optionDeck: OptionDeckState | undefined,
  optionDecisions: Readonly<Record<string, OptionDecision>>,
  decisionId: string,
  sourceLabel: string
): PendingOptionDecision | null {
  if (target.options.some(({ cardId }) => cardId === 'ablative-coat')) {
    dealOneDamage(robots, target, register, trace, programming, optionDeck);
    return null;
  }
  const choice = optionDecisions[decisionId];
  const eligibleCardIds = target.options.map(({ cardId }) => cardId);
  const validChoice =
    choice?.uid === target.uid &&
    (choice.choiceId === 'take-damage' ||
      (choice.choiceId.startsWith('discard:') &&
        eligibleCardIds.includes(choice.choiceId.slice('discard:'.length) as OptionCardId)));
  if (eligibleCardIds.length > 0 && !validChoice) {
    addTrace(
      trace,
      register,
      target.uid,
      null,
      'damage-choice-required',
      `${target.name} must choose whether to take damage or discard an Option from ${sourceLabel}.`
    );
    return {
      decisionId,
      uid: target.uid,
      cardId: null,
      timing: 'damage',
      register: register as RegisterNumber,
      heading: `${sourceLabel} incoming`,
      prompt: 'Choose now: discard one Option, or take the damage.',
      tabletopPrompt: `Check your controller: ${sourceLabel.toLowerCase()}`,
      choices: [
        ...eligibleCardIds.map((cardId) => ({
          id: `discard:${cardId}`,
          label: `Discard ${OPTION_CARDS_BY_ID.get(cardId)?.name ?? cardId.replaceAll('-', ' ')} to prevent this damage`,
          description: 'Destroy this Option to prevent one damage.',
          cardId
        })),
        {
          id: 'take-damage',
          label: 'Take this damage',
          description: 'Keep every Option and receive one damage.'
        }
      ]
    };
  }
  const selectedCardId =
    validChoice &&
    choice.choiceId.startsWith('discard:') &&
    eligibleCardIds.includes(choice.choiceId.slice('discard:'.length) as OptionCardId)
      ? (choice.choiceId.slice('discard:'.length) as OptionCardId)
      : null;
  if (choice?.choiceId === 'take-damage') {
    addTrace(
      trace,
      register,
      target.uid,
      null,
      'damage-choice-resolved',
      `${target.name} chose not to discard an Option from ${sourceLabel}.`
    );
  }
  dealOneDamage(robots, target, register, trace, programming, optionDeck, selectedCardId);
  return null;
}

export function resolveLaserSnapshot(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  programming: ProgrammingState,
  cells: readonly BoardCell[] = defaultCourseCells,
  optionDeck?: OptionDeckState,
  optionDecisions: Readonly<Record<string, OptionDecision>> = {},
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  course: CompiledCourse = defaultCourse,
  availableProgramDrawPile: readonly ProgramCard['id'][] = programming.drawPile
): LaserSnapshotResult {
  const activeSnapshot = cloneRaceRobots(
    robots.filter(({ status }) => status === 'active')
  );
  const hits: LaserHit[] = [];
  const weaponBeams: RobotLaserBeam[] = [];
  const weaponProgramOverrides: NonNullable<LaserSnapshotResult['programOverrides']> = [];
  let programCardsConsumed = 0;
  const traceStart = trace.length;
  const firstRobotInLaserPath = (
    shooter: RaceRobotPosition,
    direction: Direction
  ) => {
    const [dx, dy] = steps[direction];
    let cursorX = shooter.x;
    let cursorY = shooter.y;
    while (courseContains(cursorX, cursorY, course)) {
      if (movementBlockedByWall(cursorX, cursorY, direction, course)) return null;
      cursorX += dx;
      cursorY += dy;
      if (!courseContains(cursorX, cursorY, course)) return null;
      const target = activeRobotAt(activeSnapshot, cursorX, cursorY, shooter.uid);
      if (target) return target;
    }
    return null;
  };

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'scrambler')
  )) {
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    if (!target || register >= 5 || !availableProgramDrawPile[0]) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-scrambler`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether Scrambler replaces ${target.name}'s next Program.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'scrambler',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Scrambler?',
          prompt: `Replace ${target.name}'s register ${register + 1} with the top Program card?`,
          tabletopPrompt: 'Use Scrambler on the next register',
          choices: [
            {
              id: 'use',
              label: 'Scramble next register',
              description: 'Replace the target’s next Program with the top deck card.',
              cardId: 'scrambler'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'Fire the main laser normally.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} armed scrambler against ${target.name}.`
        : `${shooter.name} left scrambler inactive.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'radio-control')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use'
    ) {
      continue;
    }
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    if (!target || register >= 5) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-radio-control`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether Radio Control copies its remaining Program to ${target.name}.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'radio-control',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Radio Control?',
          prompt: `Replace ${target.name}'s remaining registers with your Program?`,
          tabletopPrompt: 'Use Radio Control for the remaining Program',
          choices: [
            {
              id: 'use',
              label: 'Transmit remaining Program',
              description: 'Replace the target’s later registers with your later registers.',
              cardId: 'radio-control'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'Fire the main laser normally.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} armed radio control against ${target.name}.`
        : `${shooter.name} left radio control inactive.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'fire-control')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
        ?.choiceId === 'use'
    ) {
      continue;
    }
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    if (!target) continue;
    const targetProgram = programming.players.find(({ uid }) => uid === target.uid);
    const lockChoices = targetProgram?.registers.flatMap((candidate, index) =>
      candidate.cardId &&
      !target.lockedRegisters.some(({ register }) => register === index + 1)
        ? [
            {
              id: `lock:${index + 1}`,
              label: `Lock register ${index + 1}`,
              description: `Lock ${target.name}'s register ${index + 1} instead of damage.`,
              cardId: 'fire-control' as const
            }
          ]
        : []
    ) ?? [];
    const destroyChoices = target.options.map(({ cardId }) => ({
      id: `destroy:${cardId}`,
      label: `Destroy ${OPTION_CARDS_BY_ID.get(cardId)?.name ?? cardId}`,
      description: `Destroy ${target.name}'s named Option instead of damage.`,
      cardId: 'fire-control' as const
    }));
    if (lockChoices.length === 0 && destroyChoices.length === 0) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-fire-control`;
    const decision = optionDecisions[decisionId];
    const choiceIds = new Set([
      'decline',
      ...lockChoices.map(({ id }) => id),
      ...destroyChoices.map(({ id }) => id)
    ]);
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !choiceIds.has(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide how Fire Control affects ${target.name}.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'fire-control',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Fire Control?',
          prompt: `Replace the main-laser damage to ${target.name}?`,
          tabletopPrompt: 'Choose Fire Control effect for this hit',
          choices: [
            ...lockChoices,
            ...destroyChoices,
            {
              id: 'decline',
              label: 'Deal normal damage',
              description: 'Do not use Fire Control for this hit.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'decline'
        ? `${shooter.name} left fire control inactive.`
        : `${shooter.name} armed fire control against ${target.name}.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'mini-howitzer')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
        ?.choiceId === 'use' ||
      (optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
        ?.choiceId !== undefined &&
      optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
        ?.choiceId !== 'decline')
    ) {
      continue;
    }
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    if (!target) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-mini-howitzer`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether to replace its main laser with Mini Howitzer.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'mini-howitzer',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Mini Howitzer?',
          prompt: `Deal one damage to ${target.name} and push it one space away?`,
          tabletopPrompt: 'Use Mini Howitzer for this register',
          choices: [
            {
              id: 'use',
              label: 'Fire Mini Howitzer',
              description: 'Spend one shot to deal one damage and push one space away.',
              cardId: 'mini-howitzer'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'Fire the main laser normally.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} armed mini howitzer against ${target.name}.`
        : `${shooter.name} left mini howitzer inactive.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'tractor-beam')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-mini-howitzer`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
        ?.choiceId === 'use' ||
      (optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
        ?.choiceId !== undefined &&
        optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
          ?.choiceId !== 'decline')
    ) {
      continue;
    }
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    const range = target
      ? Math.abs(target.x - shooter.x) + Math.abs(target.y - shooter.y)
      : 0;
    if (!target || range <= 1) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-tractor-beam`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether to replace its main laser with Tractor Beam.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'tractor-beam',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Tractor Beam?',
          prompt: `Pull ${target.name} one space closer instead of firing the main laser?`,
          tabletopPrompt: 'Use Tractor Beam for this register',
          choices: [
            {
              id: 'use',
              label: 'Pull with Tractor Beam',
              description: 'Replace the main laser with a one-space pull closer.',
              cardId: 'tractor-beam'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'Fire the main laser normally.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} armed tractor beam against ${target.name}.`
        : `${shooter.name} left tractor beam inactive.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'pressor-beam')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-tractor-beam`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-mini-howitzer`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
        ?.choiceId === 'use' ||
      (optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
        ?.choiceId !== undefined &&
        optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
          ?.choiceId !== 'decline')
    ) {
      continue;
    }
    const target = firstRobotInLaserPath(shooter, shooter.facing);
    if (!target) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-pressor-beam`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether to replace its main laser with Pressor Beam.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'pressor-beam',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use Pressor Beam?',
          prompt: `Push ${target.name} one space away instead of firing the main laser?`,
          tabletopPrompt: 'Use Pressor Beam for this register',
          choices: [
            {
              id: 'use',
              label: 'Push with Pressor Beam',
              description: 'Replace the main laser with a one-space push away.',
              cardId: 'pressor-beam'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'Fire the main laser normally.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} armed pressor beam against ${target.name}.`
        : `${shooter.name} left pressor beam inactive.`
    );
  }

  for (const shooter of activeSnapshot.filter(
    ({ poweredDown, options }) =>
      !poweredDown && options.some(({ cardId }) => cardId === 'high-power-laser')
  )) {
    if (
      optionDecisions[`r${register}-laser-${shooter.uid}-pressor-beam`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-tractor-beam`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-mini-howitzer`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
        ?.choiceId === 'use' ||
      optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
        ?.choiceId === 'use' ||
      (optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
        ?.choiceId !== undefined &&
        optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
          ?.choiceId !== 'decline')
    ) {
      continue;
    }
    const [dx, dy] = steps[shooter.facing];
    let cursorX = shooter.x;
    let cursorY = shooter.y;
    let obstruction = false;
    while (courseContains(cursorX, cursorY, course)) {
      if (movementBlockedByWall(cursorX, cursorY, shooter.facing, course)) {
        obstruction = true;
        break;
      }
      cursorX += dx;
      cursorY += dy;
      if (!courseContains(cursorX, cursorY, course)) break;
      if (activeRobotAt(activeSnapshot, cursorX, cursorY, shooter.uid)) {
        obstruction = true;
        break;
      }
    }
    if (!obstruction) continue;
    const decisionId = `r${register}-laser-${shooter.uid}-high-power-laser`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== shooter.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        register,
        shooter.uid,
        null,
        'option-decision-required',
        `${shooter.name} must decide whether its main laser passes one obstruction.`
      );
      return {
        laserTrace: trace.slice(traceStart),
        laserBeams: [],
        damageSteps: [],
        pendingOptionDecision: {
          decisionId,
          uid: shooter.uid,
          cardId: 'high-power-laser',
          timing: 'robot-lasers',
          register: register as RegisterNumber,
          heading: 'Use High-Power Laser?',
          prompt: 'Let the main laser pass through the first wall or robot in its path?',
          tabletopPrompt: 'Use High-Power Laser for this register',
          choices: [
            {
              id: 'use',
              label: 'Pass the obstruction',
              description: 'The main laser passes one wall or robot; a passed robot is hit.',
              cardId: 'high-power-laser'
            },
            {
              id: 'decline',
              label: 'Fire normally',
              description: 'The main laser stops at the first wall or robot.'
            }
          ]
        }
      };
    }
    addTrace(
      trace,
      register,
      shooter.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${shooter.name} used high-power laser to pass one obstruction.`
        : `${shooter.name} fired its main laser normally.`
    );
  }

  const laserSegments = cells.flatMap((cell) =>
    cell.elements
      .filter(
        (element): element is Extract<BoardElement, { kind: 'laser' }> =>
          element.kind === 'laser'
      )
      .map((laser) => ({ cell, laser }))
  );
  const segmentAt = (
    x: number,
    y: number,
    direction: Direction,
    beamCount: 1 | 2 | 3
  ) =>
    laserSegments.find(
      ({ cell, laser }) =>
        cell.x === x &&
        cell.y === y &&
        laser.direction === direction &&
        laser.beamCount === beamCount
    );
  const laserSources = laserSegments.filter(({ cell, laser }) => {
    const [dx, dy] = steps[laser.direction];
    return !segmentAt(cell.x - dx, cell.y - dy, laser.direction, laser.beamCount);
  });
  for (const { cell, laser } of laserSources) {
    const [dx, dy] = steps[laser.direction];
    let cursorX = cell.x;
    let cursorY = cell.y;
    while (segmentAt(cursorX, cursorY, laser.direction, laser.beamCount)) {
      const target = activeRobotAt(activeSnapshot, cursorX, cursorY);
      if (target) {
        hits.push({
          sourceUid: null,
          targetUid: target.uid,
          kind: 'board-laser',
          damage: laser.beamCount,
          direction: laser.direction
        });
        break;
      }
      if (movementBlockedByWall(cursorX, cursorY, laser.direction, course)) break;
      cursorX += dx;
      cursorY += dy;
    }
  }

  for (const shooter of activeSnapshot.filter(({ poweredDown }) => !poweredDown)) {
    const directions = [
      shooter.facing,
      ...(shooter.options.some(({ cardId }) => cardId === 'rear-laser')
        ? [opposite[shooter.facing]]
        : [])
    ];
    for (const firingDirection of directions) {
      if (
        firingDirection === shooter.facing &&
        optionDecisions[`r${register}-laser-${shooter.uid}-scrambler`]
          ?.choiceId === 'use'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        const replacementCardId = availableProgramDrawPile[programCardsConsumed];
        if (snapshotTarget && target?.status === 'active' && replacementCardId) {
          weaponBeams.push({
            id: `r${register}-${shooter.uid}-${target.uid}-scrambler`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: snapshotTarget.x,
            toY: snapshotTarget.y,
            beamCount: 1
          });
          weaponProgramOverrides.push({
            targetUid: target.uid,
            register: (register + 1) as RegisterNumber,
            cardId: replacementCardId
          });
          programCardsConsumed += 1;
          addTrace(
            trace,
            register,
            shooter.uid,
            null,
            'option-effect',
            `${shooter.name}'s scrambler replaced ${target.name}'s register ` +
              `${register + 1} with ${replacementCardId}.`
          );
        }
        continue;
      }
      if (
        firingDirection === shooter.facing &&
        optionDecisions[`r${register}-laser-${shooter.uid}-radio-control`]
          ?.choiceId === 'use'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        if (snapshotTarget && target?.status === 'active') {
          weaponBeams.push({
            id: `r${register}-${shooter.uid}-${target.uid}-radio-control`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: snapshotTarget.x,
            toY: snapshotTarget.y,
            beamCount: 1
          });
          const shooterProgram = programming.players.find(
            ({ uid }) => uid === shooter.uid
          );
          for (let later = register + 1; later <= 5; later += 1) {
            const cardId = shooterProgram?.registers[later - 1]?.cardId;
            if (cardId) {
              weaponProgramOverrides.push({
                targetUid: target.uid,
                register: later as RegisterNumber,
                cardId
              });
            }
          }
          addTrace(
            trace,
            register,
            shooter.uid,
            null,
            'option-effect',
            `${shooter.name}'s radio control copied registers ${register + 1}-5 to ${target.name}.`
          );
        }
        continue;
      }
      const fireControlChoice =
        optionDecisions[`r${register}-laser-${shooter.uid}-fire-control`]
          ?.choiceId;
      if (
        firingDirection === shooter.facing &&
        fireControlChoice &&
        fireControlChoice !== 'decline'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        if (snapshotTarget && target?.status === 'active') {
          weaponBeams.push({
            id: `r${register}-${shooter.uid}-${target.uid}-fire-control`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: snapshotTarget.x,
            toY: snapshotTarget.y,
            beamCount: 1
          });
          if (fireControlChoice.startsWith('lock:')) {
            const lockedRegister = Number(fireControlChoice.slice('lock:'.length)) as RegisterNumber;
            const cardId = programming.players
              .find(({ uid }) => uid === target.uid)
              ?.registers[lockedRegister - 1]?.cardId;
            if (
              cardId &&
              !target.lockedRegisters.some(({ register: existing }) =>
                existing === lockedRegister
              )
            ) {
              target.lockedRegisters.push({ register: lockedRegister, cardId });
              target.lockedRegisters.sort((left, right) => left.register - right.register);
            }
            addTrace(
              trace,
              register,
              shooter.uid,
              null,
              'option-effect',
              `${shooter.name}'s fire control locked ${target.name}'s register ${lockedRegister}.`
            );
          } else if (fireControlChoice.startsWith('destroy:')) {
            const cardId = fireControlChoice.slice('destroy:'.length) as OptionCardId;
            if (optionDeck) {
              discardOwnedOption(target.options, optionDeck, cardId);
            } else {
              const owned = target.options.find((option) => option.cardId === cardId);
              if (owned) target.options.splice(target.options.indexOf(owned), 1);
            }
            addTrace(
              trace,
              register,
              shooter.uid,
              null,
              'option-effect',
              `${shooter.name}'s fire control destroyed ${target.name}'s ` +
                `${OPTION_CARDS_BY_ID.get(cardId)?.name ?? cardId}.`
            );
          }
        }
        continue;
      }
      if (
        firingDirection === shooter.facing &&
        optionDecisions[`r${register}-laser-${shooter.uid}-mini-howitzer`]
          ?.choiceId === 'use'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        const actualShooter = robots.find(({ uid }) => uid === shooter.uid);
        const howitzer = actualShooter?.options.find(
          ({ cardId }) => cardId === 'mini-howitzer'
        );
        if (snapshotTarget && target?.status === 'active' && actualShooter && howitzer) {
          howitzer.spent += 1;
          addTrace(
            trace,
            register,
            shooter.uid,
            null,
            'option-effect',
            `${shooter.name}'s mini howitzer hit ${target.name} ` +
              `(shot ${howitzer.spent} of 5).`
          );
          hits.push({
            sourceUid: shooter.uid,
            targetUid: target.uid,
            kind: 'robot-laser',
            damage: 1,
            direction: firingDirection,
            pushDirection: firingDirection,
            beam: {
              id: `r${register}-${shooter.uid}-${target.uid}-mini-howitzer`,
              sourceUid: shooter.uid,
              targetUid: target.uid,
              fromX: shooter.x,
              fromY: shooter.y,
              toX: snapshotTarget.x,
              toY: snapshotTarget.y,
              beamCount: 1
            }
          });
          if (howitzer.spent >= 5) {
            if (optionDeck) {
              discardOwnedOption(actualShooter.options, optionDeck, 'mini-howitzer');
            } else {
              actualShooter.options.splice(actualShooter.options.indexOf(howitzer), 1);
            }
            addTrace(
              trace,
              register,
              shooter.uid,
              null,
              'option-effect',
              `${shooter.name}'s mini howitzer expended its fifth shot and was discarded.`
            );
          }
        }
        continue;
      }
      if (
        firingDirection === shooter.facing &&
        optionDecisions[`r${register}-laser-${shooter.uid}-tractor-beam`]
          ?.choiceId === 'use'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        if (snapshotTarget && target?.status === 'active') {
          weaponBeams.push({
            id: `r${register}-${shooter.uid}-${target.uid}-tractor-beam`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: snapshotTarget.x,
            toY: snapshotTarget.y,
            beamCount: 1
          });
          const pullDirection = opposite[firingDirection];
          addTrace(
            trace,
            register,
            shooter.uid,
            null,
            'option-effect',
            `${shooter.name}'s tractor beam pulled ${target.name} one space ${pullDirection}.`
          );
          translateOneCell(
            robots,
            target,
            pullDirection,
            1,
            register,
            null,
            trace,
            'weapon',
            course
          );
        }
        continue;
      }
      if (
        firingDirection === shooter.facing &&
        optionDecisions[`r${register}-laser-${shooter.uid}-pressor-beam`]
          ?.choiceId === 'use'
      ) {
        const snapshotTarget = firstRobotInLaserPath(shooter, firingDirection);
        const target = snapshotTarget
          ? robots.find(({ uid }) => uid === snapshotTarget.uid)
          : undefined;
        if (snapshotTarget && target?.status === 'active') {
          weaponBeams.push({
            id: `r${register}-${shooter.uid}-${target.uid}-pressor-beam`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: snapshotTarget.x,
            toY: snapshotTarget.y,
            beamCount: 1
          });
          addTrace(
            trace,
            register,
            shooter.uid,
            null,
            'option-effect',
            `${shooter.name}'s pressor beam pushed ${target.name} one space ${firingDirection}.`
          );
          translateOneCell(
            robots,
            target,
            firingDirection,
            1,
            register,
            null,
            trace,
            'weapon',
            course
          );
        }
        continue;
      }
      let cursorX = shooter.x;
      let cursorY = shooter.y;
      const [dx, dy] = steps[firingDirection];
      let passBudget =
        shooter.options.some(({ cardId }) => cardId === 'high-power-laser') &&
        optionDecisions[`r${register}-laser-${shooter.uid}-high-power-laser`]
          ?.choiceId === 'use'
          ? 1
          : 0;
      const beamDamage = shooter.options.some(
        ({ cardId }) => cardId === 'double-barrel-laser'
      )
        ? 2
        : 1;
      while (courseContains(cursorX, cursorY, course)) {
        if (movementBlockedByWall(cursorX, cursorY, firingDirection, course)) {
          if (passBudget === 0) break;
          passBudget -= 1;
        }
        cursorX += dx;
        cursorY += dy;
        if (!courseContains(cursorX, cursorY, course)) break;
        const target = activeRobotAt(activeSnapshot, cursorX, cursorY, shooter.uid);
        if (!target) continue;
        hits.push({
          sourceUid: shooter.uid,
          targetUid: target.uid,
          kind: 'robot-laser',
          damage: beamDamage,
          direction: firingDirection,
          beam: {
            id: `r${register}-${shooter.uid}-${target.uid}-${firingDirection}`,
            sourceUid: shooter.uid,
            targetUid: target.uid,
            fromX: shooter.x,
            fromY: shooter.y,
            toX: target.x,
            toY: target.y,
            beamCount: beamDamage
          }
        });
        if (passBudget === 0) break;
        passBudget -= 1;
      }
    }
  }

  const orderedHits = hits
    .map((hit, index) => ({ hit, index }))
    .sort((left, right) => {
      const leftDock = robots.findIndex(({ uid }) => uid === left.hit.targetUid);
      const rightDock = robots.findIndex(({ uid }) => uid === right.hit.targetUid);
      return leftDock - rightDock || left.index - right.index;
    })
    .map(({ hit }) => hit);
  for (const hit of orderedHits) {
    const target = robots.find(({ uid }) => uid === hit.targetUid);
    if (!target || target.status !== 'active') continue;
    const shooter = hit.sourceUid
      ? robots.find(({ uid }) => uid === hit.sourceUid)
      : undefined;
    for (let beam = 0; beam < hit.damage; beam += 1) {
      addTrace(
        trace,
        register,
        hit.sourceUid ?? target.uid,
        null,
        hit.kind,
        hit.kind === 'board-laser'
          ? `A board laser hit ${target.name} at (${target.x},${target.y}).`
          : `${shooter?.name ?? 'A robot'} fired through clear line of sight and hit ${target.name}.`
      );
    }
  }
  const laserTrace = trace.slice(traceStart);
  const damageSteps: LaserDamageStep[] = [];
  const shieldedDirectionsByUid = new Map<string, Set<Direction>>();
  let damageOrdinal = 0;
  for (const hit of orderedHits) {
    const target = robots.find(({ uid }) => uid === hit.targetUid);
    if (!target || target.status !== 'active') continue;
    for (let point = 1; point <= hit.damage; point += 1) {
      if (target.status !== 'active') break;
      damageOrdinal += 1;
      const decisionId = `r${register}-damage-${String(damageOrdinal).padStart(2, '0')}-${target.uid}`;
      const shieldedDirections = shieldedDirectionsByUid.get(target.uid) ?? new Set();
      if (
        target.poweredDown &&
        target.options.some(({ cardId }) => cardId === 'power-down-shield') &&
        !shieldedDirections.has(hit.direction)
      ) {
        shieldedDirections.add(hit.direction);
        shieldedDirectionsByUid.set(target.uid, shieldedDirections);
        const damageTraceStart = trace.length;
        addTrace(
          trace,
          register,
          target.uid,
          null,
          'option-damage-prevented',
          `${target.name}'s power-down shield prevented one damage arriving from the ${opposite[hit.direction]}.`
        );
        damageSteps.push({
          robots: cloneRaceRobots(robots),
          trace: trace.slice(damageTraceStart)
        });
        continue;
      }
      const damageTraceStart = trace.length;
      const pendingOptionDecision = resolveOptionDamage(
        robots,
        target,
        register,
        trace,
        programming,
        optionDeck,
        optionDecisions,
        decisionId,
        `Laser damage ${point} of ${hit.damage}`
      );
      if (pendingOptionDecision) {
        damageSteps.push({
          robots: cloneRaceRobots(robots),
          trace: trace.slice(damageTraceStart)
        });
        return {
          laserTrace,
          laserBeams: [
            ...weaponBeams,
            ...orderedHits.flatMap(({ beam }) => (beam ? [beam] : []))
          ],
          damageSteps,
          pendingOptionDecision
        };
      }
      damageSteps.push({
        robots: cloneRaceRobots(robots),
        trace: trace.slice(damageTraceStart)
      });
    }
    if (hit.pushDirection && target.status === 'active') {
      const pushTraceStart = trace.length;
      translateOneCell(
        robots,
        target,
        hit.pushDirection,
        1,
        register,
        null,
        trace,
        'weapon',
        course
      );
      damageSteps.push({
        robots: cloneRaceRobots(robots),
        trace: trace.slice(pushTraceStart)
      });
    }
  }
  return {
    laserTrace,
    laserBeams: [
      ...weaponBeams,
      ...orderedHits.flatMap(({ beam }) => (beam ? [beam] : []))
    ],
    damageSteps,
    pendingOptionDecision: null,
    programOverrides: weaponProgramOverrides,
    programCardsConsumed
  };
}

export function resolveFlagsAndArchives(
  robots: RaceRobotPosition[],
  register: number,
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  flags: readonly { number: number; x: number; y: number }[] = defaultCourse.course.flags,
  course: CompiledCourse = defaultCourse,
  rules: ScenarioResolutionRules = scenarioResolutionRules(course.course),
  optionDeck?: OptionDeckState
): string[] {
  const finishers: string[] = [];
  for (const robot of robots) {
    if (robot.status !== 'active') continue;
    const flag =
      flags.find(({ x, y }) => x === robot.x && y === robot.y) ??
      (robot.options.some(({ cardId }) => cardId === 'mechanical-arm')
        ? flags.find(({ x, y }) => {
            const dx = x - robot.x;
            const dy = y - robot.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
            if (dx === 0) {
              return !movementBlockedByWall(
                robot.x,
                robot.y,
                dy < 0 ? 'north' : 'south',
                course
              );
            }
            if (dy === 0) {
              return !movementBlockedByWall(
                robot.x,
                robot.y,
                dx < 0 ? 'west' : 'east',
                course
              );
            }
            const horizontal = dx < 0 ? 'west' : 'east';
            const vertical = dy < 0 ? 'north' : 'south';
            return (
              (!movementBlockedByWall(robot.x, robot.y, horizontal, course) &&
                !movementBlockedByWall(robot.x + dx, robot.y, vertical, course)) ||
              (!movementBlockedByWall(robot.x, robot.y, vertical, course) &&
                !movementBlockedByWall(robot.x, robot.y + dy, horizontal, course))
            );
          })
        : undefined);
    const repair = elementAt(cells, robot.x, robot.y, 'repair') as
      | Extract<BoardElement, { kind: 'repair' }>
      | undefined;
    if (flag || repair) {
      robot.archive = { x: robot.x, y: robot.y };
      addTrace(
        trace,
        register,
        robot.uid,
        null,
        'archive-updated',
        `${robot.name} moved its Archive marker to (${robot.x},${robot.y}).`
      );
    }
    if (!flag || flag.number !== robot.nextFlag) continue;
    robot.touchedFlags.push(flag.number);
    const finalFlag = Math.max(...flags.map(({ number }) => number));
    robot.nextFlag = flag.number === finalFlag ? null : flag.number + 1;
    addTrace(
      trace,
      register,
      robot.uid,
      null,
      'flag-touched',
      `${robot.name} touched Flag ${flag.number} in order${
        robot.nextFlag ? `; Flag ${robot.nextFlag} is next` : ''
      }.`
    );
    if (robot.nextFlag === null) finishers.push(robot.uid);
    for (let draw = 0; draw < rules.flag.awardOptions; draw += 1) {
      const option = optionDeck ? drawOption(optionDeck) : null;
      if (!option) continue;
      robot.options.push(option);
      addTrace(
        trace,
        register,
        robot.uid,
        null,
        'option-drawn',
        `${robot.name} drew ${option.cardId.replaceAll('-', ' ')} for touching Flag ${flag.number}.`
      );
    }
  }
  return finishers;
}

export function resolveRepairCleanup(
  robots: RaceRobotPosition[],
  trace: ResolutionTraceEntry[],
  cells: readonly BoardCell[] = defaultCourseCells,
  optionDeck?: OptionDeckState,
  powerDownAllowed = true,
  course: CompiledCourse = defaultCourse,
  rules: ScenarioResolutionRules = scenarioResolutionRules(course.course)
) {
  for (const robot of robots) {
    if (robot.status !== 'active') continue;
    const repair = elementAt(cells, robot.x, robot.y, 'repair') as
      | Extract<BoardElement, { kind: 'repair' }>
      | undefined;
    if (!repair) continue;
    if (!rules.repair.awardOptions) {
      const priorDamage = robot.damage;
      robot.damage = Math.max(0, robot.damage - 1);
      addTrace(
        trace,
        6,
        robot.uid,
        null,
        'repair',
        `${robot.name} repaired from ${priorDamage} to ${robot.damage} damage at ` +
          `(${robot.x},${robot.y}).`
      );
      const retainedRegisters = new Set(lockedRegisterNumbersForDamage(robot.damage));
      const unlocked = robot.lockedRegisters.filter(
        ({ register }) => !retainedRegisters.has(register)
      );
      robot.lockedRegisters = robot.lockedRegisters.filter(({ register }) =>
        retainedRegisters.has(register)
      );
      for (const { register, cardId } of unlocked) {
        addTrace(
          trace,
          6,
          robot.uid,
          null,
          'register-unlocked',
          `${robot.name} unlocked register ${register} and discarded ${cardId}.`
        );
      }
    }
    const optionDraws = rules.repair.awardOptions
      ? (repair.option ? rules.repair.crossedOptions : rules.repair.singleOptions)
      : repair.option
        ? 1
        : 0;
    for (let draw = 0; draw < optionDraws; draw += 1) {
      robot.pendingOptionDraws += 1;
      const option = optionDeck ? drawOption(optionDeck) : null;
      if (option) {
        robot.options.push(option);
        robot.pendingOptionDraws -= 1;
        addTrace(
          trace,
          6,
          robot.uid,
          null,
          'option-drawn',
          `${robot.name} drew ${option.cardId.replaceAll('-', ' ')} face up.`
        );
      }
    }
  }
  for (const robot of robots) {
    if (
      powerDownAllowed &&
      robot.status === 'active' &&
      robot.options.some(({ cardId }) => cardId === 'circuit-breaker') &&
      applyOptionEffect('circuit-breaker', { damage: robot.damage }).forcePowerDown
    ) {
      robot.powerDownNextTurn = true;
      addTrace(
        trace,
        6,
        robot.uid,
        null,
        'option-effect',
        `${robot.name}'s circuit breaker forced power down next turn.`
      );
    }
  }
}

export function createRaceSummary(
  robots: readonly RaceRobotPosition[],
  winnerUids: readonly string[],
  runnersUpUids: readonly string[]
): RaceSummary {
  return Object.freeze({
    winnerUids: Object.freeze([...winnerUids]),
    runnersUpUids: Object.freeze([...runnersUpUids]),
    standings: Object.freeze(
      robots.map((robot) =>
        Object.freeze({
          uid: robot.uid,
          touchedFlags: Object.freeze([...robot.touchedFlags]),
          lives: robot.lives,
          damage: robot.damage,
          status: robot.status
        })
      )
    )
  });
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

function nextOptionLossRobot(robots: readonly RaceRobotPosition[]) {
  return [...robots]
    .filter(({ optionLossPending }) => optionLossPending)
    .sort(
      (left, right) =>
        (left.destructionOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.destructionOrder ?? Number.MAX_SAFE_INTEGER)
    )[0];
}

function updateResolutionPhase(resolution: ProgramResolution) {
  if (resolution.winnerUids.length > 0) {
    resolution.nextReentryUid = null;
    resolution.phase = 'race-finished';
    return;
  }
  const optionLoss = nextOptionLossRobot(resolution.robots);
  resolution.nextOptionChoiceUid = optionLoss?.uid ?? null;
  if (optionLoss) {
    resolution.nextReentryUid = null;
    resolution.phase = 'awaiting-option';
    return;
  }
  resolution.nextOptionChoiceUid = null;
  const next = nextDestroyedRobot(resolution.robots);
  resolution.nextReentryUid = next?.uid ?? null;
  resolution.phase = next ? 'awaiting-reentry' : 'turn-complete';
}

function hasRobotInLineOfSight(
  robots: readonly RaceRobotPosition[],
  x: number,
  y: number,
  facing: Direction,
  course: CompiledCourse = defaultCourse
) {
  let cursorX = x;
  let cursorY = y;
  const [dx, dy] = steps[facing];
  for (let distance = 1; distance <= 3; distance += 1) {
    if (movementBlockedByWall(cursorX, cursorY, facing, course)) return false;
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
  const course = resolutionCourse(resolution);
  const archiveOpen =
    !activeRobotAt(resolution.robots, robot.archive.x, robot.archive.y) &&
    !courseHasPit(robot.archive.x, robot.archive.y, course);
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
        courseContains(x, y, course) &&
        !courseHasPit(x, y, course) &&
        !activeRobotAt(resolution.robots, x, y)
    )
    .flatMap(({ x, y }) =>
      directionOrder
        .filter(
          (facing) =>
            archiveOpen || !hasRobotInLineOfSight(resolution.robots, x, y, facing, course)
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
      archive: { ...robot.archive },
      options: robot.options.map((option) => ({ ...option })),
      lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
      touchedFlags: [...robot.touchedFlags]
    })),
    trace: [...current.trace],
    optionDeck: cloneOptionDeck(current.optionDeck)
  };
  const legal = legalReentryChoices(resolution, uid);
  if (!legal.some(({ x, y, facing }) => x === choice.x && y === choice.y && facing === choice.facing)) {
    return current;
  }
  const robot = resolution.robots.find((candidate) => candidate.uid === uid)!;
  robot.x = choice.x;
  robot.y = choice.y;
  robot.facing = choice.facing;
  const reentryDamage = robot.superiorArchivePending ? 0 : 2;
  robot.damage += reentryDamage;
  robot.superiorArchivePending = false;
  robot.powerDownNextTurn = Boolean(choice.poweredDown && robot.powerDownNextTurn);
  robot.poweredDown = false;
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

export function applyOptionLossChoice(
  current: ProgramResolution,
  uid: string,
  cardId: OptionCardId
): ProgramResolution {
  if (current.nextOptionChoiceUid !== uid) return current;
  const resolution: ProgramResolution = {
    ...current,
    robots: current.robots.map((robot) => ({
      ...robot,
      archive: { ...robot.archive },
      options: robot.options.map((option) => ({ ...option })),
      lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
      touchedFlags: [...robot.touchedFlags]
    })),
    trace: [...current.trace],
    optionDeck: cloneOptionDeck(current.optionDeck)
  };
  const robot = resolution.robots.find((candidate) => candidate.uid === uid);
  if (
    !robot ||
    !robot.optionLossPending ||
    !discardOwnedOption(robot.options, resolution.optionDeck, cardId)
  ) {
    return current;
  }
  robot.optionLossPending = false;
  addTrace(
    resolution.trace,
    6,
    uid,
    null,
    'option-loss',
    `${robot.name} discarded ${cardId.replaceAll('-', ' ')} after being destroyed.`
  );
  updateResolutionPhase(resolution);
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
    damage: setup.startingDamage,
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
    superiorArchivePending: false
  }));
}

export function beginNextTurnPowerDowns(
  current: readonly RaceRobotPosition[]
): RaceRobotPosition[] {
  return current.map((robot) => {
    const next = {
      ...robot,
      archive: { ...robot.archive },
      options: robot.options.map((option) => ({ ...option })),
      lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
      touchedFlags: [...robot.touchedFlags]
    };
    if (next.status !== 'active') return next;
    if (next.powerDownNextTurn) {
      next.poweredDown = true;
      next.powerDownNextTurn = false;
      next.damage = 0;
      next.lockedRegisters = [];
    } else {
      next.poweredDown = false;
    }
    return next;
  });
}

export function resolveProgrammedTurn(
  programming: ProgrammingState,
  setup: RaceSetup,
  initialRobots = createRaceRobotPositions(setup),
  initialOptionDeck?: OptionDeckState,
  optionPlans: Readonly<Record<string, OptionTurnPlan>> = {},
  optionDecisions: Readonly<Record<string, OptionDecision>> = {}
): ProgramResolution | null {
  if (programming.phase !== 'programmed') return null;
  const course = compilePlayableCourse(setup.courseId);
  const scenarioRules = scenarioResolutionRules(course.course);
  const courseCells: BoardCell[] = [...course.cells.values()];
  const flags = course.course.flags;
  const robots = initialRobots.map((robot) => ({
    ...robot,
    archive: { ...robot.archive },
    options: robot.options.map((option) => ({ ...option })),
    lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
    touchedFlags: [...robot.touchedFlags]
  }));
  const optionDeck = cloneOptionDeck(
    initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
  );
  const trace: ResolutionTraceEntry[] = [];
  const playback: ProgramPlayback = {
    initialRobots: cloneRaceRobots(robots),
    frames: []
  };
  const cards = new Map(PROGRAM_CARDS.map((card) => [card.id, card]));
  const programOverrides = new Map<string, ProgramCard['id']>();
  const resolutionProgramDrawPile = [...programming.drawPile];
  const effectiveOptionPlans: Record<string, OptionTurnPlan> = Object.fromEntries(
    robots.map(({ uid }) => [
      uid,
      {
        kind: 'option-plan' as const,
        activations: optionPlanFor(optionPlans, uid).activations.filter(
          ({ cardId }) => cardId !== 'gyroscopic-stabilizer'
        )
      }
    ])
  );

  for (const robot of robots.filter(
    ({ status, options }) =>
      status === 'active' &&
      options.some(({ cardId }) => cardId === 'gyroscopic-stabilizer')
  )) {
    const decisionId = `turn-${programming.turnNumber}-gyroscopic-stabilizer-${robot.uid}`;
    const decision = optionDecisions[decisionId];
    if (
      !decision ||
      decision.uid !== robot.uid ||
      !['use', 'decline'].includes(decision.choiceId)
    ) {
      addTrace(
        trace,
        1,
        robot.uid,
        null,
        'option-decision-required',
        `${robot.name} must decide whether to stabilize against factory rotations this turn.`
      );
      return {
        courseId: setup.courseId,
        turnNumber: programming.turnNumber,
        phase: 'awaiting-option-decision',
        robots,
        trace,
        optionDeck,
        nextOptionChoiceUid: null,
        pendingOptionDecision: {
          decisionId,
          uid: robot.uid,
          cardId: 'gyroscopic-stabilizer',
          timing: 'before-register',
          register: 1,
          heading: 'Use Gyroscopic Stabilizer?',
          prompt: 'Ignore gear and curving-conveyor rotations throughout this turn?',
          tabletopPrompt: 'Use Gyroscopic Stabilizer for this turn',
          choices: [
            {
              id: 'use',
              label: 'Stabilize this turn',
              description: 'Ignore every gear and curving-conveyor rotation this turn.',
              cardId: 'gyroscopic-stabilizer'
            },
            {
              id: 'decline',
              label: 'Allow factory rotation',
              description: 'Gears and curving conveyors rotate normally.'
            }
          ]
        },
        nextReentryUid: null,
        winnerUids: [],
        runnersUpUids: [],
        summary: null,
        playback,
        initialOptionDeck: cloneOptionDeck(
          initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
        )
      };
    }
    addTrace(
      trace,
      1,
      robot.uid,
      null,
      'option-decision-resolved',
      decision.choiceId === 'use'
        ? `${robot.name} activated gyroscopic stabilizer for this turn.`
        : `${robot.name} left gyroscopic stabilizer inactive this turn.`
    );
    if (decision.choiceId === 'use') {
      effectiveOptionPlans[robot.uid].activations.push({
        cardId: 'gyroscopic-stabilizer',
        register: null,
        mode: 'activate',
        targetUid: null,
        targetOptionId: null
      });
    }
  }

  for (let register = 1; register <= 5; register += 1) {
    const queue = programming.players
      .map((player) => {
        const cardId =
          programOverrides.get(`${player.uid}:${register}`) ??
          player.registers[register - 1].cardId;
        const card = cardId ? cards.get(cardId) : undefined;
        return card ? { uid: player.uid, card } : null;
      })
      .filter((entry): entry is { uid: string; card: ProgramCard } => entry !== null)
      .sort((left, right) => right.card.priority - left.card.priority);
    for (const entry of queue) {
      const cardTraceStart = trace.length;
      const pendingOptionDecision = applyProgramCard(
        robots,
        entry.uid,
        entry.card,
        register,
        trace,
        optionPlanFor(effectiveOptionPlans, entry.uid),
        course,
        optionDecisions,
        programming,
        optionDeck
      );
      if (trace.length === cardTraceStart) continue;
      playback.frames.push({
        register: register as RegisterNumber,
        stage: 'program-card',
        actorUid: entry.uid,
        cardId: entry.card.id,
        robots: cloneRaceRobots(robots),
        trace: trace.slice(cardTraceStart)
      });
      if (pendingOptionDecision) {
        return {
          courseId: setup.courseId,
          turnNumber: programming.turnNumber,
          phase: 'awaiting-option-decision',
          robots,
          trace,
          optionDeck,
          nextOptionChoiceUid: null,
          pendingOptionDecision,
          nextReentryUid: null,
          winnerUids: [],
          runnersUpUids: [],
          summary: null,
          playback,
          initialOptionDeck: cloneOptionDeck(
            initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
          )
        };
      }
    }

    const expressTraceStart = trace.length;
    resolveExpressConveyors(robots, register, trace, courseCells, effectiveOptionPlans, course);
    playback.frames.push({
      register: register as RegisterNumber,
      stage: 'express-conveyors',
      actorUid: null,
      cardId: null,
      robots: cloneRaceRobots(robots),
      trace: trace.slice(expressTraceStart)
    });

    const conveyorTraceStart = trace.length;
    resolveNormalConveyors(robots, register, trace, courseCells, effectiveOptionPlans, course);
    playback.frames.push({
      register: register as RegisterNumber,
      stage: 'conveyors',
      actorUid: null,
      cardId: null,
      robots: cloneRaceRobots(robots),
      trace: trace.slice(conveyorTraceStart)
    });

    const pusherTraceStart = trace.length;
    resolvePushers(robots, register, trace, courseCells, effectiveOptionPlans, course);
    playback.frames.push({
      register: register as RegisterNumber,
      stage: 'pushers',
      actorUid: null,
      cardId: null,
      robots: cloneRaceRobots(robots),
      trace: trace.slice(pusherTraceStart)
    });

    const gearTraceStart = trace.length;
    resolveGears(robots, register, trace, courseCells, effectiveOptionPlans);
    playback.frames.push({
      register: register as RegisterNumber,
      stage: 'gears',
      actorUid: null,
      cardId: null,
      robots: cloneRaceRobots(robots),
      trace: trace.slice(gearTraceStart)
    });

    const laserRobots = cloneRaceRobots(robots);
    const laserResult = resolveLaserSnapshot(
      robots,
      register,
      trace,
      programming,
      courseCells,
      optionDeck,
      optionDecisions,
      effectiveOptionPlans,
      course,
      resolutionProgramDrawPile
    );
    for (const override of laserResult.programOverrides ?? []) {
      programOverrides.set(`${override.targetUid}:${override.register}`, override.cardId);
    }
    resolutionProgramDrawPile.splice(0, laserResult.programCardsConsumed ?? 0);
    if (laserResult.laserTrace.length > 0) {
      playback.frames.push({
        register: register as RegisterNumber,
        stage: 'lasers',
        actorUid: null,
        cardId: null,
        robots: laserRobots,
        trace: laserResult.laserTrace,
        laserBeams: laserResult.laserBeams
      });
    }
    for (const step of laserResult.damageSteps) {
      playback.frames.push({
        register: register as RegisterNumber,
        stage: 'laser-damage',
        actorUid: step.trace.at(-1)?.actorUid ?? null,
        cardId: null,
        robots: step.robots,
        trace: step.trace,
        laserBeams: laserResult.laserBeams
      });
    }
    if (laserResult.pendingOptionDecision) {
      return {
        courseId: setup.courseId,
        turnNumber: programming.turnNumber,
        phase: 'awaiting-option-decision',
        robots,
        trace,
        optionDeck,
        nextOptionChoiceUid: null,
        pendingOptionDecision: laserResult.pendingOptionDecision,
        nextReentryUid: null,
        winnerUids: [],
        runnersUpUids: [],
        summary: null,
        playback,
        initialOptionDeck: cloneOptionDeck(
          initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
        )
      };
    }
    const finishers = resolveFlagsAndArchives(
      robots,
      register,
      trace,
      courseCells,
      flags,
      course,
      scenarioRules,
      optionDeck
    );
    if (finishers.length > 0) {
      const winnerUids = finishers;
      const runnersUpUids: string[] = [];
      const winnerNames = winnerUids.map(
        (uid) => robots.find((robot) => robot.uid === uid)!.name
      );
      addTrace(
        trace,
        register,
        winnerUids[0],
        null,
        'winner',
        winnerNames.length === 1
          ? `${winnerNames[0]} touched the final Flag in order and won the race.`
          : `${winnerNames.join(' and ')} touched the final Flag simultaneously and tied for the win.`
      );
      return {
        courseId: setup.courseId,
        turnNumber: programming.turnNumber,
        phase: 'race-finished',
        robots,
        trace,
        optionDeck,
        nextOptionChoiceUid: null,
        pendingOptionDecision: null,
        nextReentryUid: null,
        winnerUids,
        runnersUpUids,
        summary: createRaceSummary(robots, winnerUids, runnersUpUids),
        playback,
        initialOptionDeck: cloneOptionDeck(
          initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
        )
      };
    }
  }

  resolveRepairCleanup(
    robots,
    trace,
    courseCells,
    optionDeck,
    setup.powerDownAllowed,
    course,
    scenarioRules
  );

  const resolution: ProgramResolution = {
    courseId: setup.courseId,
    turnNumber: programming.turnNumber,
    phase: 'turn-complete',
    robots,
    trace,
    optionDeck,
    nextOptionChoiceUid: null,
    pendingOptionDecision: null,
    nextReentryUid: null,
    winnerUids: [],
    runnersUpUids: [],
    summary: null,
    playback,
    initialOptionDeck: cloneOptionDeck(
      initialOptionDeck ?? createOptionDeck(`standalone-turn-${programming.turnNumber}`)
    )
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
