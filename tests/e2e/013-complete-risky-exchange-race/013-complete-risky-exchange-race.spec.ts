import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import {
  enableSyntheticPlaybackClock,
  finishSyntheticPlayback
} from '../helpers/playback-clock';
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
  },
  {
    host: ['rotate-right priority 350', 'rotate-right priority 70', 'move-2 priority 780', 'move-1 priority 630', 'back-up priority 430'],
    guest: ['move-3 priority 820', 'u-turn priority 60', 'move-2 priority 770', 'rotate-left priority 320', 'rotate-left priority 140']
  },
  {
    host: ['u-turn priority 60', 'move-2 priority 780', 'rotate-left priority 120', 'move-1 priority 550', 'move-2 priority 760'],
    guest: ['move-2 priority 750', 'move-1 priority 590', 'rotate-right priority 310', 'rotate-right priority 270', 'u-turn priority 50']
  },
  {
    host: ['move-1 priority 660', 'rotate-left priority 200', 'move-3 priority 830', 'rotate-left priority 80', 'back-up priority 450'],
    guest: ['rotate-left priority 220', 'rotate-right priority 230', 'move-2 priority 700', 'move-1 priority 570', 'move-1 priority 530']
  },
  {
    host: ['rotate-right priority 150', 'rotate-right priority 270', 'move-1 priority 550', 'move-1 priority 530', 'move-1 priority 640'],
    guest: ['rotate-right priority 230', 'move-2 priority 690', 'rotate-left priority 340', 'move-2 priority 700', 'move-1 priority 660']
  },
  {
    host: ['move-1 priority 560', 'move-3 priority 810', 'rotate-left priority 240', 'move-3 priority 820', 'u-turn priority 10'],
    guest: ['move-1 priority 520', 'rotate-left priority 180', 'move-2 priority 750', 'back-up priority 430', 'rotate-left priority 400']
  },
  {
    host: [],
    guest: ['u-turn priority 20', 'move-1 priority 530', 'move-2 priority 770', 'u-turn priority 50', 'move-3 priority 800']
  },
  {
    host: ['move-2 priority 750', 'rotate-right priority 150', 'rotate-right priority 70', 'rotate-left priority 100', 'back-up priority 450'],
    guest: ['move-1 priority 630', 'rotate-left priority 160', 'rotate-left priority 300', 'rotate-left priority 120', 'u-turn priority 50']
  },
  {
    host: ['move-1 priority 500', 'u-turn priority 50', 'move-3 priority 840', 'rotate-right priority 210', 'move-1 priority 560'],
    guest: ['move-1 priority 530', 'rotate-right priority 270', 'rotate-left priority 200', 'move-1 priority 540', 'move-3 priority 790']
  }
];

async function chooseProgram(page: Page, labels: Program) {
  const clear = page.getByRole('button', { name: 'Clear register choices' });
  if (await clear.isVisible()) await clear.click();
  for (const label of labels) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    await expect
      .poll(async () => {
        if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
        return button.getAttribute('aria-pressed');
      })
      .toBe('true');
  }
  const submit = page.getByRole('button', { name: 'Submit immutable program' });
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function commitOptionPlans(host: Page, guest: Page, turn: number) {
  if (turn < 3) return;
  if (turn <= 10) {
    const hostSubmit = host.getByRole('button', { name: 'Commit finite Option plan' });
    await expect(hostSubmit).toBeVisible();
    await hostSubmit.click();
  }
  if (turn < 5) return;
  const guestSubmit = guest.getByRole('button', { name: 'Commit finite Option plan' });
  await expect(guestSubmit).toBeVisible();
  await guestSubmit.click();
}

async function closeResolutionInterrupts(host: Page, guest: Page, turn: number) {
  await finishSyntheticPlayback([host, guest]);
  const completed = host.getByRole('heading', {
    name: new RegExp(`Turn ${turn} (complete|finished)`)
  });
  const handledLoss = new Set<Page>();
  const handledReentry = new Set<Page>();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (
      await completed.isVisible()
    ) {
      return;
    }
    for (const page of [host, guest]) {
      const loss = page
        .getByLabel('Destroyed robot Option loss')
        .getByRole('button')
        .first();
      if (!handledLoss.has(page) && (await loss.isVisible())) {
        handledLoss.add(page);
        await loss.click();
        await expect(loss).not.toBeVisible({ timeout: 10_000 });
        break;
      }
      const reentry = page.getByLabel('Re-entry cell and facing');
      if (!handledReentry.has(page) && (await reentry.isVisible())) {
        handledReentry.add(page);
        await reentry.selectOption({ index: 1 });
        const confirm = page.getByRole('button', { name: 'Confirm re-entry' });
        await confirm.click();
        await expect(confirm).not.toBeVisible({ timeout: 10_000 });
        await expect(completed).toBeVisible({ timeout: 30_000 });
        return;
      }
    }
    await host.waitForTimeout(100);
  }
  await expect(completed).toBeVisible({ timeout: 10_000 });
}

