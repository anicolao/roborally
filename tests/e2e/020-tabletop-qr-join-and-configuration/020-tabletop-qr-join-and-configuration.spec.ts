import { expect, test } from '@playwright/test';

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

    await expect(table.getByRole('heading', { name: 'Risky Exchange' })).toBeVisible();
    await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(firstPhone.getByLabel('Course')).toHaveCount(0);
    await expect(secondPhone.getByLabel('Course')).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
