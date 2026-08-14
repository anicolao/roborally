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
        { timeout: 30_000 }
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
  const inspect = (page: Page) =>
    page.evaluate(() => {
      const pending = window.__roborallyE2ePlaybackClock?.pending?.() ?? 0;
      const decision = Boolean(
        document.querySelector(
          '[data-decision-id], [aria-label="Destroyed robot Option loss"], [aria-label="Re-entry facing"]'
        )
      );
      const tabletop = document.querySelector<HTMLElement>('[data-e2e-tabletop]');
      if (tabletop) {
        const cursor = Number(tabletop.dataset.presentationCursor ?? -1);
        const frameCount = Number(tabletop.dataset.presentationFrameCount ?? -1);
        const timelineIndex = Number(tabletop.dataset.presentationTimelineIndex ?? -1);
        const timelineCount = Number(tabletop.dataset.presentationTimelineCount ?? -1);
        const settled =
          tabletop.dataset.presentationServerHead === 'true' &&
          tabletop.dataset.presentationBusy === 'false' &&
          frameCount > 0 &&
          cursor >= frameCount &&
          timelineIndex >= timelineCount;
        const waitingForDecision = Boolean(
          tabletop.querySelector('[data-testid="tabletop-damage-prompt"]')
        );
        return {
          pending,
          stopped: settled || (waitingForDecision && frameCount > 0 && cursor >= frameCount)
        };
      }
      if (location.pathname.endsWith('/tt/')) return { pending, stopped: false };
      // Controller pages do not own the shared animation timeline. Once their own
      // transient timer queue is empty, only a tabletop can have playback left to drain.
      return { pending, stopped: decision || pending === 0 };
    });

  for (let advance = 0; advance < 500; advance += 1) {
    let states: Awaited<ReturnType<typeof inspect>>[] = [];
    await expect
      .poll(async () => {
        states = await Promise.all(pages.map(inspect));
        return states.every(({ pending, stopped }) => pending > 0 || stopped);
      })
      .toBe(true);

    if (states.every(({ stopped }) => stopped)) return;

    await Promise.all(
      pages.map((page, index) =>
        states[index]?.pending
          ? page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.() ?? 0)
          : Promise.resolve(0)
      )
    );
  }

  throw new Error('Synthetic playback did not reach a decision or a settled turn');
}
