import { expect, test } from '@playwright/test';

test('players can configure the Option World scenario', async ({ browser, page: host }, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R19PHN' : 'R19DSK';
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Course', { exact: true }).selectOption('option-world');
    await host.getByLabel('Setup seed').fill('OPTION-WORLD-E2E');
    await host.getByRole('button', { name: 'Configure Option World' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();

    await expect(host.getByRole('heading', { name: 'Option World' })).toBeVisible();
    await expect(host.getByRole('gridcell', { name: /repair and Option site/ })).toHaveCount(4);
    await expect(host.getByRole('gridcell', { name: /Flag 1/ })).toHaveCount(1);
    await expect(host.getByRole('gridcell', { name: /Flag 2/ })).toHaveCount(1);
    await expect(host.getByRole('gridcell', { name: /Flag 3/ })).toHaveCount(1);
    await expect(host.getByRole('gridcell', { name: /Flag 4/ })).toHaveCount(1);
    await expect(host.locator('.race-robot')).toHaveCount(2);
    await expect(guest.getByRole('heading', { name: 'Option World' })).toBeVisible();
    await expect(guest.getByRole('gridcell', { name: /repair and Option site/ })).toHaveCount(4);
    await expect(guest.getByRole('gridcell', { name: /Flag 4/ })).toHaveCount(1);
  } finally {
    await guestContext.close();
  }
});
