import { expect, test } from '@playwright/test';
import {
  advanceSyntheticPlayback,
  enableSyntheticPlaybackClock,
  finishSyntheticPlayback
} from '../helpers/playback-clock';
import { chooseReentry } from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

async function expectFixedViewport(page: import('@playwright/test').Page) {
  const geometry = await page.evaluate(() => {
    const root = document.scrollingElement!;
    const tabletop = document.querySelector('[data-e2e-tabletop]')!.getBoundingClientRect();
    return {
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      tabletop: {
        x: tabletop.x,
        y: tabletop.y,
        width: tabletop.width,
        height: tabletop.height
      }
    };
  });
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.scrollHeight).toBe(geometry.clientHeight);
  expect(geometry.tabletop).toEqual({
    x: 0,
    y: 0,
    width: geometry.clientWidth,
    height: geometry.clientHeight
  });
}

async function expectFixedPrivateViewport(page: import('@playwright/test').Page) {
  const geometry = await page.evaluate(() => {
    const root = document.scrollingElement!;
    const controller = document
      .querySelector('[data-e2e-private-hand]')!
      .getBoundingClientRect();
    return {
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      controller: {
        x: controller.x,
        y: controller.y,
        width: controller.width,
        height: controller.height
      }
    };
  });
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.scrollHeight).toBe(geometry.clientHeight);
  expect(geometry.controller).toEqual({
    x: 0,
    y: 0,
    width: geometry.clientWidth,
    height: geometry.clientHeight
  });

  const editorGeometry = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.program-editor')!;
    const controls = [...editor.querySelectorAll<HTMLElement>('button')].map((control) => {
      const bounds = control.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    });
    return {
      clientHeight: editor.clientHeight,
      scrollHeight: editor.scrollHeight,
      controls,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
  });
  expect(editorGeometry.scrollHeight).toBeLessThanOrEqual(editorGeometry.clientHeight);
  for (const control of editorGeometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(editorGeometry.viewportWidth);
    expect(control.bottom).toBeLessThanOrEqual(editorGeometry.viewportHeight);
  }
}

async function expectReadablePrivateProgramCards(page: import('@playwright/test').Page) {
  const cards = page.getByLabel('Your Program hand').getByRole('button');
  await expect(cards).toHaveCount(9);
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  );
  for (const card of bounds) {
    expect(card.width).toBeGreaterThanOrEqual(100);
    expect(card.height).toBeGreaterThanOrEqual(140);
    expect(card.height / card.width).toBeGreaterThan(1.35);
  }
}

async function expectVisiblePrivateHand(
  page: import('@playwright/test').Page,
  expectedCards: number
) {
  const controller = page.locator('.controller-content');
  await expect(controller).toHaveClass(/programming/);
  const cards = page.getByLabel('Your Program hand').getByRole('button');
  await expect(cards).toHaveCount(expectedCards);
  for (const card of await cards.all()) await expect(card).toBeInViewport();
  await expectFixedPrivateViewport(page);
}

async function expectProportionalPrivateProgramCards(
  page: import('@playwright/test').Page,
  minimumWidth: number
) {
  const cards = page.getByLabel('Your Program hand').getByRole('button');
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  );
  for (const card of bounds) {
    expect(card.width).toBeGreaterThanOrEqual(minimumWidth);
    expect(card.height / card.width).toBeGreaterThan(1.35);
  }
  const actionHeights = await page
    .locator('.program-editor .editor-actions button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  for (const height of actionHeights) expect(height).toBeGreaterThanOrEqual(44);
}

