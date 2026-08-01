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

test('post-board laser snapshots apply damage and lock exact registers', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R8PHON' : 'R8DESK';
  const contexts: BrowserContext[] = [];

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=risky-exchange-a`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    for (let index = 0; index < 3; index += 1) contexts.push(await browser.newContext());
    const grace = await join(contexts[0], roomCode, 'GRACE', 'Grace', 'Bit');
    const linus = await join(contexts[1], roomCode, 'LINUS', 'Linus', 'Cog');
    const margaret = await join(contexts[2], roomCode, 'MARGARET', 'Margaret', 'Dash');
    const pages = [host, grace, linus, margaret];
    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Resolve lasers, damage, and locked registers',
      'Four ordinary Programs create repeated unobstructed robot-laser snapshots. Margaret receives six damage, locking registers 4 and 5 with their exact card IDs; owner and observer clients converge on the same public result.'
    );

    await host.getByLabel('Setup seed').fill('LASER4-0');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    for (const page of [grace, linus, margaret]) {
      await page.getByRole('button', { name: 'Ready for race' }).click();
    }
    await host.getByRole('button', { name: 'Ready for race' }).click();
    for (const page of pages) {
      await page.getByRole('button', { name: 'Open programming console' }).click();
    }
    await stayActiveInDockOrder(pages);

    await chooseProgram(host, [
      'u-turn priority 60',
      'rotate-right priority 350',
      'u-turn priority 30',
      'rotate-right priority 290',
      'rotate-right priority 250'
    ]);
    await chooseProgram(grace, [
      'move-1 priority 630',
      'move-1 priority 590',
      'u-turn priority 50',
      'rotate-left priority 400',
      'back-up priority 450'
    ]);
    await chooseProgram(linus, [
      'move-3 priority 840',
      'rotate-left priority 360',
      'move-2 priority 700',
      'move-2 priority 690',
      'back-up priority 460'
    ]);
    await chooseProgram(margaret, [
      'move-3 priority 820',
      'rotate-right priority 110',
      'move-1 priority 530',
      'rotate-left priority 380',
      'rotate-right priority 150'
    ]);

    for (const page of pages) {
      await expect(page.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    }
    await steps.step('laser-damage-locks-resolved', {
      description: 'One snapshot per register locks Margaret’s final two registers',
      verifications: [
        {
          spec: 'Robot rays stop at the first visible target after board movement',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText(
              'Margaret fired through clear line of sight and hit Linus'
            );
            await expect(trace).toContainText(
              'Linus fired through clear line of sight and hit Margaret'
            );
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Multiple rays use the same target snapshot before damage is applied',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText(
              'Grace fired through clear line of sight and hit Margaret'
            );
            await expect(trace).toContainText('Margaret took one damage and now has 6');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Six damage locks registers 4 and 5 with their revealed cards retained',
          check: async () => {
            const state = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(state).toContainText(
              'Margaret active · 3 Lives · 6 Damage · Locked R4/R5'
            );
            const margaretVitals = await state
              .getByRole('listitem')
              .filter({ hasText: /^Margaret/ })
              .locator('.robot-vitals')
              .boundingBox();
            const adaVitals = await state
              .getByRole('listitem')
              .filter({ hasText: /^Ada/ })
              .locator('.robot-vitals')
              .boundingBox();
            expect(margaretVitals).not.toBeNull();
            expect(adaVitals).not.toBeNull();
            expect(Math.abs((margaretVitals?.y ?? 0) - (adaVitals?.y ?? 0))).toBeLessThan(1);
          }
        },
        {
          spec: 'Owner and observer views converge on public damage and lock state',
          check: async () => {
            await expect(
              margaret.getByRole('list', { name: 'Robot Life and damage state' })
            ).toContainText('Margaret active · 3 Lives · 6 Damage · Locked R4/R5');
            await expect(
              grace.getByRole('list', { name: 'Robot Life and damage state' })
            ).toContainText('Linus active · 3 Lives · 3 Damage');
          }
        },
        {
          spec: 'The UI exposes the fully locked repeat invariant',
          check: async () => {
            await expect(host.getByText(/Damage 9 repeats all five locked registers/)).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
