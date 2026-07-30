import { expect, test, type BrowserContext } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('host configures the exact seeded Risky Exchange setup', async (
  { browser, page },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R3PHON' : 'R3DESK';
  let guestContext: BrowserContext | undefined;
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Configure the reviewed Risky Exchange course',
    'Two isolated players commit a versioned 2005 configuration and readiness events. The resulting board and Dock order are derived only from the fixed seed and reviewed manifests.'
  );

  try {
    await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(page.getByRole('status')).toHaveText('Firebase emulator ready');
    await page.getByRole('button', { name: 'Create race' }).click();
    await page.getByLabel('Racer name').fill('Ada');
    await page.getByRole('button', { name: 'Axle' }).click();
    await page.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await page.getByLabel('Setup seed').fill('RISKY-6');
    await page.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await expect(guest.getByText(/Risky Exchange · seed RISKY-6/)).toBeVisible();

    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await expect(page.getByText('1/2 racers ready')).toBeVisible();
    await page.getByRole('button', { name: 'Ready for race' }).click();

    await expect(page.getByRole('heading', { name: 'Risky Exchange' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Risky Exchange' })).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByLabel('Board zoom')).toHaveText('125%');
    await page.getByRole('button', { name: 'Pan right' }).click();
    await page.getByRole('button', { name: 'Fit course' }).click();
    await expect(page.getByLabel('Board zoom')).toHaveText('100%');

    await page.getByText('Course text equivalent').click();

    await steps.step('seeded-risky-exchange', {
      description: 'The readiness barrier reveals one exact semantic setup',
      verifications: [
        {
          spec: 'Seed RISKY-6 selects Grace as first player at Dock 1 and Ada at Dock 2',
          check: async () => {
            const order = page.getByRole('list', { name: 'Original Dock order' });
            await expect(order.getByRole('listitem').nth(0)).toContainText('D1');
            await expect(order.getByRole('listitem').nth(0)).toContainText('Grace');
            await expect(order.getByRole('listitem').nth(0)).toContainText('first player');
            await expect(order.getByRole('listitem').nth(1)).toContainText('D2');
            await expect(order.getByRole('listitem').nth(1)).toContainText('Ada');
          }
        },
        {
          spec: 'Both robots begin with three Lives, face north, and archive on their Dock cells',
          check: async () => {
            await expect(page.getByText('3', { exact: true }).first()).toBeVisible();
            await expect(page.getByRole('list', { name: 'Original Dock order' })).toContainText(
              'facing north'
            );
            await expect(page.getByText(/archive begins on its Dock cell/i)).toBeVisible();
          }
        },
        {
          spec: 'The reviewed course exposes all three flags and both starting robots as semantic geometry',
          check: async () => {
            await expect(page.locator('.course-flag')).toHaveText(['1', '3', '2']);
            await expect(page.locator('.race-robot')).toHaveCount(2);
            await expect(page.locator('[data-coordinate="6,15"] .race-robot')).toHaveAttribute(
              'title',
              /Grace, Bit, facing north/
            );
          }
        },
        {
          spec: 'Pan, zoom, and fit controls return the board to a deterministic 100% view',
          check: async () => {
            await expect(page.getByLabel('Board zoom')).toHaveText('100%');
          }
        },
        {
          spec: 'A coordinate-based text equivalent identifies flags, Docks, and robots',
          check: async () => {
            await expect(page.getByText('Column 8, row 2: Flag 1')).toBeVisible();
            await expect(page.getByText(/Column 6, row 15: Dock 1, Grace's bit, facing north/)).toBeVisible();
            await page.getByText('Course text equivalent').click();
          }
        },
        {
          spec: 'The observer converges on the same first player and immutable setup',
          check: async () => {
            await expect(
              guest.getByRole('list', { name: 'Original Dock order' }).getByRole('listitem').first()
            ).toContainText('Grace');
            await expect(guest.locator('.race-robot')).toHaveCount(2);
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
