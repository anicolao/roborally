import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  COMPLETE_RISKY_EXCHANGE_TURNS,
  type CompleteRaceProgram
} from '../helpers/complete-risky-exchange-programs';
import { enableSyntheticPlaybackClock } from '../helpers/playback-clock';
import { TestStepHelper } from '../helpers/test-step-helper';

interface RacerController {
  name: string;
  page: Page;
  seat: number;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

async function documentCurrentState(
  steps: TestStepHelper,
  page: Page,
  id: string,
  description: string,
  spec: string,
  check: () => Promise<void>
) {
  steps.setPage(page);
  await steps.step(id, {
    description,
    verifications: [{ spec, check }],
    // Private controllers deliberately omit the shared shell connection badge.
    // Every step still performs its semantic assertion and the helper's full
    // fixed-viewport, clipping, overlap, animation, and screenshot checks.
    status: 'skip'
  });
}

async function documentBeforeClick(
  steps: TestStepHelper,
  page: Page,
  id: string,
  description: string,
  spec: string,
  button: Locator,
  allowPlaybackReplacement = false
) {
  const actionable = () => button.evaluateAll((buttons) => buttons.some((candidate) => {
    const control = candidate as HTMLButtonElement;
    const style = getComputedStyle(control);
    const bounds = control.getBoundingClientRect();
    return !control.disabled &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      bounds.width > 0 &&
      bounds.height > 0;
  }));
  if (allowPlaybackReplacement) {
    if (!(await actionable())) return false;
  } else {
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  }
  await button.focus();
  await documentCurrentState(steps, page, id, description, spec, async () => {
    expect(await actionable()).toBe(true);
    await expect(button).toBeFocused();
  });
  if (!(await actionable())) {
    if (allowPlaybackReplacement) return false;
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  }
  await button.click();
  return true;
}

async function expectCompleteVisibleHand(table: Page, racer: RacerController) {
  const damage = await table
    .locator(`[data-seat="${racer.seat}"] .damage-track i.taken`)
    .count();
  const minimumCards = 9 - damage;
  const cards = racer.page.getByLabel('Your Program hand').getByRole('button');
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(minimumCards);
  const cardCount = await cards.count();
  await expect(racer.page.locator('.controller-content')).toHaveClass(/programming/);
  for (const card of await cards.all()) await expect(card).toBeInViewport();

  const geometry = await racer.page.evaluate(() => {
    const root = document.scrollingElement!;
    const controller = document
      .querySelector('[data-e2e-private-hand]')!
      .getBoundingClientRect();
    const editor = document.querySelector<HTMLElement>('.program-editor')!;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: root.scrollWidth,
        height: root.scrollHeight
      },
      controller: {
        left: controller.left,
        top: controller.top,
        right: controller.right,
        bottom: controller.bottom
      },
      editor: {
        clientHeight: editor.clientHeight,
        scrollHeight: editor.scrollHeight
      }
    };
  });
  expect(geometry.document).toEqual(geometry.viewport);
  expect(geometry.controller).toEqual({
    left: 0,
    top: 0,
    right: geometry.viewport.width,
    bottom: geometry.viewport.height
  });
  expect(geometry.editor.scrollHeight).toBeLessThanOrEqual(geometry.editor.clientHeight);
  return cardCount;
}

