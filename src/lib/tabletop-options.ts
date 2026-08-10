export interface TabletopOptionLayout {
  visibleCount: number;
  hiddenCount: number;
}

/** Fit Option icons and reserve the final slot for an overflow control when needed. */
export function tabletopOptionLayout(
  containerWidth: number,
  iconWidth: number,
  gap: number,
  cardCount: number
): TabletopOptionLayout {
  if (cardCount <= 0 || containerWidth <= 0 || iconWidth <= 0) {
    return { visibleCount: 0, hiddenCount: Math.max(0, cardCount) };
  }
  const safeGap = Math.max(0, gap);
  const capacity = Math.max(
    1,
    Math.floor((containerWidth + safeGap) / (iconWidth + safeGap))
  );
  if (cardCount <= capacity) return { visibleCount: cardCount, hiddenCount: 0 };
  const visibleCount = Math.max(0, capacity - 1);
  return { visibleCount, hiddenCount: cardCount - visibleCount };
}
