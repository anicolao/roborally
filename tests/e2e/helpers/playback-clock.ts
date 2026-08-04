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
      page.evaluate(() => window.__roborallyE2ePlaybackClock?.runAll?.() ?? 0)
    )
  );
  expect(fired.every((count) => count > 0)).toBe(true);
}
