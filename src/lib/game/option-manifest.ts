export const OPTION_MANIFEST_VERSION = 'avalon-hill-2005-options-v1';

export type OptionTiming =
  | 'damage'
  | 'programming'
  | 'before-register'
  | 'program-movement'
  | 'robot-lasers'
  | 'register-end'
  | 'turn-end'
  | 'power-down'
  | 'destruction'
  | 'reentry';

export type OptionKind =
  | 'armor'
  | 'movement'
  | 'programming'
  | 'weapon'
  | 'laser-modifier'
  | 'persistent'
  | 'power-down'
  | 'reentry';

export interface OptionCard {
  id:
    | 'ablative-coat'
    | 'abort-switch'
    | 'brakes'
    | 'circuit-breaker'
    | 'conditional-program'
    | 'crab-legs'
    | 'double-barrel-laser'
    | 'dual-processor'
    | 'extra-memory'
    | 'fire-control'
    | 'flywheel'
    | 'fourth-gear'
    | 'gyroscopic-stabilizer'
    | 'high-power-laser'
    | 'mechanical-arm'
    | 'mini-howitzer'
    | 'power-down-shield'
    | 'pressor-beam'
    | 'radio-control'
    | 'ramming-gear'
    | 'rear-laser'
    | 'recompile'
    | 'reverse-gears'
    | 'scrambler'
    | 'superior-archive-copy'
    | 'tractor-beam';
  name: string;
  kind: OptionKind;
  timing: readonly OptionTiming[];
  optional: boolean;
  payload: number | null;
  summary: string;
}

/**
 * The complete Option deck shipped with the Avalon Hill 2005 edition.
 *
 * Summaries are intentionally concise implementation statements rather than
 * transcriptions. The source review and the finite digital timing decisions
 * are recorded in docs/data/avalon-hill-2005-options-review.md.
 */
