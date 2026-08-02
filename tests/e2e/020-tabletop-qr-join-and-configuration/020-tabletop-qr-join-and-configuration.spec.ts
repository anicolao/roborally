import { expect, test } from '@playwright/test';

async function submitVisibleProgram(page: import('@playwright/test').Page) {
  const cards = page.locator('.hand button');
  const lockProgram = page.getByRole('button', { name: 'Lock program' });
  for (let index = 0; index < await cards.count(); index += 1) {
    await cards.nth(index).click();
    if (await lockProgram.isEnabled()) break;
  }
  await lockProgram.click();
}

async function completePrivateResolutionChoices(
  pages: import('@playwright/test').Page[]
) {
  await expect.poll(async () => {
    for (const page of pages) {
      const optionLoss = page.getByLabel('Destroyed robot Option loss').getByRole('button');
      if (await optionLoss.first().isVisible()) {
        await optionLoss.first().click();
        return false;
      }

      const reentry = page.getByLabel('Re-entry cell and facing');
      if (await reentry.isVisible()) {
        await reentry.selectOption({ index: 1 });
        await page.getByRole('button', { name: 'CONFIRM RE-ENTRY' }).click();
        return false;
      }
    }
    const nextTurnVisible = await Promise.all(
      pages.map((page) => page.getByRole('button', { name: 'BEGIN TURN 2' }).isVisible())
    );
    return nextTurnVisible.every(Boolean);
  }, { timeout: 30_000 }).toBe(true);
}

test('the tabletop owns configuration and seat QR codes open private controllers', async ({
  browser,
  page: table
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'T20PHN' : 'T20DSK';
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPhone = await firstContext.newPage();
  const secondPhone = await secondContext.newPage();

  try {
    await table.goto(`/tt/?e2eIdentity=TABLE&e2eRoomCode=${roomCode}`);
    await expect(table.locator('header').getByText(roomCode, { exact: true })).toBeVisible();
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
    await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
    await expect(table.getByRole('button', { name: 'CONFIGURE RACE' })).toBeDisabled();

    const positionSevenUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 7` })
      .getAttribute('href');
    const positionTwoUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 2` })
      .getAttribute('href');
    expect(positionSevenUrl).toContain(`/hand/?room=${roomCode}&seat=7`);
    expect(positionTwoUrl).toContain(`/hand/?room=${roomCode}&seat=2`);

    await firstPhone.goto(`${positionSevenUrl}&e2eIdentity=ADA`);
    await expect(firstPhone.getByRole('heading', { name: 'D07' })).toBeVisible();
    await firstPhone.getByLabel('Racer name').fill('Ada');
    await firstPhone.getByRole('button', { name: 'Axle' }).click();
    await firstPhone.getByRole('button', { name: 'CLAIM POSITION 7' }).click();
    await expect(firstPhone.getByRole('heading', { name: 'Ada' })).toBeVisible();

    await secondPhone.goto(`${positionTwoUrl}&e2eIdentity=GRACE`);
    await expect(secondPhone.getByRole('heading', { name: 'D02' })).toBeVisible();
    await secondPhone.getByLabel('Racer name').fill('Grace');
    await secondPhone.getByRole('button', { name: 'Bit' }).click();
    await secondPhone.getByRole('button', { name: 'CLAIM POSITION 2' }).click();
    await expect(secondPhone.getByRole('heading', { name: 'Grace' })).toBeVisible();

    await expect(table.locator('[data-seat="7"]')).toContainText('Ada');
    await expect(table.locator('[data-seat="2"]')).toContainText('Grace');
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(6);

    await table.getByLabel('Course', { exact: true }).selectOption('risky-exchange');
    await table.getByLabel('Setup seed').fill('TABLETOP-E2E');
    await table.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    await expect(table.getByText('Risky Exchange · seed TABLETOP-E2E · 3 lives')).toBeVisible();

    await firstPhone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await secondPhone.getByRole('button', { name: 'READY FOR RACE' }).click();

    const courseBoard = table.getByRole('grid', {
      name: 'Risky Exchange course board, rotated 90 degrees'
    });
    await expect(courseBoard).toBeVisible();
    await expect(courseBoard).toHaveAttribute('data-tabletop-orientation', 'rotated');
    const courseBounds = await courseBoard.boundingBox();
    expect(courseBounds).not.toBeNull();
    expect(courseBounds!.width).toBeGreaterThan(courseBounds!.height);
    await expect(table.getByRole('heading', { name: 'Risky Exchange' })).toHaveCount(0);
    await expect(table.getByLabel('Board view controls')).toHaveCount(0);
    await expect(table.getByText('Course text equivalent')).toHaveCount(0);
    const adaSeat = table.locator('[data-seat="7"]');
    await expect(adaSeat.locator('[data-player-vitals]')).toHaveAttribute(
      'aria-label',
      /3 of 3 lives remaining, 0 damage taken and 10 damage not yet taken, active power/
    );
    await expect(adaSeat.locator('.life-track i.remaining')).toHaveCount(3);
    await expect(adaSeat.locator('.damage-track i.available')).toHaveCount(10);
    await expect(adaSeat.locator('.power-state')).toContainText('ACTIVE');
    await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(firstPhone.getByLabel('Course')).toHaveCount(0);
    await expect(secondPhone.getByLabel('Course')).toHaveCount(0);

    await submitVisibleProgram(firstPhone);
    await submitVisibleProgram(secondPhone);

    await expect(table.getByTestId('tabletop-program-countdown')).toBeVisible();
    await expect(table.getByTestId('tabletop-register-playback')).toBeVisible();
    await expect(table.getByTestId('tabletop-register-playback')).toHaveAttribute(
      'data-stage',
      'program-card'
    );
    await expect(table.locator('.program-card.revealed')).toHaveCount(10);
    await completePrivateResolutionChoices([firstPhone, secondPhone]);
    await expect.poll(() => table.locator('.damage-track i.taken').count()).toBeGreaterThan(0);
    await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();

    await firstPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await secondPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await expect(firstPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expect(secondPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expect(firstPhone.locator('.hand button').first()).toBeEnabled();
    await expect(secondPhone.locator('.hand button').first()).toBeEnabled();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