async function touchDrag(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator
) {
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();
  const start = {
    x: sourceBounds!.x + sourceBounds!.width / 2,
    y: sourceBounds!.y + sourceBounds!.height / 2
  };
  const end = {
    x: targetBounds!.x + targetBounds!.width / 2,
    y: targetBounds!.y + targetBounds!.height / 2
  };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 1 }]
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...end, id: 1 }]
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function submitVisibleProgram(page: import('@playwright/test').Page) {
  const cards = page.getByLabel('Your Program hand').getByRole('button');
  const lockProgram = page.getByRole('button', { name: 'Lock program' });
  for (let index = 0; index < await cards.count(); index += 1) {
    if ((await cards.nth(index).getAttribute('aria-pressed')) !== 'true') {
      await cards.nth(index).click();
    }
    if (await lockProgram.isEnabled()) break;
  }
  await lockProgram.click();
}

async function completePrivateResolutionChoices(
  table: import('@playwright/test').Page,
  pages: import('@playwright/test').Page[],
  nextTurnNumber = 2
) {
  await expect.poll(async () => {
    const tabletopPlaybackPending = await table.evaluate(
      () => (window.__roborallyE2ePlaybackClock?.pending?.() ?? 0) > 0
    );
    if (tabletopPlaybackPending) {
      const visiblePrivateDecisions = await Promise.all(
        pages.map((page) =>
          page.locator(
            '[data-decision-id], [aria-label="Destroyed robot Option loss"], [aria-label="Re-entry facing"]'
          ).count()
        )
      );
      if (visiblePrivateDecisions.some((count) => count > 0)) return false;
      await table.evaluate(() => window.__roborallyE2ePlaybackClock?.runAll?.() ?? 0);
      return false;
    }
    for (const page of pages) {
      const takeDamage = page.getByRole('button', { name: 'TAKE THIS DAMAGE' });
      if (await takeDamage.isVisible()) {
        await takeDamage.click();
        return false;
      }
      const optionLoss = page.getByLabel('Destroyed robot Option loss').getByRole('button');
      if (await optionLoss.first().isVisible()) {
        await optionLoss.first().click();
        return false;
      }

      const reentry = page.getByRole('group', { name: 'Re-entry facing' });
      if (await reentry.isVisible()) {
        await chooseReentry(page);
        await page.getByRole('button', { name: 'CONFIRM RE-ENTRY' }).click();
        return false;
      }
    }
    const nextTurnVisible = await Promise.all(
      pages.map((page) =>
        page.getByRole('button', { name: `BEGIN TURN ${nextTurnNumber}` }).isVisible()
      )
    );
    return nextTurnVisible.every(Boolean);
  }, { timeout: 30_000 }).toBe(true);
}

async function phoneWithPowerChoice(
  pages: import('@playwright/test').Page[]
) {
  let selected = -1;
  await expect.poll(async () => {
    for (const [index, page] of pages.entries()) {
      const choice = page.getByLabel('Power-down choice');
      const enabledStayActive = await choice
        .getByRole('button', { name: 'STAY ACTIVE' })
        .evaluateAll((buttons) =>
          buttons.some((button) => !(button as HTMLButtonElement).disabled)
        );
      if (
        (await choice.isVisible()) &&
        enabledStayActive
      ) {
        selected = index;
        return selected;
      }
    }
    return -1;
  }).not.toBe(-1);
  return selected;
}

