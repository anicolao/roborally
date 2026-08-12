import { expect, type Page } from '@playwright/test';

export async function enableSyntheticPlaybackClock(page: Page) {
  await page.addInitScript(() => {
    window.__roborallyE2ePlaybackClock = { enabled: true };
  });
}

export async function advanceSyntheticPlayback(pages: readonly Page[]) {
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0,
        undefined,
        { timeout: 10_000 }
      )
    )
  );

  const fired = await Promise.all(
    pages.map((page) =>
      page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.() ?? 0)
    )
  );
  expect(fired.every((count) => count > 0)).toBe(true);
}

export async function finishSyntheticPlayback(pages: readonly Page[]) {
  await expect.poll(async () => {
    const ready = await Promise.all(
      pages.map((page) =>
        page.evaluate(() => {
          if ((window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0) return true;
          if (
            document.querySelector(
              '[data-decision-id], [aria-label="Destroyed robot Option loss"], [aria-label="Re-entry facing"]'
            )
          ) return true;
          return [...document.querySelectorAll('h1, h2')].some(({ textContent }) =>
            /^Turn \d+ (complete|finished)$/.test(textContent?.trim() ?? '')
          );
        })
      )
    );
    return ready.every(Boolean);
  }).toBe(true);

  const fired = await Promise.all(
    pages.map((page) =>
      page.evaluate(() =>
        (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0
          ? window.__roborallyE2ePlaybackClock?.runAll?.() ?? 0
          : 0
      )
    )
  );
  void fired;
}
