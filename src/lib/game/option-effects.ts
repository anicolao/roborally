import type { Direction } from './course-manifest';
import type { OptionCardId } from './option-manifest';
import type { ProgramAction, ProgramCard } from './program-manifest';

export interface OptionEffectRequest {
  action?: ProgramAction;
  register?: 1 | 2 | 3 | 4 | 5;
  direction?: Direction;
  targetDirection?: Direction;
  damage?: number;
  poweredDown?: boolean;
  range?: number;
  obstruction?: 'none' | 'wall' | 'robot';
  storedProgramCardId?: ProgramCard['id'] | null;
  replacementProgramCardId?: ProgramCard['id'] | null;
  pairedAction?: ProgramAction | null;
  targetUid?: string | null;
  targetOptionId?: OptionCardId | null;
  payloadSpent?: number;
}

export interface OptionEffectResult {
  effect:
    | 'absorb'
    | 'replace-programs'
    | 'movement'
    | 'forced-power-down'
    | 'store-program'
    | 'side-step'
    | 'laser-damage'
    | 'combined-program'
    | 'extra-program'
    | 'laser-control'
    | 'factory-immunity'
    | 'laser-penetration'
    | 'remote-touch'
    | 'damage-push'
    | 'directional-shield'
    | 'push'
    | 'copy-program'
    | 'ram-damage'
    | 'rear-shot'
    | 'redeal'
    | 'replace-next-program'
    | 'safe-reentry'
    | 'pull';
  active: boolean;
  movementDistance?: number;
  sideStep?: 'left' | 'right';
  rotationAfterMovement?: -1 | 1 | 2;
  damagePrevented?: number;
  damageDealt?: number;
  handBonus?: number;
  forcePowerDown?: boolean;
  ignoreFactoryRotation?: boolean;
  laserDamage?: number;
  laserDirections?: readonly ('front' | 'rear')[];
  passObstructions?: number;
  pushSpaces?: number;
  pullSpaces?: number;
  reentryDamage?: number;
  replacementScope?: 'remaining-turn' | 'one-register';
  storedProgramCardId?: ProgramCard['id'] | null;
  targetUid?: string | null;
  targetOptionId?: OptionCardId | null;
  payloadSpent?: number;
  discard?: boolean;
}

function movementDistance(action?: ProgramAction): number {
  if (action === 'move-1') return 1;
  if (action === 'move-2') return 2;
  if (action === 'move-3') return 3;
  if (action === 'back-up') return -1;
  return 0;
}

/**
 * Applies one reviewed 2005 card to a finite rules request.
 *
 * This pure function is shared by ordinary turn hooks and exhaustive fixtures.
 * An inactive result is an explicit, deterministic non-activation proof.
 */
