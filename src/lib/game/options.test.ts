import { describe, expect, it } from 'vitest';
import {
  createOptionDeck,
  discardOwnedOption,
  drawOption,
  validateOptionPlan,
  type OwnedOption
} from './options';

describe('Option deck and finite choices', () => {
  it('shuffles all 26 cards deterministically without replacement', () => {
    const first = createOptionDeck('OPTIONS');
    const second = createOptionDeck('OPTIONS');
    const other = createOptionDeck('OTHER');
    expect(first.drawPile).toEqual(second.drawPile);
    expect(first.drawPile).not.toEqual(other.drawPile);
    expect(new Set(first.drawPile).size).toBe(26);
  });

  it('draws face up and moves a named owned card to the discard pile', () => {
    const deck = createOptionDeck('DRAW');
    const expected = deck.drawPile[0];
    const option = drawOption(deck);
    expect(option).toEqual({
      cardId: expected,
      spent: 0,
      storedProgramCardId: null
    });
    const owned = [option!];
    expect(discardOwnedOption(owned, deck, expected)).toBe(true);
    expect(owned).toEqual([]);
    expect(deck.discardPile).toEqual([expected]);
  });

  it('rejects unowned, malformed, and untargeted activations', () => {
    const owned: OwnedOption[] = [
      { cardId: 'brakes', spent: 0, storedProgramCardId: null }
    ];
    expect(
      validateOptionPlan(owned, {
        kind: 'option-plan',
        activations: [
          {
            cardId: 'rear-laser',
            register: 6 as 5,
            mode: 'fire',
            targetUid: '',
            targetOptionId: null
          }
        ]
      })
    ).toEqual([
      'activation-not-owned:rear-laser',
      'invalid-register:rear-laser',
      'invalid-target:rear-laser'
    ]);
  });
});