export const OPTION_CARDS = Object.freeze([
  {
    id: 'ablative-coat',
    name: 'Ablative Coat',
    kind: 'armor',
    timing: ['damage'],
    optional: false,
    payload: 3,
    summary: 'Absorbs the next three damage, then discards itself.'
  },
  {
    id: 'abort-switch',
    name: 'Abort Switch',
    kind: 'programming',
    timing: ['before-register'],
    optional: true,
    payload: null,
    summary: 'Replaces this and every later register this turn with top-deck Programs.'
  },
  {
    id: 'brakes',
    name: 'Brakes',
    kind: 'movement',
    timing: ['program-movement'],
    optional: true,
    payload: null,
    summary: 'A Move 1 may move zero spaces at its printed priority.'
  },
  {
    id: 'circuit-breaker',
    name: 'Circuit Breaker',
    kind: 'power-down',
    timing: ['turn-end'],
    optional: false,
    payload: null,
    summary: 'Three or more damage at turn end forces power down next turn.'
  },
  {
    id: 'conditional-program',
    name: 'Conditional Program',
    kind: 'programming',
    timing: ['programming', 'before-register'],
    optional: true,
    payload: 1,
    summary: 'Stores one unused Program for a declared register substitution this turn.'
  },
  {
    id: 'crab-legs',
    name: 'Crab Legs',
    kind: 'movement',
    timing: ['programming', 'program-movement'],
    optional: true,
    payload: null,
    summary: 'Pairs Move 1 with a quarter turn to sidestep without rotating.'
  },
  {
    id: 'double-barrel-laser',
    name: 'Double-Barrel Laser',
    kind: 'laser-modifier',
    timing: ['robot-lasers'],
    optional: false,
    payload: null,
    summary: 'The main laser deals two damage instead of one.'
  },
  {
    id: 'dual-processor',
    name: 'Dual Processor',
    kind: 'movement',
    timing: ['programming', 'program-movement'],
    optional: true,
    payload: null,
    summary: 'Pairs movement and rotation; movement is shortened before rotation.'
  },
  {
    id: 'extra-memory',
    name: 'Extra Memory',
    kind: 'persistent',
    timing: ['programming'],
    optional: false,
    payload: null,
    summary: 'Deals one additional Program card each turn.'
  },
  {
    id: 'fire-control',
    name: 'Fire Control',
    kind: 'laser-modifier',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'A main-laser hit may lock a register or destroy a named Option instead of damage.'
  },
  {
    id: 'flywheel',
    name: 'Flywheel',
    kind: 'programming',
    timing: ['programming'],
    optional: true,
    payload: 1,
    summary: 'Stores one unused movement Program for a later hand.'
  },
  {
    id: 'fourth-gear',
    name: 'Fourth Gear',
    kind: 'movement',
    timing: ['program-movement'],
    optional: true,
    payload: null,
    summary: 'A Move 3 may move four spaces at its printed priority.'
  },
  {
    id: 'gyroscopic-stabilizer',
    name: 'Gyroscopic Stabilizer',
    kind: 'persistent',
    timing: ['before-register'],
    optional: true,
    payload: null,
    summary: 'For a declared turn, ignores rotations from gears and curving conveyors.'
  },
  {
    id: 'high-power-laser',
    name: 'High-Power Laser',
    kind: 'laser-modifier',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'The main laser may pass one wall or robot; a passed robot is also hit.'
  },
  {
    id: 'mechanical-arm',
    name: 'Mechanical Arm',
    kind: 'persistent',
    timing: ['register-end'],
    optional: false,
    payload: null,
    summary: 'Touches an adjacent diagonal or orthogonal flag or archive through no wall.'
  },
  {
    id: 'mini-howitzer',
    name: 'Mini Howitzer',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: true,
    payload: 5,
    summary: 'Replaces the main laser with one damage and a one-space push away.'
  },
  {
    id: 'power-down-shield',
    name: 'Power-Down Shield',
    kind: 'power-down',
    timing: ['power-down', 'damage'],
    optional: false,
    payload: null,
    summary: 'While powered down, prevents one damage from each direction per register.'
  },
  {
    id: 'pressor-beam',
    name: 'Pressor Beam',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'Replaces the main laser with a one-space push away.'
  },
  {
    id: 'radio-control',
    name: 'Radio Control',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'Replaces the main laser and copies the attacker’s remaining Program to the target.'
  },
  {
    id: 'ramming-gear',
    name: 'Ramming Gear',
    kind: 'persistent',
    timing: ['program-movement'],
    optional: false,
    payload: null,
    summary: 'A robot pushed by this robot takes one damage, even when the push is blocked.'
  },
  {
    id: 'rear-laser',
    name: 'Rear Laser',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: false,
    payload: null,
    summary: 'Fires an additional laser directly behind the robot.'
  },
  {
    id: 'recompile',
    name: 'Recompile',
    kind: 'programming',
    timing: ['programming'],
    optional: true,
    payload: null,
    summary: 'Once per turn, redeals the hand and then deals one damage.'
  },
  {
    id: 'reverse-gears',
    name: 'Reverse Gears',
    kind: 'movement',
    timing: ['program-movement'],
    optional: true,
    payload: null,
    summary: 'A Back Up may move two spaces at its printed priority.'
  },
  {
    id: 'scrambler',
    name: 'Scrambler',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'Before register five, replaces the target’s next Program with the top deck card.'
  },
  {
    id: 'superior-archive-copy',
    name: 'Superior Archive Copy',
    kind: 'reentry',
    timing: ['destruction', 'reentry'],
    optional: false,
    payload: null,
    summary: 'The next re-entry does not receive the usual two damage.'
  },
  {
    id: 'tractor-beam',
    name: 'Tractor Beam',
    kind: 'weapon',
    timing: ['robot-lasers'],
    optional: true,
    payload: null,
    summary: 'Replaces a non-adjacent main-laser shot with a one-space pull toward the attacker.'
  }
] as const satisfies readonly OptionCard[]);

export type OptionCardId = (typeof OPTION_CARDS)[number]['id'];

export const OPTION_CARDS_BY_ID = new Map<OptionCardId, (typeof OPTION_CARDS)[number]>(
  OPTION_CARDS.map((card) => [card.id, card])
);