test('the tabletop owns configuration and seat QR codes open private controllers', async ({
  browser,
  page: table
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'T20PHN' : 'T20DSK';
  const privateControllerOptions = {
    viewport: { width: 393, height: 852 },
    hasTouch: true
  };
  const firstContext = await browser.newContext(privateControllerOptions);
  const secondContext = await browser.newContext(privateControllerOptions);
  const firstPhone = await firstContext.newPage();
  const secondPhone = await secondContext.newPage();
  const steps = new TestStepHelper(table, testInfo);
  const phoneSteps = new TestStepHelper(firstPhone, testInfo);
  steps.setMetadata(
    'Tabletop QR joining and configuration',
    'The shared display creates a fresh room, exposes eight position-specific QR joins, owns race configuration, renders the course and public player state, and animates Program execution while phones retain private choices.'
  );

  try {
    await enableSyntheticPlaybackClock(table);
    await table.addInitScript(() => {
      window.__roborallyE2ePresentationRevealFailures = 1;
    });
    await table.goto(`/tt/?e2eIdentity=TABLE&e2eRoomCode=${roomCode}`);
    await expect(table.locator('[data-e2e-tabletop]')).toHaveAttribute('data-room-code', roomCode);
    await expect(table.locator('header, footer')).toHaveCount(0);
    await expectFixedViewport(table);
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
    await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
    await expect(table.getByRole('button', { name: 'CONFIGURE RACE' })).toBeDisabled();
    await expect(table.getByLabel('Setup seed')).toHaveValue(roomCode);

    const positionSevenUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 7` })
      .getAttribute('href');
    const positionTwoUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 2` })
      .getAttribute('href');
    expect(positionSevenUrl).toContain(`/hand/?room=${roomCode}&seat=7`);
    expect(positionTwoUrl).toContain(`/hand/?room=${roomCode}&seat=2`);

    await steps.step('open-table-qr-configuration', {
      description: 'A fresh tabletop exposes eight QR positions and owns configuration',
      status: 'skip',
      verifications: [
        {
          spec: 'Eight open positions expose seat-specific QR join links',
          check: async () => {
            await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
            expect(positionSevenUrl).toContain(`/hand/?room=${roomCode}&seat=7`);
            expect(positionTwoUrl).toContain(`/hand/?room=${roomCode}&seat=2`);
          }
        },
        {
          spec: 'Course configuration belongs to a headerless, fixed, non-scrolling tabletop viewport',
          check: async () => {
            await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
            await expect(table.locator('header, footer')).toHaveCount(0);
            await expectFixedViewport(table);
          }
        }
      ]
    });

    await firstPhone.goto(`${positionSevenUrl}&e2eIdentity=ADA`);
    await expect(firstPhone.getByRole('heading', { name: 'D07' })).toBeVisible();
    await firstPhone.getByLabel('Racer name').fill('Ada');
    await firstPhone.getByRole('button', { name: 'Axle' }).click();
    await firstPhone.getByRole('button', { name: 'CLAIM POSITION 7' }).click();
    await expect(firstPhone.getByRole('heading', { name: 'Ada' })).toBeVisible();

    await secondPhone.goto(`${positionTwoUrl}&e2eIdentity=GRACE`);
    await expect(secondPhone.getByRole('heading', { name: 'D02' })).toBeVisible();
    await secondPhone.getByLabel('Racer name').fill('Grace');
    await secondPhone.getByRole('button', { name: 'Bit' }).click();
    await secondPhone.getByRole('button', { name: 'CLAIM POSITION 2' }).click();
    await expect(secondPhone.getByRole('heading', { name: 'Grace' })).toBeVisible();

    await expect(table.locator('[data-seat="7"]')).toContainText('Ada');
    await expect(table.locator('[data-seat="2"]')).toContainText('Grace');
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(6);

    await table.getByLabel('Course', { exact: true }).selectOption('risky-exchange');
    await table.getByLabel('Setup seed').fill('TABLETOP-E2E');
    await table.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    await expect(table.getByText('Risky Exchange · seed TABLETOP-E2E · 3 lives')).toBeVisible();

    await firstPhone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await secondPhone.getByRole('button', { name: 'READY FOR RACE' }).click();

    const sharedTable = table.getByRole('region', { name: 'Shared tabletop' });
    await expect(sharedTable).toHaveAttribute('data-course-layout', 'side-seats');
    const courseBoard = table.getByRole('grid', { name: 'Risky Exchange course board' });
    await expect(courseBoard).toBeVisible();
    await expect(courseBoard).toHaveAttribute('data-tabletop-orientation', 'natural');
    const courseBounds = await courseBoard.boundingBox();
    const courseViewport = table.locator('.board-viewport');
    const viewportBounds = await courseViewport.boundingBox();
    expect(courseBounds).not.toBeNull();
    expect(viewportBounds).not.toBeNull();
    expect(courseBounds!.height).toBeGreaterThan(courseBounds!.width);
    expect(courseBounds!.x).toBeGreaterThanOrEqual(viewportBounds!.x - 1);
    expect(courseBounds!.y).toBeGreaterThanOrEqual(viewportBounds!.y - 1);
    expect(courseBounds!.x + courseBounds!.width).toBeLessThanOrEqual(
      viewportBounds!.x + viewportBounds!.width + 1
    );
    expect(courseBounds!.y + courseBounds!.height).toBeLessThanOrEqual(
      viewportBounds!.y + viewportBounds!.height + 1
    );
    expect(
      Math.min(
        Math.abs(courseBounds!.width - viewportBounds!.width),
        Math.abs(courseBounds!.height - viewportBounds!.height)
      )
    ).toBeLessThanOrEqual(1);
    const cellBounds = await courseBoard.getByRole('gridcell').first().boundingBox();
    expect(cellBounds).not.toBeNull();
    expect(Math.abs(cellBounds!.width - cellBounds!.height)).toBeLessThanOrEqual(1);
    const courseWrapBounds = await table.locator('.course-wrap').boundingBox();
    const seatOneBounds = await table.locator('[data-seat="1"]').boundingBox();
    const seatEightBounds = await table.locator('[data-seat="8"]').boundingBox();
    expect(courseWrapBounds).not.toBeNull();
    expect(seatOneBounds).not.toBeNull();
    expect(seatEightBounds).not.toBeNull();
    expect(seatOneBounds!.x + seatOneBounds!.width).toBeLessThanOrEqual(courseWrapBounds!.x);
    expect(seatEightBounds!.x).toBeGreaterThanOrEqual(
      courseWrapBounds!.x + courseWrapBounds!.width
    );
    await expectFixedViewport(table);
    await expect(table.getByRole('heading', { name: 'Risky Exchange' })).toHaveCount(0);
    await expect(table.getByLabel('Board view controls')).toHaveCount(0);
    await expect(table.getByText('Course text equivalent')).toHaveCount(0);
    const adaSeat = table.locator('[data-seat="7"]');
    await expect(adaSeat.locator('[data-player-vitals]')).toHaveAttribute(
      'aria-label',
      /3 of 3 lives remaining, 0 damage taken and 10 damage not yet taken, active power/
    );
    await expect(adaSeat.locator('.life-track i.remaining')).toHaveCount(3);
    await expect(adaSeat.locator('.damage-track i.available')).toHaveCount(10);
    await expect(adaSeat.locator('.power-state')).toContainText('ACTIVE');
    await expect(adaSeat.locator('.flag-track')).toHaveAttribute(
      'aria-label',
      'Ada touched flags: none'
    );
    await expect(adaSeat.locator('.flag-track i')).toHaveCount(3);
    await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(firstPhone.getByLabel('Course')).toHaveCount(0);
    await expect(secondPhone.getByLabel('Course')).toHaveCount(0);
    await expectFixedPrivateViewport(firstPhone);
    await expectFixedPrivateViewport(secondPhone);
    await phoneSteps.step('private-programming-controller', {
      description: 'The private phone presents a large, tightly packed portrait Program hand',
      status: 'skip',
      verifications: [
        {
          spec: 'Nine Program cards remain legible while the fixed controller viewport does not scroll',
          check: async () => {
            await expectReadablePrivateProgramCards(firstPhone);
            await expectFixedPrivateViewport(firstPhone);
          }
        }
      ]
    });

    const touchCard = firstPhone.getByLabel('Your Program hand').getByRole('button').first();
    const touchCardLabel = await touchCard.getAttribute('aria-label');
    const touchCardPriority = touchCardLabel?.match(/priority (\d+)$/)?.[1];
    if (!touchCardPriority) throw new Error(`Program card has no priority: ${touchCardLabel}`);
    const touchRegister = firstPhone
      .getByRole('list', { name: 'Chosen registers' })
      .getByRole('button')
      .first();
    await expect(touchCard).toHaveCSS('touch-action', 'none');
    await touchDrag(firstPhone, touchCard, touchRegister);
    await expect(touchRegister).toContainText(touchCardPriority);
    await touchCard.click();
    await expect(touchRegister).toContainText('empty');
    await touchDrag(firstPhone, touchCard, touchRegister);
    await expect(touchRegister).toContainText(touchCardPriority);
    await expectFixedPrivateViewport(firstPhone);
    await firstPhone.setViewportSize({ width: 320, height: 568 });
    await phoneSteps.step('private-programming-small-phone', {
      description: 'A short narrow phone preserves readable card proportions and touch targets',
      status: 'skip',
      verifications: [
        {
          spec: 'The 320 by 568 controller fits every card, register, and action without clipping',
          check: async () => {
            await expectFixedPrivateViewport(firstPhone);
            await expectProportionalPrivateProgramCards(firstPhone, 60);
          }
        }
      ]
    });
    await firstPhone.setViewportSize({ width: 820, height: 1180 });
    await expectFixedPrivateViewport(firstPhone);
    await firstPhone.setViewportSize({ width: 852, height: 393 });
    await phoneSteps.step('private-programming-landscape', {
      description: 'Landscape separates the Program hand from its register and action rail',
      status: 'skip',
      verifications: [
        {
          spec: 'The wide short controller uses both axes while retaining portrait Program cards',
          check: async () => {
            await expectFixedPrivateViewport(firstPhone);
            await expectProportionalPrivateProgramCards(firstPhone, 50);
          }
        }
      ]
    });
    await firstPhone.setViewportSize(privateControllerOptions.viewport);
    await expectFixedPrivateViewport(firstPhone);

    await steps.step('configured-tabletop-course', {
      description: 'Joined players surround the fully visible configured course',
      status: 'skip',
      verifications: [
        {
          spec: 'Each scanned phone occupies the physical position encoded by its QR link',
          check: async () => {
            await expect(table.locator('[data-seat="7"]')).toContainText('Ada');
            await expect(table.locator('[data-seat="2"]')).toContainText('Grace');
          }
        },
        {
          spec: 'The course fills its center viewport with square, fully visible cells',
          check: async () => {
            await expect(courseBoard).toBeVisible();
            await expect(sharedTable).toHaveAttribute('data-course-layout', 'side-seats');
            await expect(courseBoard).toHaveAttribute('data-tabletop-orientation', 'natural');
            expect(Math.abs(cellBounds!.width - cellBounds!.height)).toBeLessThanOrEqual(1);
            await expect(table.getByLabel('Board view controls')).toHaveCount(0);
            await expect(table.getByText('Course text equivalent')).toHaveCount(0);
            await expectFixedViewport(table);
          }
        },
        {
          spec: 'Claimed positions show public Life, damage, power, and ordered flag tracks',
          check: async () => {
            await expect(adaSeat.locator('.life-track i.remaining')).toHaveCount(3);
            await expect(adaSeat.locator('.damage-track i.available')).toHaveCount(10);
            await expect(adaSeat.locator('.power-state')).toContainText('ACTIVE');
            await expect(adaSeat.locator('.flag-track i')).toHaveCount(3);
          }
        },
        {
          spec: 'Private phones receive Program decks without course controls',
          check: async () => {
            await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
            await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
            await expect(firstPhone.getByLabel('Course')).toHaveCount(0);
            await expect(secondPhone.getByLabel('Course')).toHaveCount(0);
          }
        },
        {
          spec: 'Private Program controllers fill the phone viewport and support touch dragging without scrolling',
          check: async () => {
            await expectFixedPrivateViewport(firstPhone);
            await expectFixedPrivateViewport(secondPhone);
            await expect(touchRegister).toContainText(touchCardPriority);
          }
        }
      ]
    });

    await submitVisibleProgram(firstPhone);
    await submitVisibleProgram(secondPhone);

    await expect(table.getByTestId('tabletop-program-countdown')).toBeVisible();
    await advanceSyntheticPlayback([table]);
    await advanceSyntheticPlayback([table]);
    await advanceSyntheticPlayback([table]);
    await expect(table.getByTestId('tabletop-register-playback')).toBeVisible();
    await expect(table.getByTestId('tabletop-register-playback')).toHaveAttribute(
      'data-stage',
      'program-card'
    );
    const playbackCopies = table.getByTestId('tabletop-register-playback').locator('.playback-copy');
    await expect(playbackCopies).toHaveCount(2);
    await expect(
      table.getByTestId('tabletop-register-playback').locator('[data-table-facing="west"]')
    ).toHaveCount(1);
    await expect(
      table.getByTestId('tabletop-register-playback').locator('[data-table-facing="east"]')
    ).toHaveCount(1);
    for (
      let advance = 0;
      advance < 100 && (await table.locator('.program-card.revealed').count()) < 10;
      advance += 1
    ) {
      await advanceSyntheticPlayback([table]);
    }
    await expect(table.locator('.program-card.revealed')).toHaveCount(10);
    await steps.step('animated-program-execution', {
      description: 'The tabletop reveals both Programs during staged register playback',
      verifications: [
        {
          spec: 'Mirrored playback rails remain in the course gutters without covering the board',
          check: async () => {
            await expect(table.locator('.program-card.revealed')).toHaveCount(10);
            const board = await courseBoard.boundingBox();
            const wrap = await table.locator('.course-wrap').boundingBox();
            const near = await playbackCopies.nth(0).boundingBox();
            const far = await playbackCopies.nth(1).boundingBox();
            expect(board).not.toBeNull();
            expect(wrap).not.toBeNull();
            expect(near).not.toBeNull();
            expect(far).not.toBeNull();
            expect(near!.x + near!.width).toBeLessThanOrEqual(board!.x + 1);
            expect(far!.x).toBeGreaterThanOrEqual(board!.x + board!.width - 1);
            expect(near!.x).toBeGreaterThanOrEqual(wrap!.x - 1);
            expect(far!.x + far!.width).toBeLessThanOrEqual(wrap!.x + wrap!.width + 1);
            await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toHaveCount(0);
            await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toHaveCount(0);
          }
        }
      ]
    });
    await finishSyntheticPlayback([table]);
    await completePrivateResolutionChoices(table, [firstPhone, secondPhone]);
    await expect.poll(() => table.locator('.damage-track i.taken').count()).toBeGreaterThan(0);
    await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect
      .poll(() =>
        table.evaluate(() => window.__roborallyE2ePresentationRevealAttempts ?? 0)
      )
      .toBeGreaterThanOrEqual(2);
    await expect(table.getByRole('alert')).toHaveCount(0);

    const firstTurnTwoCards = 9 - await adaSeat.locator('.damage-track i.taken').count();
    const secondTurnTwoCards =
      9 - await table.locator('[data-seat="2"] .damage-track i.taken').count();
    await firstPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await secondPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await expect(firstPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expect(secondPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expectVisiblePrivateHand(firstPhone, firstTurnTwoCards);
    await expectVisiblePrivateHand(secondPhone, secondTurnTwoCards);

    const phones = [firstPhone, secondPhone];
    const damagedPhones = [];
    if (await adaSeat.locator('.damage-track i.taken').count()) damagedPhones.push(firstPhone);
    if (await table.locator('[data-seat="2"] .damage-track i.taken').count()) {
      damagedPhones.push(secondPhone);
    }
    expect(damagedPhones.length).toBeGreaterThan(0);

    const queuedPowerPhone = damagedPhones[0];
    const alreadyLockedPhone = phones.find((phone) => phone !== queuedPowerPhone)!;
    await submitVisibleProgram(alreadyLockedPhone);
    let earlyPowerResponses = 0;
    await expect.poll(async () => {
      if (
        (await queuedPowerPhone
          .locator('.private-programming')
          .getAttribute('data-power-choice-queued')) === 'true'
      ) {
        return true;
      }
      const earlyChoice = alreadyLockedPhone.getByLabel('Power-down choice');
      if (await earlyChoice.isVisible()) {
        await earlyChoice.getByRole('button', { name: 'STAY ACTIVE' }).click();
        earlyPowerResponses += 1;
      }
      return false;
    }).toBe(true);
    await expect(queuedPowerPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(queuedPowerPhone.getByLabel('Power-down choice')).toHaveCount(0);
    phoneSteps.setPage(queuedPowerPhone);
    await phoneSteps.step('programming-before-power-choice', {
      description: 'An unfinished Program remains the only active task when power is queued',
      status: 'skip',
      verifications: [
        {
          spec: 'The ordered power prompt waits until this player locks all five registers',
          check: async () => {
            await expect(queuedPowerPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
            await expect(queuedPowerPhone.getByLabel('Power-down choice')).toHaveCount(0);
            await expectFixedPrivateViewport(queuedPowerPhone);
          }
        }
      ]
    });

    await submitVisibleProgram(queuedPowerPhone);
    const shutdownIndex = await phoneWithPowerChoice(phones);
    const shutdownPhone = phones[shutdownIndex];
    const activePhone = phones[1 - shutdownIndex];
    await shutdownPhone.getByRole('button', { name: 'POWER DOWN' }).click();

    for (
      let response = earlyPowerResponses + 1;
      response < damagedPhones.length;
      response += 1
    ) {
      const nextIndex = await phoneWithPowerChoice(phones);
      await phones[nextIndex].getByRole('button', { name: 'STAY ACTIVE' }).click();
    }
    await completePrivateResolutionChoices(table, phones, 3);

    await firstPhone.getByRole('button', { name: 'BEGIN TURN 3' }).click();
    await secondPhone.getByRole('button', { name: 'BEGIN TURN 3' }).click();
    const activePhoneNeedsPowerChoice =
      (await activePhone.getByLabel('Your Program hand').getByRole('button').count()) < 9;
    await submitVisibleProgram(activePhone);

    let activePhoneResponded = false;
    while (!(await shutdownPhone.getByLabel('Power-down choice').isVisible())) {
      const nextIndex = await phoneWithPowerChoice(phones);
      if (phones[nextIndex] === shutdownPhone) break;
      await phones[nextIndex].getByRole('button', { name: 'STAY ACTIVE' }).click();
      activePhoneResponded = true;
    }

    await expect(shutdownPhone.getByRole('heading', { name: 'Next-turn power' })).toBeVisible();
    await expect(shutdownPhone.getByRole('button', { name: 'POWER DOWN' })).toBeEnabled();
    await expect(shutdownPhone.getByRole('button', { name: 'STAY ACTIVE' })).toBeEnabled();
    await expect(shutdownPhone.getByRole('heading', { name: 'Program deck' })).toHaveCount(0);
    await expect(
      shutdownPhone.getByRole('button', { name: 'READY · WATCH THE TABLE' })
    ).toHaveCount(0);

    steps.setPage(shutdownPhone);
    await steps.step('private-power-down-choice', {
      description: 'A private controller handles its next-turn power choice without a Program hand',
      status: 'skip',
      verifications: [
        {
          spec: 'A powered-down controller can remain shut down or return active without exposing a hand',
          check: async () => {
            await expect(shutdownPhone.getByRole('heading', { name: 'Next-turn power' })).toBeVisible();
            await expect(shutdownPhone.getByRole('button', { name: 'POWER DOWN' })).toBeEnabled();
            await expect(shutdownPhone.getByRole('button', { name: 'STAY ACTIVE' })).toBeEnabled();
            await expect(shutdownPhone.getByRole('heading', { name: 'Program deck' })).toHaveCount(0);
          }
        }
      ]
    });
    steps.setPage(table);

    await shutdownPhone.getByRole('button', { name: 'STAY ACTIVE' }).click();
    if (activePhoneNeedsPowerChoice && !activePhoneResponded) {
      const nextIndex = await phoneWithPowerChoice(phones);
      expect(phones[nextIndex]).toBe(activePhone);
      await activePhone.getByRole('button', { name: 'STAY ACTIVE' }).click();
    }
    await expect(table.locator('p.sr-only')).toContainText('Turn 3 ·');
    steps.generateDocs();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('a replacement tabletop releases controls after replay catches up', async ({
  browser,
  page: originalTable
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R20PHN' : 'R20DSK';
  const phoneOptions = { viewport: { width: 393, height: 852 }, hasTouch: true };
  const firstContext = await browser.newContext(phoneOptions);
  const secondContext = await browser.newContext(phoneOptions);
  const replacementContext = await browser.newContext({
    viewport: originalTable.viewportSize() ?? { width: 1280, height: 1000 }
  });
  const firstPhone = await firstContext.newPage();
  const secondPhone = await secondContext.newPage();
  const replacementTable = await replacementContext.newPage();

  try {
    await enableSyntheticPlaybackClock(originalTable);
    await originalTable.goto(`/tt/?e2eRoomCode=${roomCode}`);
    const firstJoin = await originalTable
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 1` })
      .getAttribute('href');
    const secondJoin = await originalTable
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 2` })
      .getAttribute('href');
    expect(firstJoin).not.toBeNull();
    expect(secondJoin).not.toBeNull();

    await firstPhone.goto(firstJoin!);
    await firstPhone.getByLabel('Racer name').fill('Ada');
    await firstPhone.getByRole('button', { name: 'Axle' }).click();
    await firstPhone.getByRole('button', { name: 'CLAIM POSITION 1' }).click();
    await secondPhone.goto(secondJoin!);
    await secondPhone.getByLabel('Racer name').fill('Grace');
    await secondPhone.getByRole('button', { name: 'Bit' }).click();
    await secondPhone.getByRole('button', { name: 'CLAIM POSITION 2' }).click();

    await originalTable.getByLabel('Course', { exact: true }).selectOption('risky-exchange');
    await originalTable.getByLabel('Setup seed').fill('REPLACEMENT-TABLE');
    await originalTable.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    await firstPhone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await secondPhone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await submitVisibleProgram(firstPhone);
    await submitVisibleProgram(secondPhone);
    await expect(originalTable.getByTestId('tabletop-program-countdown')).toBeVisible();

    // Losing browser storage changes the anonymous Firebase UID. A tabletop
    // opened in a fresh context must still be able to release the next control.
    await originalTable.close();
    await enableSyntheticPlaybackClock(replacementTable);
    await replacementTable.goto(`/tt/?room=${roomCode}`);
    await expect(replacementTable.getByTestId('tabletop-program-countdown')).toBeVisible();
    await finishSyntheticPlayback([replacementTable]);
    await completePrivateResolutionChoices(replacementTable, [firstPhone, secondPhone]);

    await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect.poll(() => replacementTable.evaluate((code) => {
      const cache = JSON.parse(
        localStorage.getItem(`roborally.room-events.v1.${code.toLowerCase()}`) ?? '{"events":[]}'
      ) as {
        events: { type: string; actorUid: string }[];
      };
      const creator = cache.events.find(({ type }) => type === 'game/created');
      const reveal = cache.events.find(
        ({ type }) => type === 'presentation/decision-revealed'
      );
      return !!creator && !!reveal && creator.actorUid !== reveal.actorUid;
    }, roomCode)).toBe(true);
  } finally {
    await Promise.all([
      firstContext.close(),
      secondContext.close(),
      replacementContext.close()
    ]);
  }
});
