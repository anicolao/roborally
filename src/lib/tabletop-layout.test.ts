import { describe, expect, it } from 'vitest';
import { tabletopLayoutForCourse } from './tabletop-layout';

describe('tabletopLayoutForCourse', () => {
  it('places seats beside a portrait course so the course can remain upright', () => {
    expect(tabletopLayoutForCourse(12, 16)).toBe('side-seats');
  });

  it('places seats above and below a landscape or square course', () => {
    expect(tabletopLayoutForCourse(16, 12)).toBe('top-bottom-seats');
    expect(tabletopLayoutForCourse(12, 12)).toBe('top-bottom-seats');
  });

  it('rejects unusable course dimensions', () => {
    expect(() => tabletopLayoutForCourse(0, 12)).toThrow(/positive dimensions/);
  });
});