export function applyOptionEffect(
  cardId: OptionCardId,
  request: OptionEffectRequest = {}
): OptionEffectResult {
  const distance = movementDistance(request.action);
  switch (cardId) {
    case 'ablative-coat': {
      const spent = request.payloadSpent ?? 0;
      return {
        effect: 'absorb',
        active: spent < 3,
        damagePrevented: spent < 3 ? 1 : 0,
        payloadSpent: Math.min(3, spent + 1),
        discard: spent + 1 >= 3
      };
    }
    case 'abort-switch':
      return {
        effect: 'replace-programs',
        active: Boolean(request.replacementProgramCardId),
        replacementScope: 'remaining-turn',
        storedProgramCardId: request.replacementProgramCardId ?? null
      };
    case 'brakes':
      return {
        effect: 'movement',
        active: request.action === 'move-1',
        movementDistance: request.action === 'move-1' ? 0 : distance
      };
    case 'circuit-breaker':
      return {
        effect: 'forced-power-down',
        active: (request.damage ?? 0) >= 3,
        forcePowerDown: (request.damage ?? 0) >= 3
      };
    case 'conditional-program':
      return {
        effect: 'store-program',
        active: Boolean(request.storedProgramCardId),
        replacementScope: 'one-register',
        storedProgramCardId: request.storedProgramCardId ?? null
      };
    case 'crab-legs': {
      const active =
        request.action === 'move-1' &&
        (request.pairedAction === 'rotate-left' ||
          request.pairedAction === 'rotate-right');
      return {
        effect: 'side-step',
        active,
        movementDistance: active ? 1 : distance,
        sideStep: active
          ? request.pairedAction === 'rotate-left'
            ? 'left'
            : 'right'
          : undefined
      };
    }
    case 'double-barrel-laser':
      return { effect: 'laser-damage', active: true, laserDamage: 2 };
    case 'dual-processor': {
      const rotation =
        request.pairedAction === 'rotate-left'
          ? -1
          : request.pairedAction === 'rotate-right'
            ? 1
            : request.pairedAction === 'u-turn'
              ? 2
              : undefined;
      const active = distance !== 0 && rotation !== undefined;
      return {
        effect: 'combined-program',
        active,
        movementDistance: active
          ? Math.sign(distance) * Math.max(0, Math.abs(distance) - (rotation === 2 ? 2 : 1))
          : distance,
        rotationAfterMovement: active ? rotation : undefined
      };
    }
    case 'extra-memory':
      return { effect: 'extra-program', active: true, handBonus: 1 };
    case 'fire-control':
      return {
        effect: 'laser-control',
        active: Boolean(request.targetUid),
        targetUid: request.targetUid ?? null,
        targetOptionId: request.targetOptionId ?? null,
        damageDealt: 0
      };
    case 'flywheel':
      return {
        effect: 'store-program',
        active:
          Boolean(request.storedProgramCardId) &&
          ['move-1', 'move-2', 'move-3', 'back-up'].includes(request.action ?? ''),
        storedProgramCardId: request.storedProgramCardId ?? null
      };
    case 'fourth-gear':
      return {
        effect: 'movement',
        active: request.action === 'move-3',
        movementDistance: request.action === 'move-3' ? 4 : distance
      };
    case 'gyroscopic-stabilizer':
      return {
        effect: 'factory-immunity',
        active: true,
        ignoreFactoryRotation: true
      };
    case 'high-power-laser':
      return {
        effect: 'laser-penetration',
        active: request.obstruction === 'wall' || request.obstruction === 'robot',
        passObstructions: 1
      };
    case 'mechanical-arm':
      return {
        effect: 'remote-touch',
        active: (request.range ?? Number.MAX_SAFE_INTEGER) <= 1
      };
    case 'mini-howitzer': {
      const spent = request.payloadSpent ?? 0;
      return {
        effect: 'damage-push',
        active: Boolean(request.targetUid) && spent < 5,
        targetUid: request.targetUid ?? null,
        damageDealt: spent < 5 ? 1 : 0,
        pushSpaces: spent < 5 ? 1 : 0,
        payloadSpent: Math.min(5, spent + 1),
        discard: spent + 1 >= 5
      };
    }
    case 'power-down-shield':
      return {
        effect: 'directional-shield',
        active: Boolean(request.poweredDown && request.targetDirection),
        damagePrevented: request.poweredDown && request.targetDirection ? 1 : 0
      };
    case 'pressor-beam':
      return {
        effect: 'push',
        active: Boolean(request.targetUid),
        targetUid: request.targetUid ?? null,
        pushSpaces: request.targetUid ? 1 : 0
      };
    case 'radio-control':
      return {
        effect: 'copy-program',
        active: Boolean(request.targetUid),
        targetUid: request.targetUid ?? null,
        replacementScope: 'remaining-turn'
      };
    case 'ramming-gear':
      return {
        effect: 'ram-damage',
        active: Boolean(request.targetUid),
        targetUid: request.targetUid ?? null,
        damageDealt: request.targetUid ? 1 : 0
      };
    case 'rear-laser':
      return {
        effect: 'rear-shot',
        active: true,
        laserDirections: ['front', 'rear']
      };
    case 'recompile':
      return { effect: 'redeal', active: true, damageDealt: 1 };
    case 'reverse-gears':
      return {
        effect: 'movement',
        active: request.action === 'back-up',
        movementDistance: request.action === 'back-up' ? -2 : distance
      };
    case 'scrambler':
      return {
        effect: 'replace-next-program',
        active: Boolean(request.targetUid) && (request.register ?? 5) < 5,
        targetUid: request.targetUid ?? null,
        replacementScope: 'one-register',
        storedProgramCardId: request.replacementProgramCardId ?? null
      };
    case 'superior-archive-copy':
      return { effect: 'safe-reentry', active: true, reentryDamage: 0 };
    case 'tractor-beam':
      return {
        effect: 'pull',
        active: Boolean(request.targetUid) && (request.range ?? 0) > 1,
        targetUid: request.targetUid ?? null,
        pullSpaces: request.targetUid && (request.range ?? 0) > 1 ? 1 : 0
      };
  }
}