test('a production Risky Exchange race uses the complete rules loop', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(420_000);
  const roomCode = testInfo.project.name === 'phone' ? 'R13PHN' : 'R13DSK';
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();

  try {
    await enableSyntheticPlaybackClock(host);
    await enableSyntheticPlaybackClock(guest);
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
      'Complete a production Risky Exchange race',
      'Two ordinary browser clients play twelve hand-constrained turns through crossed-site Options, collisions, laser damage, an announced shutdown, destruction and re-entry, all three flags, immutable victory, and rematch.'
    );

    await host.getByLabel('Setup seed').fill('OPTION-11');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    let destructionCaptured = false;
    for (const [index, programs] of turns.entries()) {
      const turn = index + 1;
      if (turn > 1) {
        await host.getByRole('button', { name: `Begin Turn ${turn}` }).click();
        await guest.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      }
      if (turn === 9) {
        await host.getByRole('button', { name: 'Power down next turn' }).click();
      }
      await stayActiveInDockOrder([host, guest]);
      if (programs.host.length > 0) await chooseProgram(host, programs.host);
      if (programs.guest.length > 0) await chooseProgram(guest, programs.guest);
      await commitOptionPlans(host, guest, turn);
      await closeResolutionInterrupts(host, guest, turn);
      await expect(
        host.getByRole('heading', {
          name: new RegExp(`Turn ${turn} (complete|finished)`)
        })
      ).toBeVisible();

      if (turn === 4) {
        await steps.step('options-enter-production-race', {
          description: 'Both robots carry public face-up Options into the long race',
          verifications: [
            {
              spec: 'Successive crossed-site draws are retained',
              check: async () => {
                const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
                await expect(robots.getByRole('listitem').filter({ hasText: 'Ada' })).toContainText('Options');
                await expect(robots.getByRole('listitem').filter({ hasText: 'Grace' })).toContainText('Options');
              }
            }
          ]
        });
      }

      if (turn === 9) {
        await steps.step('shutdown-announced-in-production-race', {
          description: 'Ada announces a shutdown as part of the production race',
          verifications: [
            {
              spec: 'The original-Dock response is retained through resolution',
              check: async () => {
                const ada = host
                  .getByRole('list', { name: 'Robot Life and damage state' })
                  .getByRole('listitem')
                  .filter({ hasText: 'Ada' });
                await expect(ada).toContainText('Shutdown announced');
              }
            }
          ]
        });
      }

      const ada = host
        .getByRole('list', { name: 'Robot Life and damage state' })
        .getByRole('listitem')
        .filter({ hasText: 'Ada' });
      if (!destructionCaptured && (await ada.textContent())?.includes('2 Lives')) {
        destructionCaptured = true;
        await steps.step('collision-destruction-and-reentry', {
          description: 'The production race spends a Life and resumes through ordinary re-entry',
          verifications: [
            {
              spec: 'Ada returned with one fewer Life and the race continued',
              check: async () => {
                await expect(ada).toContainText('2 Lives');
                await expect(ada).toContainText('active');
              }
            }
          ]
        });
      }
    }

    await steps.step('three-flags-finish-production-race', {
      description: 'The hand-constrained race reaches Flag 3 and freezes its summary',
      verifications: [
        {
          spec: 'Ada touched all flags in order and won on Turn 12',
          check: async () => {
            await expect(host.getByRole('heading', { name: 'Turn 12 finished' })).toBeVisible();
            await expect(
              host
                .getByRole('list', { name: 'Robot Life and damage state' })
                .getByRole('listitem')
                .filter({ hasText: 'Ada' })
            ).toContainText('Flags 1→2→3');
          }
        },
        {
          spec: 'Both clients share the immutable summary',
          check: async () => {
            await expect(host.getByLabel('Immutable race summary')).toContainText(
              'Ada wins Risky Exchange'
            );
            await expect(guest.getByLabel('Immutable race summary')).toContainText(
              'Ada wins Risky Exchange'
            );
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Start rematch epoch 2' }).click();
    await expect(host.getByLabel('Race configuration')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Configure Risky Exchange' })).toBeEnabled();
    await expect(host.getByRole('list', { name: 'Race room players' })).toContainText('Ada');
    await expect(host.getByRole('list', { name: 'Race room players' })).toContainText('Grace');
    steps.generateDocs();
  } finally {
    await guestContext.close();
  }
});
