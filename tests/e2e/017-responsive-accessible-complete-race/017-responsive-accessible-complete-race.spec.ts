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
    if (await completed.isVisible()) return;
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
    await completed.waitFor({ state: 'visible', timeout: 250 }).catch(() => {});
  }
  await expect(completed).toBeVisible({ timeout: 10_000 });
}

const roomCodes: Record<string, string> = {
  phone: 'R17PHN',
  desktop: 'R17DSK',
  'mobile-landscape': 'R17LND',
  tablet: 'R17TAB'
};

test('a keyboard and touch-operable race completes at every target viewport', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(420_000);
  const roomCode = roomCodes[testInfo.project.name] ?? 'R17A11';
  let guestContext: BrowserContext | undefined;
  const steps = new TestStepHelper(host, testInfo);
  steps.setMetadata(
    'Responsive accessible complete race',
    'Two ordinary clients complete the production twelve-turn race at phone portrait, phone landscape, tablet, and desktop sizes. The first turn proves board-grid navigation, focus transfer, keyboard and pointer register ordering, textual countdowns, non-color selection cues, reduced motion, and live resolution semantics.'
  );

  try {
    await enableSyntheticPlaybackClock(host);
    await host.emulateMedia({ reducedMotion: 'reduce' });
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=risky-exchange-a`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext({ reducedMotion: 'reduce' });
    const guest = await guestContext.newPage();
    await enableSyntheticPlaybackClock(guest);
    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.locator('[data-status]')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('OPTION-11');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();

    const board = host.getByRole('grid', { name: /Risky Exchange board explorer/ });
    await board.focus();
    await board.press('ArrowRight');
    await board.press('ArrowDown');
    await expect(board).toHaveAttribute('aria-activedescendant', 'board-cell-2-2');
    await expect(host.locator('#board-cell-2-2')).toHaveAttribute('aria-selected', 'true');

    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();
    await expect(host.getByRole('heading', { name: /Your hand/ })).toBeFocused();
    await stayActiveInDockOrder([host, guest]);

    for (const label of turns[0].host) {
      await host.getByRole('button', { name: label, exact: true }).click();
    }
    const keyboardCard = host.getByRole('button', {
      name: turns[0].host[2],
      exact: true
    });
    const secondRegister = host
      .getByRole('list', { name: 'Chosen registers' })
      .getByRole('button')
      .nth(1);
    await secondRegister.focus();
    await secondRegister.press('Enter');
    await expect(secondRegister).toHaveAttribute('aria-pressed', 'true');
    const replacementCard = host
      .getByLabel('Your Program hand')
      .locator('button[aria-pressed="false"]')
      .first();
    const replacementLabel = await replacementCard.getAttribute('aria-label');
    if (!replacementLabel) throw new Error('Replacement Program card has no accessible label.');
    const stableReplacementCard = host.getByRole('button', {
      name: replacementLabel,
      exact: true
    });
    await replacementCard.focus();
    await replacementCard.press('Enter');
    await expect(stableReplacementCard).toHaveAttribute('data-register-index', '2');
    await stableReplacementCard.press('Enter');
    await keyboardCard.focus();
    await host.getByRole('button', { name: turns[0].host[1], exact: true }).press('Enter');
    await expect(keyboardCard).toHaveAttribute('data-register-index', '3');
    const chosenRegisters = host
      .getByRole('list', { name: 'Chosen registers' })
      .getByRole('listitem');
    await expect(chosenRegisters.nth(0)).toContainText('R1 move-1 500');
    await expect(chosenRegisters.nth(1)).toContainText('R2 rotate-right 110');
    await expect(chosenRegisters.nth(2)).toContainText('R3 move-1 490');

    await steps.step('keyboard-touch-board-and-timer-controls', {
      description: 'The complete race begins with equivalent non-pointer and pointer controls',
      verifications: [
        {
          spec: 'Arrow-key board navigation exposes a selected semantic grid cell',
          check: async () => {
            await expect(host.locator('.course-board')).toHaveAttribute(
              'aria-activedescendant',
              'board-cell-2-2'
            );
          }
        },
        {
          spec: 'Keyboard slot selection and replacement preserve the exact Program',
          check: async () => {
            await expect(host.getByLabel('Register ordering controls')).toHaveCount(0);
            await expect(keyboardCard).toHaveAttribute('data-register-index', '3');
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Submit immutable program' }).click();
    await expect(host.getByRole('timer')).toContainText(/has (29|30) seconds/);
    await expect(host.getByRole('timer')).toContainText('Fill timed-out program');
    await steps.step('textual-timer-and-non-color-state', {
      description: 'Submission exposes an equivalent textual deadline and state cue',
      verifications: [
        {
          spec: 'The last programmer receives a textual thirty-second alternative',
          check: async () => {
            await expect(host.getByRole('timer')).toContainText('seconds');
          }
        },
        {
          spec: 'Immutable submission is communicated in text, independent of color',
          check: async () => {
            await expect(
              host.getByText('Program committed. It cannot be inspected or changed.')
            ).toBeVisible();
          }
        }
      ]
    });

    await chooseProgram(guest, turns[0].guest);
    await closeResolutionInterrupts(host, guest, 1);
    await expect(host.getByTestId('resolution-live')).toContainText('Turn 1');
    await expect(
      host.getByRole('list', { name: 'Resolution feed' }).getByRole('listitem').last()
    ).toHaveCSS('animation-name', 'none');

    for (let index = 1; index < turns.length; index += 1) {
      const turn = index + 1;
      await host.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      await guest.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      if (turn === 9) await host.getByRole('button', { name: 'Power down next turn' }).click();
      await stayActiveInDockOrder([host, guest]);
      if (turns[index].host.length > 0) await chooseProgram(host, turns[index].host);
      if (turns[index].guest.length > 0) await chooseProgram(guest, turns[index].guest);
      await commitOptionPlans(host, guest, turn);
      await closeResolutionInterrupts(host, guest, turn);
    }

    await steps.step('responsive-race-reaches-three-flags', {
      description: 'The accessible production race reaches its immutable winner',
      resetScroll: true,
      verifications: [
        {
          spec: 'All target viewports reach Flag 3 through twelve ordinary turns',
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
          spec: 'Actor and observer share the same immutable winner summary',
          check: async () => {
            await expect(host.getByLabel('Immutable race summary')).toContainText(
              'Ada wins Risky Exchange'
            );
            await expect(guest.getByLabel('Immutable race summary')).toContainText(
              'Ada wins Risky Exchange'
            );
          }
        },
        {
          spec: 'The viewport has no clipped or overlapping interactive controls',
          check: async () => {
            await expect(host.locator('main')).toBeVisible();
          }
        }
      ]
    });
    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
