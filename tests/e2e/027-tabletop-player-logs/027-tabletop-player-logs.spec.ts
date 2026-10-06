import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
}

async function expectAlignedLogs(page: Page) {
  await settleAnimations(page);
  const geometry = await page.locator('[data-log-seat]').evaluateAll((logs) => logs.map((log) => {
    const seat = document.querySelector(`[data-seat="${log.getAttribute('data-log-seat')}"]`)!;
    const mat = seat.getBoundingClientRect();
    const reader = log.querySelector('.reader')!.getBoundingClientRect();
    const board = document.querySelector('.course-wrap')!.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(document.querySelector('.table')!).columnGap);
    const left = Number(log.getAttribute('data-log-seat')) <= 4;
    return {
      y: Math.abs(mat.y - reader.y), height: Math.abs(mat.height - reader.height),
      matGap: left ? reader.left - mat.right : mat.left - reader.right,
      boardGap: left ? board.left - reader.right : reader.left - board.right,
      gap
    };
  }));
  expect(geometry).toHaveLength(8);
  for (const bounds of geometry) {
    expect(bounds.y).toBeLessThan(1);
    expect(bounds.height).toBeLessThan(1);
    expect(Math.abs(bounds.matGap - bounds.gap)).toBeLessThan(1);
    expect(Math.abs(bounds.boardGap - bounds.gap)).toBeLessThan(1);
  }
}

test('each player has a rotating mat and an independent full-width log', async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'A shared tabletop is reviewed at desktop and 4K sizes.');
  const contexts = [];
  const names = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Edsger', 'Barbara', 'Donald'];
  const robots = ['Axle', 'Bit', 'Cog', 'Dash', 'Flux', 'Gizmo', 'Hex', 'Rivet'];
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Tabletop mats and personal logs', 'Eight ordinary phone joins start an Option Lab race. Every player has a square rotating mat, face-down registers, Options below the registers, and an independently expandable log filling the space beside the board.');
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/tt/?e2eIdentity=TABLE&e2eRoomCode=T27LOG&course=option-lab&seed=PLAYER-LOGS');
    const phones = [];
    for (const [index, name] of names.entries()) {
      const join = page.getByRole('link', { name: `Join tabletop T27LOG at position ${index + 1}` });
      await expect(join).toBeVisible();
      const url = await join.getAttribute('href');
      const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await phone.goto(`${url}&e2eIdentity=${name.toUpperCase()}`);
      await phone.getByLabel('Racer name').fill(name);
      await phone.getByRole('button', { name: robots[index] }).click();
      await phone.getByRole('button', { name: `CLAIM POSITION ${index + 1}` }).click();
      await expect(page.locator(`[data-seat="${index + 1}"]`)).toContainText(name);
    }
    await page.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    for (const phone of phones) await phone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await expect(page.locator('[data-log-seat]')).toHaveCount(8);
    await steps.step('collapsed-personal-logs', {
      description: 'Each seat has a face-down Program, an Option, and a collapsed current-action log',
      verifications: [{ spec: 'Eight mats retain private registers, hide unused joins, and put Options after registers', check: async () => {
        await expect(page.getByRole('link', { name: /Join tabletop/ })).toHaveCount(0);
        await expect(page.locator('.flip-card:not(.face-up)')).toHaveCount(40);
        await expect(page.locator('.toggle-log[aria-expanded="false"]')).toHaveCount(8);
        await expect(page.locator('[data-option-icon]')).toHaveCount(8);
        for (const [index, name] of names.entries()) {
          const mat = page.locator(`[data-seat="${index + 1}"]`);
          await expect(mat.getByRole('img', { name: robots[index], exact: true })).toBeVisible();
          await expect(page.getByLabel(`${name}'s game log`)).toContainText('Choose your Program on your phone.');
          expect(await mat.evaluate((node) => !!(node.querySelector('.program-cards')!.compareDocumentPosition(node.querySelector('.tabletop-option-shelf')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        }
        await expectAlignedLogs(page);
      }}]
    });
    const adaLog = page.getByLabel("Ada's game log");
    await adaLog.getByRole('button', { name: "Show Ada's turn log" }).click();
    await expect(page.locator('.toggle-log[aria-expanded="true"]')).toHaveCount(1);
    for (const name of names.slice(1)) await page.getByRole('button', { name: `Show ${name}'s turn log` }).click();
    await page.getByRole('button', { name: 'Rotate Ada card clockwise' }).click();
    await expectAlignedLogs(page);
    await expect(page.locator('[data-seat="1"]')).toHaveCSS('transform', 'matrix(0, -1, 1, 0, 0, 0)');
    await steps.step('expanded-and-rotated-logs', {
      description: 'All logs can open independently and remain aligned after rotating a player mat',
      verifications: [{ spec: 'Expanded logs use every available horizontal pixel while leaving the board clear', check: async () => {
        await expect(page.getByRole('region', { name: 'Running turn log', exact: true })).toHaveCount(8);
        await expectAlignedLogs(page);
      }}]
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Rotate Ada card clockwise' }).click();
    await expect(page.locator('[data-seat="1"]')).toHaveCSS('transition-duration', '0s');
    await expect(adaLog.locator('.reader')).toHaveCSS('transition-duration', '0s');
    for (const viewport of [{ width: 1280, height: 1000 }, { width: 3840, height: 2160 }]) {
      await page.setViewportSize(viewport);
      await expectAlignedLogs(page);
    }
    steps.generateDocs();
  } finally {
    for (const context of contexts) await context.close();
  }
});
