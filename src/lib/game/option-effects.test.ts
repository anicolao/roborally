import { describe, expect, it } from 'vitest';
import { OPTION_CARDS, type OptionCardId } from './option-manifest';
import { applyOptionEffect, type OptionEffectRequest } from './option-effects';

const fixtures = {
  'ablative-coat': [{ payloadSpent: 2 }, { effect: 'absorb', damagePrevented: 1, discard: true }],
  'abort-switch': [{ replacementProgramCardId: 'program-010' }, { effect: 'replace-programs', replacementScope: 'remaining-turn' }],
  brakes: [{ action: 'move-1' }, { effect: 'movement', movementDistance: 0 }],
  'circuit-breaker': [{ damage: 3 }, { effect: 'forced-power-down', forcePowerDown: true }],
  'conditional-program': [{ storedProgramCardId: 'program-020' }, { effect: 'store-program', replacementScope: 'one-register' }],
  'crab-legs': [{ action: 'move-1', pairedAction: 'rotate-left' }, { effect: 'side-step', sideStep: 'left' }],
  'double-barrel-laser': [{}, { effect: 'laser-damage', laserDamage: 2 }],
  'dual-processor': [{ action: 'move-3', pairedAction: 'u-turn' }, { effect: 'combined-program', movementDistance: 1, rotationAfterMovement: 2 }],
  'extra-memory': [{}, { effect: 'extra-program', handBonus: 1 }],
  'fire-control': [{ targetUid: 'target', targetOptionId: 'brakes' }, { effect: 'laser-control', damageDealt: 0 }],
  flywheel: [{ action: 'move-2', storedProgramCardId: 'program-700' }, { effect: 'store-program', active: true }],
  'fourth-gear': [{ action: 'move-3' }, { effect: 'movement', movementDistance: 4 }],
  'gyroscopic-stabilizer': [{}, { effect: 'factory-immunity', ignoreFactoryRotation: true }],
  'high-power-laser': [{ obstruction: 'wall' }, { effect: 'laser-penetration', passObstructions: 1 }],
  'mechanical-arm': [{ range: 1 }, { effect: 'remote-touch', active: true }],
  'mini-howitzer': [{ targetUid: 'target', payloadSpent: 4 }, { effect: 'damage-push', damageDealt: 1, pushSpaces: 1, discard: true }],
  'power-down-shield': [{ poweredDown: true, targetDirection: 'north' }, { effect: 'directional-shield', damagePrevented: 1 }],
  'pressor-beam': [{ targetUid: 'target' }, { effect: 'push', pushSpaces: 1 }],
  'radio-control': [{ targetUid: 'target' }, { effect: 'copy-program', replacementScope: 'remaining-turn' }],
  'ramming-gear': [{ targetUid: 'target' }, { effect: 'ram-damage', damageDealt: 1 }],
  'rear-laser': [{}, { effect: 'rear-shot', laserDirections: ['front', 'rear'] }],
  recompile: [{}, { effect: 'redeal', damageDealt: 1 }],
  'reverse-gears': [{ action: 'back-up' }, { effect: 'movement', movementDistance: -2 }],
  scrambler: [{ targetUid: 'target', register: 4, replacementProgramCardId: 'program-030' }, { effect: 'replace-next-program', active: true }],
  'superior-archive-copy': [{}, { effect: 'safe-reentry', reentryDamage: 0 }],
  'tractor-beam': [{ targetUid: 'target', range: 2 }, { effect: 'pull', pullSpaces: 1 }]
} as const satisfies Record<
  OptionCardId,
  readonly [OptionEffectRequest, Partial<ReturnType<typeof applyOptionEffect>>]
>;

describe('all 26 Option effects', () => {
  it('has one executable fixture for every reviewed card and no extras', () => {
    expect(Object.keys(fixtures).sort()).toEqual(OPTION_CARDS.map(({ id }) => id).sort());
  });

  for (const [cardId, [request, expected]] of Object.entries(fixtures) as [
    OptionCardId,
    (typeof fixtures)[OptionCardId]
  ][]) {
    it(`${cardId} produces its reviewed active effect`, () => {
      expect(applyOptionEffect(cardId, request)).toMatchObject({
        active: true,
        ...expected
      });
    });
  }

  it('makes non-applicable optional effects explicit instead of inventing an interrupt', () => {
    expect(applyOptionEffect('brakes', { action: 'move-3' })).toMatchObject({
      active: false,
      movementDistance: 3
    });
    expect(applyOptionEffect('tractor-beam', { targetUid: 'target', range: 1 })).toMatchObject({
      active: false,
      pullSpaces: 0
    });
    expect(applyOptionEffect('scrambler', { targetUid: 'target', register: 5 })).toMatchObject({
      active: false
    });
  });
});
