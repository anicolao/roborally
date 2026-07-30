import { describe, expect, it } from 'vitest';
import {
  OPTION_CARDS,
  OPTION_CARDS_BY_ID,
  OPTION_MANIFEST_VERSION
} from './option-manifest';

describe('Avalon Hill 2005 Option manifest', () => {
  it('contains the reviewed 26-card deck exactly once', () => {
    expect(OPTION_MANIFEST_VERSION).toBe('avalon-hill-2005-options-v1');
    expect(OPTION_CARDS).toHaveLength(26);
    expect(new Set(OPTION_CARDS.map(({ id }) => id)).size).toBe(26);
    expect(new Set(OPTION_CARDS.map(({ name }) => name)).size).toBe(26);
    expect(OPTION_CARDS_BY_ID.size).toBe(26);
  });

  it('records finite timing and a complete behavior classification for every card', () => {
    for (const card of OPTION_CARDS) {
      expect(card.timing.length, card.name).toBeGreaterThan(0);
      expect(card.summary.length, card.name).toBeGreaterThan(20);
      expect(OPTION_CARDS_BY_ID.get(card.id), card.name).toBe(card);
    }
  });

  it('uses the 2005 deck, not similarly named cards from another edition', () => {
    const ids = new Set(OPTION_CARDS.map(({ id }) => id));
    expect(ids).toContain('crab-legs');
    expect(ids).toContain('dual-processor');
    expect(ids).not.toContain('shield');
    expect(ids).not.toContain('turret');
  });
});
