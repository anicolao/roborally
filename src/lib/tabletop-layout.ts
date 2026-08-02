export type TabletopLayout = 'side-seats' | 'top-bottom-seats';

export function tabletopLayoutForCourse(
  courseWidth: number,
  courseHeight: number
): TabletopLayout {
  if (courseWidth <= 0 || courseHeight <= 0) {
    throw new Error('A tabletop course must have positive dimensions.');
  }
  return courseHeight > courseWidth ? 'side-seats' : 'top-bottom-seats';
}
