import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('five players configure and enter the Factory Rejects scenario', async ({
  browser,
  page
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'F8PHON' : 'F8DESK';
  const contexts: BrowserContext[] = [];
  const guests: Page[] = [];
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Play the Factory Rejects scenario',
    'Five isolated players select the reviewed expert course. The immutable setup compiles Chop Shop with Docking Bay B, deals damage-reduced hands, and removes power down.'
  );

  try {
    await page.goto(`/?e2eIdentity=REJECT-HOST&e2eRoomCode=${roomCode}`);
    await expect(page.getByRole('status')).toHaveText('Firebase emulator ready');
    await page.getByRole('button', { name: 'Create race' }).click();
    await page.getByLabel('Racer name').fill('Ada');
    await page.getByRole('button', { name: 'Axle' }).click();
    await page.getByRole('button', { name: 'Create and claim seat' }).click();

    const guestData = [
      ['Grace', 'Bit'],
      ['Lin', 'Cog'],
      ['Edsger', 'Dash'],
      ['Frank', 'Flux']
    ] as const;
    for (const [index, [name, robot]] of guestData.entries()) {
      const context = await browser.newContext();
      contexts.push(context);
      const guest = await context.newPage();
      guests.push(guest);
      await guest.goto(`/?room=${roomCode}&e2eIdentity=REJECT-${index + 1}`);
      await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
      await guest.getByLabel('Racer name').fill(name);
      await guest.getByRole('button', { name: robot }).click();
      await guest.getByRole('button', { name: 'Claim seat' }).click();
    }

    await expect(
      page.getByRole('list', { name: 'Race room players' }).locator('li.claimed')
    ).toHaveCount(5);
    await page.getByLabel('Course', { exact: true }).selectOption('factory-rejects');
    await page.getByLabel('Setup seed').fill('REJECTS-5');
    await page.getByRole('button', { name: 'Configure Factory Rejects' }).click();
    await expect(guests[0].getByText(/Factory Rejects · seed REJECTS-5/)).toBeVisible();

    for (const guest of guests) {
      await guest.getByRole('button', { name: 'Ready for race' }).click();
    }
    await expect(page.getByText('4/5 racers ready')).toBeVisible();
    await page.getByRole('button', { name: 'Ready for race' }).click();

    await expect(page.getByRole('heading', { name: 'Factory Rejects' })).toBeVisible();
    await steps.step('factory-rejects-board', {
      description: 'Factory Rejects compiles its own board and setup rules',
      verifications: [
        {
          spec: 'The immutable setup identifies Factory Rejects and its two starting damage',
          check: async () => {
            await expect(page.getByRole('heading', { name: 'Factory Rejects' })).toBeVisible();
            await expect(page.locator('.your-robot')).toContainText('Axle');
            await expect(page.locator('.race-robot.current-player')).toHaveCount(1);
            await expect(
              page.getByText(/Factory Rejects begins each robot at 2 damage/)
            ).toBeVisible();
          }
        },
        {
          spec: 'Chop Shop, Docking Bay B, all three flags, and all five robots render from compiled geometry',
          check: async () => {
            await expect(page.locator('[data-coordinate="4,3"] .pit')).toHaveText('PIT');
            await expect(page.locator('[data-coordinate="1,15"] .conveyor')).toBeVisible();
            await expect(page.locator('.course-flag')).toHaveText(['1', '3', '2']);
            await expect(page.locator('.race-robot')).toHaveCount(5);
          }
        },
        {
          spec: 'Every observer converges on the same course and five-robot setup',
          check: async () => {
            await expect(guests[0].getByRole('heading', { name: 'Factory Rejects' })).toBeVisible();
            await expect(guests[0].locator('.your-robot')).toContainText('Bit');
            await expect(guests[0].locator('.race-robot.current-player')).toHaveCount(1);
            await expect(guests[0].locator('.race-robot')).toHaveCount(5);
          }
        }
      ]
    });

    await page.getByRole('button', { name: 'Open programming console' }).click();
    await expect(page.getByRole('heading', { name: 'Your hand · 7' })).toBeVisible();
    await steps.step('damage-reduced-programming', {
      description: 'Starting damage changes programming and removes power down',
      verifications: [
        {
          spec: 'Starting at two damage deals every player seven Program cards',
          check: async () => {
            await expect(page.getByRole('heading', { name: 'Your hand · 7' })).toBeVisible();
            await expect(page.locator('.program-hand > button')).toHaveCount(7);
          }
        },
        {
          spec: 'The power-down decision control is replaced by the scenario prohibition',
          check: async () => {
            await expect(page.locator('[data-power-down-disabled]')).toContainText(
              'power down unavailable'
            );
            await expect(page.getByLabel('Ordered power-down control')).toHaveCount(0);
          }
        },
        {
          spec: 'Every observer receives the same damage-reduced seven-card hand',
          check: async () => {
            await guests[0].getByRole('button', { name: 'Open programming console' }).click();
            await expect(guests[0].getByRole('heading', { name: 'Your hand · 7' })).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
