import { describe, expect, it } from 'vitest';
import { tabletopOptionLayout } from './tabletop-options';

describe('tabletop Option icon layout', () => {
  it('shows every card when all icons fit', () => {
    expect(tabletopOptionLayout(220, 48, 6, 4)).toEqual({
      visibleCount: 4,
      hiddenCount: 0
    });
  });

  it('reserves the last available slot for an overflow control', () => {
    expect(tabletopOptionLayout(160, 48, 6, 5)).toEqual({
      visibleCount: 2,
      hiddenCount: 3
    });
  });

  it('uses the overflow control alone when only one slot fits', () => {
    expect(tabletopOptionLayout(48, 48, 6, 3)).toEqual({
      visibleCount: 0,
      hiddenCount: 3
    });
  });
});
