import {
  BOARD_MANIFEST_VERSION,
  COURSE_MANIFEST_VERSION,
  type Direction
} from './course-manifest';
import { COMPLETE_BOARD_MANIFEST_VERSION } from './board-catalog';
import { COMPLETE_COURSE_MANIFEST_VERSION, LEGACY_COMPLETE_COURSE_MANIFEST_VERSION, PUBLISHED_COURSES } from './course-catalog';
import { createCourseRuleState } from './course-rules';
import {
  compilePlayableCourse,
  playableCourse,
  type PlayableCourseId
} from './playable-courses';
import { PROGRAM_MANIFEST_VERSION } from './program-manifest';
import { OPTION_MANIFEST_VERSION } from './option-manifest';

export const EDITION_ID = 'avalon-hill-2005';
export const PRNG_VERSION = 'xorshift32-v1';
export const LEGACY_RACE_REDUCER_VERSION = 'race-v1';
export const RACE_REDUCER_VERSION = 'race-v2';
export const SUPPORTED_RACE_REDUCER_VERSIONS = [
  LEGACY_RACE_REDUCER_VERSION,
  RACE_REDUCER_VERSION
] as const;
export type RaceReducerVersion = (typeof SUPPORTED_RACE_REDUCER_VERSIONS)[number];

export const PLAYABLE_COURSE_IDS: readonly string[] = Object.freeze(PUBLISHED_COURSES.map(({ id }) => id));
export type { PlayableCourseId } from './playable-courses';

export interface RaceConfig {
  editionId: typeof EDITION_ID;
  reducerVersion: RaceReducerVersion;
  prngVersion: typeof PRNG_VERSION;
  programManifestVersion: typeof PROGRAM_MANIFEST_VERSION;
  optionManifestVersion: typeof OPTION_MANIFEST_VERSION;
  boardManifestVersion: typeof BOARD_MANIFEST_VERSION | typeof COMPLETE_BOARD_MANIFEST_VERSION;
  courseManifestVersion:
    | typeof COURSE_MANIFEST_VERSION
    | typeof COMPLETE_COURSE_MANIFEST_VERSION
    | typeof LEGACY_COMPLETE_COURSE_MANIFEST_VERSION;
  courseId: PlayableCourseId;
  teamAssignments?: Record<string, string>;
  seed: string;
  lives: 3 | 4;
  expansionIds: readonly [];
  houseRuleIds: readonly [];
}

export interface SetupPlayer {
  ownerUid?: string;
  role?: 'racer' | 'blocker';
  uid: string;
  teamId?: string;
  isSuperbot?: boolean;
  name: string;
  robotId: string;
  dock: number;
  originalDockOrder: number;
  lives: 3 | 4;
  position: { x: number; y: number };
  archive: { x: number; y: number };
  facing: Direction;
}

export interface CaptureDeployment {
  coinWinner: string;
  homeBoards: Record<string, string>;
  deployedUids: string[];
}

export interface RaceSetup {
  capture?: CaptureDeployment;
  legacyFactoryLayout?: boolean;
  legacyOptionFlagAwards?: boolean;
  scenarioSeed?: string;
  courseId: PlayableCourseId;
  startingDamage: number;
  powerDownAllowed: boolean;
  firstPlayerUid: string;
  players: SetupPlayer[];
}

export function raceConfig(
  courseId: PlayableCourseId,
  seed: string,
  lives: 3 | 4 = 3,
  teamAssignments?: Record<string, string>
): RaceConfig {
  return {
    editionId: EDITION_ID,
    reducerVersion: RACE_REDUCER_VERSION,
    prngVersion: PRNG_VERSION,
    programManifestVersion: PROGRAM_MANIFEST_VERSION,
    optionManifestVersion: OPTION_MANIFEST_VERSION,
    boardManifestVersion:
      courseId === 'risky-exchange' || courseId === 'risky-exchange-a' || courseId === 'option-lab'
        ? BOARD_MANIFEST_VERSION
        : COMPLETE_BOARD_MANIFEST_VERSION,
    courseManifestVersion:
      courseId === 'risky-exchange' || courseId === 'risky-exchange-a' || courseId === 'option-lab'
        ? COURSE_MANIFEST_VERSION
        : COMPLETE_COURSE_MANIFEST_VERSION,
    courseId,
    ...(teamAssignments ? { teamAssignments } : {}),
    seed,
    lives,
    expansionIds: [],
    houseRuleIds: []
  };
}

