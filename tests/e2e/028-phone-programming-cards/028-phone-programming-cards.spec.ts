import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { enableSyntheticPlaybackClock } from '../helpers/playback-clock';
import { rewindSubmissionDeadline } from '../helpers/program-deadline';

async function finishFlights(page: Page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations();
    for (const animation of animations) animation.finish();
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  await expect(page.locator('[data-card-flight]')).toHaveCount(0);
}

test('phones program with square cards, inspect Options, and call time together', async ({ browser, page: table }, testInfo) => {
  const room = testInfo.project.name === 'phone' ? 'P28PHN' : 'P28DSK';
  const contexts = await Promise.all([1, 2].map(() => browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true })));
  const [ada, grace] = await Promise.all(contexts.map((context) => context.newPage()));
  const steps = new TestStepHelper(ada, testInfo);
  steps.setMetadata('Graphical private programming and shared countdown', 'Two phones use square graphical cards, tap and touch-drag into registers, inspect owned Options, and observe the same deadline. A submitted player calls time after expiry, preserving the other player’s chosen registers.');
  try {
    await enableSyntheticPlaybackClock(table);
    await table.goto(`/tt/?e2eIdentity=TABLE&e2eRoomCode=${room}&course=option-lab&seed=PLAYER-LOGS`);
    for (const [index, phone] of [ada, grace].entries()) {
      const url = await table.getByRole('link', { name: `Join tabletop ${room} at position ${index + 1}` }).getAttribute('href');
      await phone.goto(`${url}&e2eIdentity=${index === 0 ? 'ADA' : 'GRACE'}`);
      await phone.getByLabel('Racer name').fill(index === 0 ? 'Ada' : 'Grace');
      await phone.getByRole('button', { name: index === 0 ? 'Axle' : 'Bit' }).click();
      await phone.getByRole('button', { name: `CLAIM POSITION ${index + 1}` }).click();
      await expect(table.locator(`[data-seat="${index + 1}"]`)).toContainText(index === 0 ? 'Ada' : 'Grace');
    }
    await table.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    for (const phone of [ada, grace]) await phone.getByRole('button', { name: 'READY FOR RACE' }).click();
    const hand = ada.getByLabel('Your Program hand');
    await expect(hand.getByRole('button')).toHaveCount(9);
    for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 568 }, { width: 852, height: 393 }]) {
      await ada.setViewportSize(viewport);
      await steps.step(`square-hand-${viewport.width}`, {
        status: 'skip', description: `Square cards and owned Options fit a ${viewport.width} × ${viewport.height} phone`,
        verifications: [{ spec: 'Graphical cards are square, visible, and accompanied by inspectable Options', check: async () => {
          await expect(ada.getByLabel('Your Options').getByRole('button', { name: /View .* Option/ })).toBeVisible();
          const cards = await hand.locator('[data-card-id]').evaluateAll((nodes) => nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { width: rect.width, height: rect.height, bottom: rect.bottom };
          }));
          for (const card of cards) {
            expect(Math.abs(card.width - card.height)).toBeLessThan(1);
            expect(card.width).toBeGreaterThanOrEqual(40);
            expect(card.bottom).toBeLessThanOrEqual(viewport.height);
          }
          await expect(hand.locator('img.chassis')).toHaveCount(9);
        }}]
      });
    }
    await ada.setViewportSize({ width: 393, height: 852 });
    await ada.getByLabel('Your Options').getByRole('button', { name: /View .* Option/ }).click();
    await steps.step('inspect-owned-option', {
      status: 'skip', description: 'The phone opens the shared graphical Option viewer',
      verifications: [{ spec: 'The owner can read the Option and close its dialog', check: async () => {
        await expect(ada.getByRole('dialog', { name: 'Ada Option inspection' })).toBeVisible();
        await expect(ada.getByRole('dialog').locator('.option-card')).toBeVisible();
      }}]
    });
    await ada.getByRole('button', { name: 'Close Option inspection' }).click();
    const firstCard = await hand.getByRole('button').nth(0).getAttribute('aria-label');
    // Observe insertion rather than racing a 300ms animation on slower CI workers.
    const flightAppeared = ada.evaluate(() => new Promise<number>((resolve, reject) => {
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.hasAttribute('data-card-flight')) {
            clearTimeout(timeout);
            observer.disconnect();
            resolve(node.getBoundingClientRect().width);
          }
        }
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Tapping a card did not start its flight'));
      }, 5000);
      observer.observe(document.body, { childList: true });
    }));
    await hand.getByRole('button').nth(0).tap();
    expect(await flightAppeared).toBeGreaterThan(0);
    await expect(ada.getByRole('button', { name: `Register 1, ${firstCard}`, exact: true })).toBeVisible();
    await finishFlights(ada);

    const secondCard = await hand.getByRole('button').nth(1).getAttribute('aria-label');
    const source = (await hand.getByRole('button').nth(1).boundingBox())!;
    const target = (await ada.getByRole('button', { name: 'Register 3, empty', exact: true }).boundingBox())!;
    const touch = await ada.context().newCDPSession(ada);
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await expect(ada.locator('.drag-card')).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(ada.getByRole('button', { name: `Register 3, ${secondCard}`, exact: true })).toBeVisible();
    await expect(ada.locator('.drag-card')).toHaveCount(0);
    await finishFlights(ada);
    await touch.detach();

    await ada.emulateMedia({ reducedMotion: 'reduce' });
    await hand.getByRole('button').nth(2).tap();
    await expect(ada.locator('[data-card-flight]')).toHaveCount(0);
    await expect(ada.getByRole('button', { name: /^Register 2, (?!empty)/ })).toBeVisible();
    await steps.step('tap-and-drag-registers', {
      status: 'skip', description: 'Tapped and dragged cards occupy their chosen registers without revealing the other phone’s program',
      verifications: [{ spec: 'Three registers retain graphical cards and reduced motion skips the flight', check: async () => {
        await expect(ada.getByLabel('Chosen registers').locator('[data-card-id]')).toHaveCount(3);
        await expect(grace.getByLabel('Chosen registers').locator('[data-card-id]')).toHaveCount(0);
      }}]
    });
    // Reproduce a browser that delays its compatibility click beyond an animation frame.
    const delayedSource = hand.getByRole('button').nth(3);
    const delayedCard = await delayedSource.getAttribute('aria-label');
    const delayedFrom = (await delayedSource.boundingBox())!;
    const delayedTo = (await ada.getByRole('button', { name: 'Register 4, empty', exact: true }).boundingBox())!;
    const pointer = { pointerType: 'touch', pointerId: 77, isPrimary: true, button: 0, buttons: 1 };
    await delayedSource.dispatchEvent('pointerdown', { ...pointer, clientX: delayedFrom.x + delayedFrom.width / 2, clientY: delayedFrom.y + delayedFrom.height / 2 });
    const drop = { ...pointer, clientX: delayedTo.x + delayedTo.width / 2, clientY: delayedTo.y + delayedTo.height / 2 };
    await delayedSource.dispatchEvent('pointermove', drop);
    await delayedSource.dispatchEvent('pointerup', { ...drop, buttons: 0 });
    await expect(ada.getByRole('button', { name: `Register 4, ${delayedCard}`, exact: true })).toBeVisible();
    await ada.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await delayedSource.dispatchEvent('click', { detail: 1 });
    await expect(ada.getByRole('button', { name: `Register 4, ${delayedCard}`, exact: true })).toBeVisible();
    await ada.getByRole('button', { name: 'Register 5, empty', exact: true }).tap();
    await hand.getByRole('button').nth(4).tap();
    await ada.getByRole('button', { name: 'Lock program', exact: true }).click();
    await expect(ada.getByRole('timer')).toContainText(/Grace has \d+ seconds/);
    await expect(grace.getByRole('timer')).toContainText(/You have \d+ seconds/);
    await expect(ada.getByRole('button', { name: 'Call time on Grace' })).toBeDisabled();
    await expect(grace.getByRole('button', { name: /Call time/ })).toHaveCount(0);
    const graceCard = await grace.getByLabel('Your Program hand').getByRole('button').first().getAttribute('aria-label');
    await grace.getByLabel('Your Program hand').getByRole('button').first().tap();
    await finishFlights(grace);
    await expect(grace.getByRole('button', { name: `Register 1, ${graceCard}`, exact: true })).toBeVisible();
    await rewindSubmissionDeadline(room);
    await expect(ada.getByRole('button', { name: 'Call time on Grace' })).toBeEnabled();
    await steps.step('shared-expired-countdown', {
      status: 'skip', description: 'A player who has locked their program can call time after the shared countdown expires',
      verifications: [{ spec: 'Both phones show zero and only the other player can call time', check: async () => {
        await expect(ada.getByRole('timer')).toHaveText('Grace has 0 seconds');
        await expect(grace.getByRole('timer')).toHaveText('You have 0 seconds');
        await expect(ada.getByLabel('Locked Program')).toBeVisible();
        await expect(ada.locator('.identity')).toContainText('Your program is locked.');
        await expect(ada.getByLabel('Your Options')).toBeVisible();
      }}]
    });
    await ada.getByRole('button', { name: 'Call time on Grace' }).click();
    await expect(ada.getByRole('timer')).toHaveCount(0);
    await expect(grace.getByRole('timer')).toHaveCount(0);
    await expect(ada.getByLabel('Your Options')).toBeVisible();
    await ada.getByRole('button', { name: 'Keep programmed cards' }).click();
    await expect(grace.getByLabel('Locked Program').locator('[aria-label^="Register 1,"]')).toHaveAttribute('aria-label', `Register 1, ${graceCard}, ready`);
    await expect(grace.getByLabel('Locked Program').locator('[data-card-id]')).toHaveCount(5);
    steps.generateDocs();
  } finally { for (const context of contexts) await context.close(); }
});
