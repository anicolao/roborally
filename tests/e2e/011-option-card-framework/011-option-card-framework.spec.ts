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
  const clear = page.getByRole('button', { name: 'Clear register choices' });
  if (await clear.isVisible()) await clear.click();
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

test('face-up Options remain available for execution-time decisions', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(300_000);
  const roomCode = testInfo.project.name === 'phone' ? 'R11PHN' : 'R11DSK';
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=risky-exchange-a`);
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
      'Draw and retain face-up Options',
      'Two ordinary clients reach the crossed repair site on successive turns, draw from one deterministic Option deck, and retain those cards until an actual execution-time choice occurs.'
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
        await expect(host.getByLabel('Ordered Option decision window')).toHaveCount(0);
      }
      await expect(host.getByRole('heading', { name: `Turn ${turn} complete` })).toBeVisible();
    }

    await steps.step('successive-face-up-option-draws', {
      description: 'Successive crossed-site cleanup draws are public and leave the deck without replacement',
      verifications: [
        {
          spec: 'Ada and Grace each own one visibly named graphical Option',
          check: async () => {
            const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(
              robots.getByRole('listitem').filter({ hasText: 'Ada' }).locator('[data-card-id]')
            ).toHaveCount(1);
            await expect(
              robots.getByRole('listitem').filter({ hasText: 'Grace' }).locator('[data-card-id]')
            ).toHaveCount(1);
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
    const table = await host.context().newPage();
    await table.goto(`/tt/?room=${roomCode}`);
    await chooseFirstProgram(host);
    await chooseFirstProgram(guest);

    const damageChoice = host.getByLabel('Damage prevention choice');
    await expect(damageChoice).toBeVisible({ timeout: 45_000 });
    const tableDamagePrompt = table.getByTestId('tabletop-damage-prompt');
    await expect(tableDamagePrompt).toBeVisible({ timeout: 45_000 });
    await steps.step('damage-choice-at-impact', {
      description: 'Laser damage pauses execution and prompts the affected player at impact time',
      verifications: [
        {
          spec: 'Ada sees the exact pending damage point and her owned Options',
          check: async () => {
            await expect(damageChoice).toContainText('damage 1 of 1');
            await expect(
              damageChoice.getByRole('button', { name: /Discard .* to prevent this damage/ }).first()
            ).toBeVisible();
          }
        },
        {
          spec: 'Grace sees that Ada is the player currently being prompted',
          check: async () => {
            await expect(guest.getByLabel('Damage prevention choice')).toContainText(
              'Waiting for Ada'
            );
          }
        }
      ]
    });
    steps.setPage(table);
    await steps.step('tabletop-identifies-damage-decision', {
      description: 'The shared tabletop keeps the successful beam visible and names the prompted player',
      verifications: [
        {
          spec: 'The tabletop prominently identifies Ada as the current responder',
          check: async () => {
            await expect(tableDamagePrompt).toContainText('Ada');
            await expect(tableDamagePrompt).toContainText('ORIGINAL DOCK ORDER');
          }
        },
        {
          spec: 'The successful robot laser remains visible beneath the decision prompt',
          check: async () => {
            await expect(table.locator('[data-laser-source]')).not.toHaveCount(0);
          }
        }
      ]
    });
    steps.setPage(host);
    await damageChoice
      .getByRole('button', { name: /Discard .* to prevent this damage/ })
      .first()
      .click();
    await expect(host.getByRole('heading', { name: 'Turn 5 complete' })).toBeVisible();

    await steps.step('options-wait-for-execution-time-use', {
      description: 'Owning Options no longer creates an up-front planning barrier',
      verifications: [
        {
          spec: 'Both clients converge without precommitting future Option use',
          check: async () => {
            await expect(guest.getByRole('heading', { name: 'Turn 5 complete' })).toBeVisible();
            await expect(host.getByLabel('Ordered Option decision window')).toHaveCount(0);
          }
        },
        {
          spec: 'Graphical Options remain face up until their actual timing window',
          check: async () => {
            const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(robots.locator('[data-card-id]')).toHaveCount(1);
            await expect(host.locator('.full-resolution')).toContainText(
              'to prevent one damage'
            );
          }
        }
      ]
    });
    steps.generateDocs();
    await table.close();
  } finally {
    await guestContext.close();
  }
});