export function riskyExchangeConfig(seed: string, lives: 3 | 4 = 3): RaceConfig {
  return raceConfig('risky-exchange', seed, lives);
}

export function factoryRejectsConfig(seed: string, lives: 3 | 4 = 3): RaceConfig {
  return raceConfig('factory-rejects', seed, lives);
}

export function optionWorldConfig(seed: string, lives: 3 | 4 = 3): RaceConfig {
  return raceConfig('option-world', seed, lives);
}

export function seedToUint32(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0 || 0x9e3779b9;
}

export function createPrng(seed: string): () => number {
  let state = seedToUint32(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function scenarioTeamAssignments(
  courseId: PlayableCourseId,
  players: readonly { uid: string }[],
  selected: Readonly<Record<string, string>> = {}
): Record<string, string> {
  const course = playableCourse(courseId);
  if (course.category !== 'team') return {};
  const pairs = course.specialRules.some(({ kind }) => kind === 'team-shared-flag-progress');
  return Object.fromEntries(players.map(({ uid }, index) => [
    uid, selected[uid] ?? `team-${pairs ? Math.floor(index / 2) + 1 : index % 2 + 1}`
  ]));
}

export function validateScenarioTeams(courseId: PlayableCourseId, assignments: Readonly<Record<string, string>>): boolean {
  const course = playableCourse(courseId);
  if (course.category !== 'team') return Object.keys(assignments).length === 0;
  const counts = new Map<string, number>();
  for (const team of Object.values(assignments)) {
    if (!/^team-[1-4]$/.test(team)) return false;
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  const pairs = course.specialRules.some(({ kind }) => kind === 'team-shared-flag-progress');
  return pairs ? counts.size >= 2 && [...counts.values()].every((count) => count === 2)
    : counts.size === 2 && new Set(counts.values()).size === 1;
}

export function deriveRaceSetup(
  players: readonly { uid: string; name: string; robotId: string }[],
  config: RaceConfig
): RaceSetup {
  if (players.length < 2 || players.length > 8) {
    throw new Error('A 2005 race requires two through eight players.');
  }
  if (config.lives === 4 && players.length < 5) {
    throw new Error('The published four-Life option requires five or more players.');
  }
  const course = playableCourse(config.courseId);
  if (!course.players.includes(players.length)) {
    throw new Error(`${course.name} does not support ${players.length} players.`);
  }

  const teams = scenarioTeamAssignments(config.courseId, players, config.teamAssignments);
  if (!validateScenarioTeams(config.courseId, teams)) {
    throw new Error('Choose balanced teams before starting this course.');
  }
  const random = createPrng(config.seed);
  const firstIndex = Math.floor(random() * players.length);
  const ordered = [...players.slice(firstIndex), ...players.slice(0, firstIndex)];
  const unusedRobots = ['axle', 'bit', 'cog', 'dash', 'flux', 'gizmo', 'hex', 'rivet'].filter((id) => !players.some(({ robotId }) => robotId === id));
  const clockwise = course.specialRules.some(({ kind }) => kind === 'two-controlled-robots')
    ? ordered.flatMap((player, index) => [
        { ...player, ownerUid: player.uid, role: 'racer' as const, name: `${player.name} · Racer` },
        { ...player, uid: `${player.uid}:blocker`, ownerUid: player.uid, role: 'blocker' as const, name: `${player.name} · Blocker`, robotId: unusedRobots[index] }
      ])
    : ordered;
  if (course.specialRules.some(({ kind }) => kind === 'capture-the-flag')) {
    return {
      courseId: config.courseId, startingDamage: 0, powerDownAllowed: true,
      firstPlayerUid: clockwise[0].uid,
      capture: { coinWinner: teams[clockwise[0].uid], homeBoards: {}, deployedUids: [] },
      players: clockwise.map((player, index) => ({ ...player, teamId: teams[player.uid],
        dock: index + 1, originalDockOrder: index + 1, lives: config.lives,
        position: { x: 0, y: 0 }, archive: { x: 0, y: 0 }, facing: 'north' }))
    };
  }
  const compiled = compilePlayableCourse(config.courseId);
  const dockCells = new Map<number, { x: number; y: number }>(
    [...compiled.cells.values()].flatMap(({ x, y, elements }) =>
      elements.flatMap((element) =>
        element.kind === 'dock' ? [[element.number, { x, y }] as const] : []
      )
    )
  );
  const rules = createCourseRuleState(
    course.id,
    clockwise.map(({ uid }) => ({ uid }))
  );

  return {
    courseId: config.courseId,
    ...(config.courseId === 'option-world' && config.courseManifestVersion === LEGACY_COMPLETE_COURSE_MANIFEST_VERSION ? { legacyOptionFlagAwards: true } : {}),
    ...(config.courseId === 'factory-rejects' && config.courseManifestVersion === LEGACY_COMPLETE_COURSE_MANIFEST_VERSION ? { legacyFactoryLayout: true } : {}),
    ...(course.specialRules.some(({ kind }) => kind === 'rotate-board-on-flag') ? { scenarioSeed: config.seed } : {}),
    startingDamage:
      config.courseId === 'option-lab' && config.seed.startsWith('OPTION-SHIELD-')
        ? 1
        : (rules.robots[0]?.damage ?? 0),
    powerDownAllowed: rules.powerDownAllowed,
    firstPlayerUid: clockwise[0].uid,
    players: clockwise.map((player, index) => {
      const dock = index + 1;
      const dockPosition = dockCells.get(dock);
      if (!dockPosition) throw new Error(`Dock ${dock} is not present on ${course.name}.`);
      const position =
        config.courseId === 'option-lab' && config.seed.startsWith('OPTION-SHIELD-')
          ? index === 0
            ? { x: 3, y: 8 }
            : { x: 1, y: 8 }
          : config.courseId === 'option-lab' && config.seed.startsWith('OPTION-GYRO-')
            ? index === 0
              ? { x: 4, y: 4 }
              : { x: 1, y: 3 }
          : config.courseId === 'option-lab' && config.seed.startsWith('OPTION-BEAM-')
            ? index === 0
              ? { x: 1, y: 8 }
              : { x: 3, y: 8 }
          : config.courseId === 'option-lab' && config.seed.startsWith('OPTION-RAM-')
            ? index === 0
              ? { x: 1, y: 8 }
              : { x: 2, y: 8 }
          : config.courseId === 'option-lab' &&
              config.seed.startsWith('OPTION-FLAG-') &&
              index === 0
            ? { x: 7, y: 3 }
            : dockPosition;
      return {
        ...player,
        ...(teams[player.uid] ? { teamId: teams[player.uid] } : {}),
        ...(course.specialRules.some(({ kind }) => kind === 'superbot') ? { isSuperbot: index === 0 } : {}),
        dock,
        originalDockOrder: index + 1,
        lives: config.lives,
        position,
        archive:
          config.courseId === 'option-lab' && config.seed.startsWith('OPTION-FLAG-')
            ? dockPosition
            : position,
        facing: (['north', 'east', 'south', 'west'] as const)[
          course.boardPlacements.find(({ instanceId }) =>
            instanceId === compiled.cells.get(`${dockPosition.x},${dockPosition.y}`)?.boardInstanceId
          )?.rotation ?? 0
        ]
      };
    })
  };
}

export const DOCK_POSITIONS = Object.freeze([
  { dock: 1, x: 6, y: 15 },
  { dock: 2, x: 7, y: 15 },
  { dock: 3, x: 4, y: 15 },
  { dock: 4, x: 9, y: 15 },
  { dock: 5, x: 2, y: 14 },
  { dock: 6, x: 11, y: 14 },
  { dock: 7, x: 1, y: 13 },
  { dock: 8, x: 12, y: 13 }
] as const);
