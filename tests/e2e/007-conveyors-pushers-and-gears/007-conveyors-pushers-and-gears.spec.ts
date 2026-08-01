import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

async function chooseProgram(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
}

async function join(
  context: BrowserContext,
  roomCode: string,
  identity: string,
  name: string,
  robot: string
) {
  const page = await context.newPage();
  await page.goto(`/?room=${roomCode}&e2eIdentity=${identity}`);
  await expect(page.getByRole('status')).toHaveAttribute('data-status', 'synced');
  await page.getByLabel('Racer name').fill(name);
  await page.getByRole('button', { name: robot }).click();
  await page.getByRole('button', { name: 'Claim seat' }).click();
  return page;
}

test('board phases resolve conveyors, dependency conflicts, and gears atomically', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R7PHON' : 'R7DESK';
  let graceContext: BrowserContext | undefined;
  let linusContext: BrowserContext | undefined;

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    graceContext = await browser.newContext();
    linusContext = await browser.newContext();
    const grace = await join(graceContext, roomCode, 'GRACE', 'Grace', 'Bit');
    const linus = await join(linusContext, roomCode, 'LINUS', 'Linus', 'Cog');
    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Resolve conveyors, conflicts, pushers, and gears',
      'Three ordinary Programs reach normal and express conveyors, a counterclockwise gear, and a simultaneous occupancy dependency. The same atomic board solver also has generic register-pusher and curve fixtures because reviewed Exchange prints neither pushers nor curved belts.'
    );

    await host.getByLabel('Setup seed').fill('BOARD3-0');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await grace.getByRole('button', { name: 'Ready for race' }).click();
    await linus.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    for (const page of [host, grace, linus]) {
      await page.getByRole('button', { name: 'Open programming console' }).click();
    }
    await stayActiveInDockOrder([host, grace, linus]);

    await chooseProgram(host, [
      'rotate-left priority 400',
      'rotate-left priority 380',
      'rotate-left priority 240',
      'rotate-left priority 80',
      'move-2 priority 730'
    ]);
    await chooseProgram(grace, [
      'move-1 priority 570',
      'rotate-left priority 200',
      'move-1 priority 560',
      'u-turn priority 40',
      'u-turn priority 30'
    ]);
    await chooseProgram(linus, [
      'move-2 priority 670',
      'move-3 priority 820',
      'rotate-left priority 140',
      'move-2 priority 740',
      'u-turn priority 10'
    ]);

    await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await expect(grace.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await expect(linus.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await steps.step('atomic-board-phases-resolved', {
      description: 'Express, normal, conflict, and gear microsteps converge for all racers',
      verifications: [
        {
          spec: 'Linus rides a normal conveyor onto a counterclockwise gear',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Linus rode the conveyor to (4,9)');
            await expect(trace).toContainText(
              'Linus rotated counterclockwise from north to west'
            );
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'An express substep hands Linus to the normal-conveyor substep',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Linus rode the express conveyor to (6,10)');
            await expect(trace).toContainText('Linus rode the conveyor to (6,11)');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Docking Bay B resolves the conveyor chain without a conflicting rider',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Linus rode the conveyor to (6,13)');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'All clients converge on the atomic final cells and facings',
          check: async () => {
            await expect(host.locator('[data-coordinate="6,14"] .race-robot')).toHaveAttribute(
              'title',
              /Ada, Axle, facing north/
            );
            await expect(grace.locator('[data-coordinate="7,15"] .race-robot')).toHaveAttribute(
              'title',
              /Grace, Bit, facing west/
            );
            await expect(linus.locator('[data-coordinate="6,13"] .race-robot')).toHaveAttribute(
              'title',
              /Linus, Cog, facing west/
            );
          }
        },
        {
          spec: 'The selected course truthfully reports zero printed pushers',
          check: async () => {
            await expect(host.locator('.pusher')).toHaveCount(0);
            await expect(host.getByText(/Exchange prints no pushers/)).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await graceContext?.close();
    await linusContext?.close();
  }
});
