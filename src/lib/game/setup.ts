import {
  BOARD_MANIFEST_VERSION,
  COURSE_MANIFEST_VERSION,
  type Direction
} from './course-manifest';
import { COMPLETE_BOARD_MANIFEST_VERSION } from './board-catalog';
import { COMPLETE_COURSE_MANIFEST_VERSION } from './course-catalog';
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
export const RACE_REDUCER_VERSION = 'race-v1';

export const PLAYABLE_COURSE_IDS = ['risky-exchange', 'factory-rejects', 'option-world'] as const;
export type { PlayableCourseId } from './playable-courses';

export interface RaceConfig {
  editionId: typeof EDITION_ID;
  reducerVersion: typeof RACE_REDUCER_VERSION;
  prngVersion: typeof PRNG_VERSION;
  programManifestVersion: typeof PROGRAM_MANIFEST_VERSION;
  optionManifestVersion: typeof OPTION_MANIFEST_VERSION;
  boardManifestVersion: typeof BOARD_MANIFEST_VERSION | typeof COMPLETE_BOARD_MANIFEST_VERSION;
  courseManifestVersion:
    | typeof COURSE_MANIFEST_VERSION
    | typeof COMPLETE_COURSE_MANIFEST_VERSION;
  courseId: PlayableCourseId;
  seed: string;
  lives: 3 | 4;
  expansionIds: readonly [];
  houseRuleIds: readonly [];
}

export interface SetupPlayer {
  uid: string;
  name: string;
  robotId: string;
  dock: number;
  originalDockOrder: number;
  lives: 3 | 4;
  position: { x: number; y: number };
  archive: { x: number; y: number };
  facing: Direction;
}

export interface RaceSetup {
  courseId: PlayableCourseId;
  startingDamage: number;
  powerDownAllowed: boolean;
  firstPlayerUid: string;
  players: SetupPlayer[];
}

export function raceConfig(
  courseId: PlayableCourseId,
  seed: string,
  lives: 3 | 4 = 3
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

  const random = createPrng(config.seed);
  const firstIndex = Math.floor(random() * players.length);
  const clockwise = [...players.slice(firstIndex), ...players.slice(0, firstIndex)];
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
        dock,
        originalDockOrder: index + 1,
        lives: config.lives,
        position,
        archive: position,
        facing: 'north'
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
