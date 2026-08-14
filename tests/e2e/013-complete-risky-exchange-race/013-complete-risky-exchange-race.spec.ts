import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { chooseReentry, stayActiveInDockOrder } from '../helpers/game-actions';
import {
  enableSyntheticPlaybackClock,
  finishSyntheticPlayback
} from '../helpers/playback-clock';
import { TestStepHelper } from '../helpers/test-step-helper';
import {
  COMPLETE_RISKY_EXCHANGE_TURNS,
  type CompleteRaceProgram
} from '../helpers/complete-risky-exchange-programs';

async function chooseProgram(page: Page, labels: CompleteRaceProgram) {
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
      const takeDamage = page.getByRole('button', { name: 'Take this damage' });
      if (await takeDamage.isVisible()) {
        const decisionId = await page.getByLabel('Damage prevention choice').getAttribute('data-decision-id');
        await takeDamage.click();
        if (decisionId) {
          await expect(page.locator(`[data-decision-id="${decisionId}"]`)).toHaveCount(0);
        }
        await finishSyntheticPlayback([host, guest]);
        break;
      }
      const optionDecision = page.getByLabel('Option decision');
      const optionChoice = optionDecision.getByRole('button').last();
      if (await optionChoice.isVisible()) {
        const decisionId = await optionDecision.getAttribute('data-decision-id');
        await optionChoice.click();
        if (decisionId) {
          await expect(page.locator(`[data-decision-id="${decisionId}"]`)).toHaveCount(0);
        }
        await finishSyntheticPlayback([host, guest]);
        break;
      }
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
      const reentry = page.getByRole('group', { name: 'Re-entry facing' });
      if (!handledReentry.has(page) && (await reentry.isVisible())) {
        handledReentry.add(page);
        await chooseReentry(page);
        const confirm = page.getByRole('button', { name: 'Confirm re-entry' });
        await confirm.click();
        await expect(confirm).not.toBeVisible({ timeout: 10_000 });
        await expect(completed).toBeVisible({ timeout: 30_000 });
        return;
      }
    }
    if (await host.evaluate(() =>
      (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0
    )) {
      await finishSyntheticPlayback([host, guest]);
      continue;
    }
    await expect.poll(async () =>
      (await completed.isVisible()) ||
      (await Promise.all([host, guest].map(async (page) =>
        (await page.locator('[data-decision-id]').count()) > 0 ||
        (await page.getByLabel('Destroyed robot Option loss').count()) > 0 ||
        (await page.getByRole('group', { name: 'Re-entry facing' }).count()) > 0
      ))).some(Boolean) ||
      (await host.evaluate(() =>
        (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0
      ))
    ).toBe(true);
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
    for (const [index, programs] of COMPLETE_RISKY_EXCHANGE_TURNS.entries()) {
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
      await closeResolutionInterrupts(host, guest, turn);
      await expect(
        host.getByRole('heading', {
          name: new RegExp(`Turn ${turn} (complete|finished)`)
        })
      ).toBeVisible();

      if (turn === 4) {
        await host.evaluate(() => window.scrollTo(0, 0));
        await steps.step('options-enter-production-race', {
          description: 'Both robots carry public face-up Options into the long race',
          verifications: [
            {
              spec: 'Successive crossed-site draws are retained as graphical cards',
              check: async () => {
                const robots = host.getByRole('list', { name: 'Robot Life and damage state' });
                await expect(
                  robots.getByRole('listitem').filter({ hasText: 'Ada' }).locator('[data-card-id]')
                ).toHaveCount(1);
                await expect(
                  robots.getByRole('listitem').filter({ hasText: 'Grace' }).locator('[data-card-id]')
                ).toHaveCount(1);
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
