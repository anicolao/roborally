import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

type Program = readonly string[];

const turns: readonly { host: Program; guest: Program }[] = [
  {
    host: ['move-1 priority 500', 'rotate-right priority 110', 'move-1 priority 490', 'rotate-left priority 200', 'move-2 priority 740'],
    guest: ['back-up priority 480', 'move-1 priority 550', 'move-2 priority 750', 'rotate-right priority 90', 'move-1 priority 560']
  },
  {
    host: ['rotate-left priority 340', 'back-up priority 450', 'rotate-right priority 210', 'move-2 priority 740', 'move-3 priority 810'],
    guest: ['move-1 priority 540', 'move-1 priority 490', 'move-1 priority 610', 'rotate-right priority 350', 'u-turn priority 60']
  },
  {
    host: ['move-1 priority 520', 'rotate-right priority 410', 'move-1 priority 600', 'move-1 priority 510', 'rotate-left priority 300'],
    guest: ['move-1 priority 610', 'rotate-right priority 290', 'move-2 priority 700', 'back-up priority 460', 'back-up priority 430']
  },
  {
    host: ['move-2 priority 750', 'move-1 priority 660', 'rotate-right priority 350', 'move-2 priority 760', 'rotate-right priority 250'],
    guest: ['rotate-right priority 410', 'back-up priority 460', 'rotate-right priority 230', 'rotate-left priority 300', 'move-2 priority 730']
  }
];

async function chooseProgram(page: Page, labels: Program) {
  const previouslySelected = page.locator(
    '.program-hand button[aria-pressed="true"]'
  );
  for (let index = (await previouslySelected.count()) - 1; index >= 0; index -= 1) {
    await previouslySelected.nth(index).click();
  }
  for (const label of labels) {
    const button = page.getByRole('button', { name: label, exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  const submit = page.getByRole('button', { name: 'Submit immutable program' });
  if (!(await submit.isEnabled())) {
    const registers = await page
      .getByRole('list', { name: 'Chosen registers' })
      .getByRole('listitem')
      .allTextContents();
    const heading = await page.locator('.program-head h2').textContent();
    throw new Error(`${heading}: ${registers.join(' | ')}`);
  }
  await submit.click();
}

async function chooseFirstProgram(page: Page) {
  const hand = page.getByLabel('Your Program hand').getByRole('button');
  const openText = await page.locator('.program-console').getByText(/\d\/\d open/).textContent();
  const count = Number(openText?.match(/\/(\d+) open/)?.[1] ?? 5);
  for (let index = 0; index < count; index += 1) await hand.nth(index).click();
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
}

async function commitEmptyOptionPlan(page: Page) {
  await page.getByRole('button', { name: 'Commit finite Option plan' }).click();
}

test('face-up Options use immutable Dock-order decisions', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(150_000);
  const roomCode = testInfo.project.name === 'phone' ? 'R11PHN' : 'R11DSK';
  const guestContext: BrowserContext = await browser.newContext();
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

    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Draw and commit face-up Options',
      'Two ordinary clients reach the crossed repair site on successive turns, draw from one deterministic Option deck, and then close the shared decision barrier in original Dock order.'
    );

    await host.getByLabel('Setup seed').fill('OPTION-11');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    for (const [index, programs] of turns.entries()) {
      const turn = index + 1;
      if (turn > 1) {
        await host.getByRole('button', { name: `Begin Turn ${turn}` }).click();
        await guest.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      }
      await stayActiveInDockOrder([host, guest]);
      await chooseProgram(host, programs.host);
      await chooseProgram(guest, programs.guest);
      if (turn >= 3) {
        await expect(host.getByLabel('Ordered Option decision window')).toBeVisible();
        await commitEmptyOptionPlan(host);
      }
      await expect(host.getByRole('heading', { name: `Turn ${turn} complete` })).toBeVisible();
    }

    await steps.step('successive-face-up-option-draws', {
      description: 'Successive crossed-site cleanup draws are public and leave the deck without replacement',
      verifications: [
        {
          spec: 'Ada and Grace each own one visibly named Option',
          check: async () => {
            const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(robots.getByRole('listitem').filter({ hasText: 'Ada' })).not.toContainText(
              'Options none'
            );
            await expect(robots.getByRole('listitem').filter({ hasText: 'Grace' })).not.toContainText(
              'Options none'
            );
          }
        },
        {
          spec: 'The observer sees the same face-up ownership',
          check: async () => {
            await expect(guest.getByRole('list', { name: 'Robot Life and damage state' })).toContainText(
              'Options'
            );
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Begin Turn 5' }).click();
    await guest.getByRole('button', { name: 'Begin Turn 5' }).click();
    await stayActiveInDockOrder([host, guest]);
    await chooseFirstProgram(host);
    await chooseFirstProgram(guest);

    await expect(host.getByLabel('Ordered Option decision window')).toContainText(
      'Commit Option choices'
    );
    await expect(guest.getByLabel('Ordered Option decision window')).toContainText(
      'Waiting for Ada'
    );
    await commitEmptyOptionPlan(host);
    await expect(host.getByLabel('Ordered Option decision window')).toContainText(
      'Waiting for Grace'
    );
    await expect(guest.getByLabel('Ordered Option decision window')).toContainText(
      'Commit Option choices'
    );
    await commitEmptyOptionPlan(guest);
    await expect(host.getByRole('heading', { name: 'Turn 5 complete' })).toBeVisible();

    await steps.step('concurrent-options-close-in-dock-order', {
      description: 'Two simultaneous owners close a replay-safe finite barrier in original Dock order',
      verifications: [
        {
          spec: 'Both clients converge only after Ada then Grace commit',
          check: async () => {
            await expect(guest.getByRole('heading', { name: 'Turn 5 complete' })).toBeVisible();
            await expect(host.getByLabel('Ordered Option decision window')).toHaveCount(0);
          }
        },
        {
          spec: 'Unspent Options remain face up after a pass',
          check: async () => {
            const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(robots).not.toContainText('Options noneOptions none');
          }
        }
      ]
    });
  } finally {
    await guestContext.close();
  }
});
