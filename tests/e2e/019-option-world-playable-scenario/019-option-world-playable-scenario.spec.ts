import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('players can configure the Option World scenario', async ({ browser, page: host }, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R19PHN' : 'R19DSK';
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const steps = new TestStepHelper(host, testInfo);
  steps.setMetadata(
    'Option World playable scenario',
    'Two isolated players configure the reviewed 2005 Option World course. The rendered scenario exposes four ordered flags, four crossed repair/Option sites, and both robots on the complete manifest.'
  );

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

    await steps.step('configured-option-world', {
      description: 'Both players enter the complete four-flag Option World course',
      verifications: [
        {
          spec: 'The host sees all four crossed repair/Option sites and all four flags',
          check: async () => {
            await expect(host.getByRole('heading', { name: 'Option World' })).toBeVisible();
            await expect(
              host.getByRole('gridcell', { name: /repair and Option site/ })
            ).toHaveCount(4);
            for (const flag of [1, 2, 3, 4]) {
              await expect(
                host.getByRole('gridcell', { name: new RegExp(`Flag ${flag}`) })
              ).toHaveCount(1);
            }
          }
        },
        {
          spec: 'Both robots render on the configured course',
          check: async () => {
            await expect(host.locator('.race-robot')).toHaveCount(2);
          }
        },
        {
          spec: 'The guest converges on the same Option World geometry',
          check: async () => {
            await expect(guest.getByRole('heading', { name: 'Option World' })).toBeVisible();
            await expect(
              guest.getByRole('gridcell', { name: /repair and Option site/ })
            ).toHaveCount(4);
            await expect(guest.getByRole('gridcell', { name: /Flag 4/ })).toHaveCount(1);
          }
        }
      ]
    });
    steps.generateDocs();
  } finally {
    await guestContext.close();
  }
});