async function documentProgram(
  steps: TestStepHelper,
  table: Page,
  racer: RacerController,
  turn: number,
  labels: CompleteRaceProgram
) {
  const handCount = await expectCompleteVisibleHand(table, racer);
  for (const [registerIndex, label] of labels.entries()) {
    const card = racer.page.getByRole('button', { name: label, exact: true });
    await expect(card).toBeVisible();
    await card.click();
    await documentCurrentState(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-register-${registerIndex + 1}`,
      `${racer.name} chooses Register ${registerIndex + 1}: ${label}`,
      `Turn ${turn} Register ${registerIndex + 1} visibly contains ${label}, with the complete hand still inside the phone viewport`,
      async () => {
        await expect(card).toHaveAttribute('aria-pressed', 'true');
        await expect(racer.page.getByLabel('Your Program hand').getByRole('button'))
          .toHaveCount(handCount);
        await expectCompleteVisibleHand(table, racer);
      }
    );
  }

  const lock = racer.page.getByRole('button', { name: 'Lock program' });
  await documentBeforeClick(
    steps,
    racer.page,
    `turn-${turn}-${slug(racer.name)}-lock-program`,
    `${racer.name} locks the Turn ${turn} program`,
    `All five Turn ${turn} registers are visible and the lock action is available without scrolling`,
    lock
  );
}

function privateDecisionVisible(racer: RacerController) {
  return racer.page.locator(
    '[data-decision-id], [aria-label="Destroyed robot Option loss"], [aria-label="Robot re-entry choice"]'
  ).count();
}

async function documentPowerChoices(
  steps: TestStepHelper,
  table: Page,
  racers: RacerController[],
  turn: number,
  powerDownRacer?: RacerController
) {
  const answered = new Set<Page>();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const racer of racers) {
      const control = racer.page.getByLabel('Power-down choice');
      if (answered.has(racer.page) || !(await control.isVisible())) continue;
      const choice = racer === powerDownRacer ? 'POWER DOWN' : 'STAY ACTIVE';
      const button = control.getByRole('button', { name: choice });
      if (!(await button.isEnabled())) continue;
      await documentBeforeClick(
        steps,
        racer.page,
        `turn-${turn}-${slug(racer.name)}-${slug(choice)}`,
        `${racer.name} chooses ${choice} after Turn ${turn} programming`,
        `The Turn ${turn} power choice is legible, unobstructed, and ${choice} is available`,
        button
      );
      answered.add(racer.page);
    }

    const decisionCounts = await Promise.all(racers.map(privateDecisionVisible));
    if (
      decisionCounts.some((count) => count > 0) ||
      await table.getByTestId('tabletop-program-countdown').isVisible() ||
      await table.evaluate(() => (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0)
    ) return;
    await table.waitForTimeout(50);
  }
  throw new Error(`Turn ${turn} never advanced from private power choices to playback.`);
}

async function documentPrivateDecision(
  steps: TestStepHelper,
  racer: RacerController,
  turn: number
) {
  const takeDamage = racer.page.getByRole('button', { name: 'TAKE THIS DAMAGE' });
  if (await takeDamage.isVisible()) {
    const answered = await documentBeforeClick(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-take-damage`,
      `${racer.name} chooses to take the incoming damage`,
      'The complete damage-prevention decision and its Option choices are visible before damage is accepted',
      takeDamage,
      true
    );
    if (answered) await expect(takeDamage).toBeHidden();
    return answered;
  }

  const optionDecision = racer.page.getByLabel('Option decision');
  const optionButtons = optionDecision.getByRole('button');
  if (await optionDecision.isVisible() && await optionButtons.count() > 0) {
    const choice = optionButtons.last();
    const choiceName =
      await choice.getAttribute('aria-label') ?? (await choice.textContent())?.trim() ?? 'last choice';
    const answered = await documentBeforeClick(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-option-${slug(choiceName)}`,
      `${racer.name} answers the Option decision with ${choiceName}`,
      'The execution-time Option prompt, its card choices, and the selected response are fully visible',
      choice,
      true
    );
    if (answered) await expect(optionDecision).toBeHidden();
    return answered;
  }

  const optionLoss = racer.page
    .getByLabel('Destroyed robot Option loss')
    .getByRole('button');
  if (await optionLoss.first().isVisible()) {
    const choice = optionLoss.first();
    const choiceName = await choice.getAttribute('aria-label') ?? 'the first Option';
    const answered = await documentBeforeClick(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-discard-option`,
      `${racer.name} chooses ${choiceName}`,
      'Every discardable Option and the selected destruction penalty are visible on the private controller',
      choice,
      true
    );
    if (answered) await expect(optionLoss.first()).toBeHidden();
    return answered;
  }

  const reentry = racer.page.getByLabel('Re-entry cell and facing');
  if (await reentry.isVisible()) {
    await reentry.selectOption({ index: 1 });
    const selectedLabel = await reentry.locator('option:checked').textContent();
    await documentCurrentState(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-select-reentry`,
      `${racer.name} selects re-entry ${selectedLabel?.trim() ?? ''}`,
      'The legal re-entry placement and facing are visible after selection',
      async () => await expect(reentry).not.toHaveValue('')
    );
    await documentBeforeClick(
      steps,
      racer.page,
      `turn-${turn}-${slug(racer.name)}-confirm-reentry`,
      `${racer.name} confirms the re-entry placement`,
      'The selected cell, facing, and confirmation action fit on the phone without scrolling',
      racer.page.getByRole('button', { name: 'CONFIRM RE-ENTRY' })
    );
    // Do not let the polling loop observe the just-answered decision while the
    // controller is applying its live Firestore update and attempt it twice.
    await expect(reentry).toBeHidden();
    return true;
  }
  return false;
}

async function finishDocumentedTurn(
  steps: TestStepHelper,
  table: Page,
  racers: RacerController[],
  turn: number,
  finalTurn: boolean
) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    let answeredDecision = false;
    for (const racer of racers) {
      if (await documentPrivateDecision(steps, racer, turn)) {
        answeredDecision = true;
        break;
      }
    }
    if (answeredDecision) continue;

    if (await table.evaluate(
      () => (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0
    )) {
      await table.evaluate(() => window.__roborallyE2ePlaybackClock?.runAll?.() ?? 0);
      continue;
    }

    const raceDialog = table.getByRole('dialog', { name: 'Race finished' });
    if (await raceDialog.isVisible()) {
      await documentCurrentState(
        steps,
        table,
        `turn-${turn}-race-finished`,
        `The tabletop announces the winner after Turn ${turn}`,
        'The shared tabletop shows Ada as the winner after all three flags are touched in order',
        async () => {
          await expect(raceDialog).toContainText('Ada WINS!');
          await expect(raceDialog).toContainText('Ada touched every flag in order.');
        }
      );
      expect(finalTurn).toBe(true);
      return;
    }

    const nextTurn = turn + 1;
    const nextButtons = await Promise.all(racers.map((racer) =>
      racer.page.getByRole('button', { name: `BEGIN TURN ${nextTurn}` }).isVisible()
    ));
    if (nextButtons.every(Boolean)) {
      await documentCurrentState(
        steps,
        table,
        `turn-${turn}-tabletop-playback-complete`,
        `The tabletop completes Turn ${turn} playback`,
        `The Turn ${turn} board result and every public player state are visible before Turn ${nextTurn}`,
        async () => {
          await expect(table.getByRole('dialog', { name: 'Race finished' })).toHaveCount(0);
          for (const racer of racers) {
            await expect(racer.page.getByRole('button', { name: `BEGIN TURN ${nextTurn}` }))
              .toBeVisible();
          }
        }
      );
      expect(finalTurn).toBe(false);
      return;
    }
    await table.waitForTimeout(50);
  }
  throw new Error(`Turn ${turn} did not reach the next round or the race finish.`);
}

test('two private phone controllers complete a fully documented tabletop race', async ({
  browser,
  page: table
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'This scenario owns a desktop tabletop and creates its two phone viewports explicitly.'
  );
  test.setTimeout(900_000);

  const roomCode = 'F24DSK';
  const phoneOptions = { viewport: { width: 393, height: 852 }, hasTouch: true };
  const firstContext = await browser.newContext(phoneOptions);
  const secondContext = await browser.newContext(phoneOptions);
  const firstPhone = await firstContext.newPage();
  const secondPhone = await secondContext.newPage();
  const racers: RacerController[] = [
    { name: 'Ada', page: firstPhone, seat: 1 },
    { name: 'Grace', page: secondPhone, seat: 2 }
  ];
  const steps = new TestStepHelper(table, testInfo);
  steps.setMetadata(
    'Complete tabletop race with private phone controllers',
    'A shared tabletop and two isolated 393×852 touch controllers play every round of a deterministic 12-turn race. Every user action has its own screenshot so programming, power choices, Options, destruction, re-entry, playback, and victory remain visually reviewable throughout the complete game.'
  );

  try {
    await enableSyntheticPlaybackClock(table);
    await table.goto(`/tt/?e2eRoomCode=${roomCode}&course=risky-exchange-a`);
    await documentCurrentState(
      steps,
      table,
      'open-tabletop-room',
      `The tabletop opens room ${roomCode}`,
      'The complete tabletop configuration and all position QR codes fit the shared display',
      async () => {
        await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
        await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
      }
    );

    const firstJoin = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 1` })
      .getAttribute('href');
    const secondJoin = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 2` })
      .getAttribute('href');
    expect(firstJoin).not.toBeNull();
    expect(secondJoin).not.toBeNull();

    await firstPhone.goto(firstJoin!);
    await documentCurrentState(
      steps,
      firstPhone,
      'ada-opens-position-one',
      'Ada opens the private Position 1 controller',
      'The entire private join form is usable at 393×852 without scrolling',
      async () => await expect(firstPhone.getByLabel('Join tabletop position 1')).toBeVisible()
    );
    await firstPhone.getByLabel('Racer name').fill('Ada');
    await documentCurrentState(
      steps,
      firstPhone,
      'ada-enters-name',
      'Ada enters her racer name',
      'The entered racer name remains visible alongside all available robots',
      async () => await expect(firstPhone.getByLabel('Racer name')).toHaveValue('Ada')
    );
    const axle = firstPhone.getByRole('button', { name: 'Axle' });
    await axle.click();
    await documentCurrentState(
      steps,
      firstPhone,
      'ada-selects-axle',
      'Ada selects Axle',
      'Axle is visibly selected and the position claim remains available',
      async () => await expect(axle).toHaveAttribute('aria-pressed', 'true')
    );
    await documentBeforeClick(
      steps,
      firstPhone,
      'ada-claims-position-one',
      'Ada claims Position 1',
      'The selected name, robot, and Position 1 claim action are all visible',
      firstPhone.getByRole('button', { name: 'CLAIM POSITION 1' })
    );

    await secondPhone.goto(secondJoin!);
    await documentCurrentState(
      steps,
      secondPhone,
      'grace-opens-position-two',
      'Grace opens the private Position 2 controller',
      'The second private join form is complete and unobstructed at phone size',
      async () => await expect(secondPhone.getByLabel('Join tabletop position 2')).toBeVisible()
    );
    await secondPhone.getByLabel('Racer name').fill('Grace');
    await documentCurrentState(
      steps,
      secondPhone,
      'grace-enters-name',
      'Grace enters her racer name',
      'The second racer name remains visible alongside the available robots',
      async () => await expect(secondPhone.getByLabel('Racer name')).toHaveValue('Grace')
    );
    const bit = secondPhone.getByRole('button', { name: 'Bit' });
    await bit.click();
    await documentCurrentState(
      steps,
      secondPhone,
      'grace-selects-bit',
      'Grace selects Bit',
      'Bit is visibly selected and the position claim remains available',
      async () => await expect(bit).toHaveAttribute('aria-pressed', 'true')
    );
    await documentBeforeClick(
      steps,
      secondPhone,
      'grace-claims-position-two',
      'Grace claims Position 2',
      'The selected name, robot, and Position 2 claim action are all visible',
      secondPhone.getByRole('button', { name: 'CLAIM POSITION 2' })
    );

    const course = table.getByLabel('Course');
    await course.selectOption('risky-exchange-a');
    await documentCurrentState(
      steps,
      table,
      'tabletop-selects-course',
      'The tabletop selects the deterministic Risky Exchange test course',
      'The selected full-race course is visible in the shared configuration',
      async () => await expect(course).toHaveValue('risky-exchange-a')
    );
    const seed = table.getByLabel('Setup seed');
    await seed.fill('OPTION-11');
    await documentCurrentState(
      steps,
      table,
      'tabletop-enters-seed',
      'The tabletop enters the deterministic full-race seed',
      'The OPTION-11 seed is visible before configuration is committed',
      async () => await expect(seed).toHaveValue('OPTION-11')
    );
    await documentBeforeClick(
      steps,
      table,
      'tabletop-configures-race',
      'The tabletop configures the race',
      'The course, seed, player count, and configuration action are simultaneously visible',
      table.getByRole('button', { name: 'CONFIGURE RACE' })
    );

    for (const racer of racers) {
      const ready = racer.page.getByRole('button', { name: 'READY FOR RACE' });
      await documentBeforeClick(
        steps,
        racer.page,
        `${slug(racer.name)}-readies-for-race`,
        `${racer.name} confirms readiness`,
        'The configured-race summary and ready action fit the private phone display',
        ready
      );
    }

    for (const [turnIndex, programs] of COMPLETE_RISKY_EXCHANGE_TURNS.entries()) {
      const turn = turnIndex + 1;
      if (turn > 1) {
        for (const racer of racers) {
          await documentBeforeClick(
            steps,
            racer.page,
            `turn-${turn}-${slug(racer.name)}-begin`,
            `${racer.name} opens the private Turn ${turn} hand`,
            `Turn ${turn} remains closed until ${racer.name} explicitly opens the next private hand`,
            racer.page.getByRole('button', { name: `BEGIN TURN ${turn}` })
          );
        }
      }

      if (programs.host.length > 0) {
        await documentProgram(steps, table, racers[0], turn, programs.host);
      } else {
        await documentCurrentState(
          steps,
          racers[0].page,
          `turn-${turn}-ada-powered-down`,
          `Ada remains powered down during Turn ${turn} programming`,
          'A powered-down racer receives no private Program hand while the active opponent can still program',
          async () => await expect(racers[0].page.getByLabel('Your Program hand')).toHaveCount(0)
        );
      }
      await documentProgram(steps, table, racers[1], turn, programs.guest);

      await documentPowerChoices(
        steps,
        table,
        racers,
        turn,
        turn === 9 ? racers[0] : undefined
      );
      await finishDocumentedTurn(
        steps,
        table,
        racers,
        turn,
        turn === COMPLETE_RISKY_EXCHANGE_TURNS.length
      );
    }

    steps.generateDocs();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
