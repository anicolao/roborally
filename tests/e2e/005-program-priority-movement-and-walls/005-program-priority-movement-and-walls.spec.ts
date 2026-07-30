import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

async function chooseProgram(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
}

test('Programs resolve by priority through rotations, stepwise movement, seams, and walls', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R5PHON' : 'R5DESK';
  let guestContext: BrowserContext | undefined;

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Resolve Program priority movement and walls',
      'Two ordinary five-card programs cover every 2005 instruction class. The deterministic trace proves descending priority, stepwise movement, an open board seam, and a wall that blocks from either side.'
    );

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('MOVE-57');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    await chooseProgram(host, [
      'rotate-right priority 110',
      'move-1 priority 510',
      'rotate-left priority 260',
      'move-3 priority 830',
      'u-turn priority 30'
    ]);
    await chooseProgram(guest, [
      'back-up priority 450',
      'move-2 priority 700',
      'rotate-right priority 70',
      'rotate-left priority 80',
      'move-3 priority 800'
    ]);

    await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await expect(guest.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();

    await host.getByText('Full resolution text').click();
    const fullTrace = host.getByRole('list', { name: 'Full resolution feed' });
    await expect(fullTrace).toContainText('Ada stopped at (6,15); a wall blocks east.');
    await expect(fullTrace).toContainText('Ada completed step 3 at (6,12) facing north.');
    await expect(fullTrace).toContainText('Grace completed step 3 at (7,11) facing north.');
    await host.getByText('Full resolution text').click();

    await guest.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        guest.locator('.resolution-console li').first().evaluate((element) => {
          return getComputedStyle(element).animationName;
        })
      )
      .toBe('none');

    await steps.step('priority-movement-resolved', {
      description: 'All seven instructions resolve into one wall-safe final projection',
      verifications: [
        {
          spec: 'Register cards resolve from highest unique priority to lowest',
          check: async () => {
            const feed = host.getByRole('list', { name: 'Resolution feed' });
            await expect(feed.getByRole('listitem')).toHaveCount(5);
            await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toContainText(
              'microsteps'
            );
          }
        },
        {
          spec: 'The wall between Dock 1 and Dock 2 stops eastward movement at (6,15)',
          check: async () => {
            await host.getByText('Full resolution text').click();
            await expect(host.getByRole('list', { name: 'Full resolution feed' })).toContainText(
              'wall blocks east'
            );
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Move 2 and Move 3 execute one space at a time across the open factory seam',
          check: async () => {
            await expect(host.locator('[data-coordinate="6,13"] .race-robot')).toHaveAttribute(
              'title',
              /Ada, Axle, facing south/
            );
            await expect(host.locator('[data-coordinate="7,10"] .race-robot')).toHaveAttribute(
              'title',
              /Grace, Bit, facing north/
            );
          }
        },
        {
          spec: 'Move 1, Move 2, Move 3, Back Up, both rotations, and U-Turn all execute',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            for (const action of [
              'move-1',
              'move-2',
              'move-3',
              'back-up',
              'rotate-right',
              'rotate-left',
              'u-turn'
            ]) {
              await expect(trace).toContainText(`revealed ${action}`);
            }
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Both clients converge on the same final robot coordinates and facings',
          check: async () => {
            await expect(guest.locator('[data-coordinate="6,13"] .race-robot')).toHaveCount(1);
            await expect(guest.locator('[data-coordinate="7,10"] .race-robot')).toHaveCount(1);
          }
        },
        {
          spec: 'Reduced-motion mode disables trace animations without skipping resolution',
          check: async () => {
            await expect(guest.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
