import { expect, test } from '@playwright/test';
import {
  advanceSyntheticPlayback,
  enableSyntheticPlaybackClock,
  finishSyntheticPlayback
} from '../helpers/playback-clock';
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

async function submitVisibleProgram(page: import('@playwright/test').Page) {
  const cards = page.locator('.hand button');
  const lockProgram = page.getByRole('button', { name: 'Lock program' });
  for (let index = 0; index < await cards.count(); index += 1) {
    await cards.nth(index).click();
    if (await lockProgram.isEnabled()) break;
  }
  await lockProgram.click();
}

async function completePrivateResolutionChoices(
  pages: import('@playwright/test').Page[],
  nextTurnNumber = 2
) {
  await expect.poll(async () => {
    for (const page of pages) {
      const optionLoss = page.getByLabel('Destroyed robot Option loss').getByRole('button');
      if (await optionLoss.first().isVisible()) {
        await optionLoss.first().click();
        return false;
      }

      const reentry = page.getByLabel('Re-entry cell and facing');
      if (await reentry.isVisible()) {
        await reentry.selectOption({ index: 1 });
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
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPhone = await firstContext.newPage();
  const secondPhone = await secondContext.newPage();
  const steps = new TestStepHelper(table, testInfo);
  steps.setMetadata(
    'Tabletop QR joining and configuration',
    'The shared display creates a fresh room, exposes eight position-specific QR joins, owns race configuration, renders the course and public player state, and animates Program execution while phones retain private choices.'
  );

  try {
    await enableSyntheticPlaybackClock(table);
    await table.goto(`/tt/?e2eIdentity=TABLE&e2eRoomCode=${roomCode}`);
    await expect(table.locator('[data-e2e-tabletop]')).toHaveAttribute('data-room-code', roomCode);
    await expect(table.locator('header, footer')).toHaveCount(0);
    await expectFixedViewport(table);
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
    await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
    await expect(table.getByRole('button', { name: 'CONFIGURE RACE' })).toBeDisabled();

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
    await expect(firstPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(secondPhone.getByRole('heading', { name: 'Program deck' })).toBeVisible();
    await expect(firstPhone.getByLabel('Course')).toHaveCount(0);
    await expect(secondPhone.getByLabel('Course')).toHaveCount(0);

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
          spec: 'Claimed positions show public Life, damage, and power tracks',
          check: async () => {
            await expect(adaSeat.locator('.life-track i.remaining')).toHaveCount(3);
            await expect(adaSeat.locator('.damage-track i.available')).toHaveCount(10);
            await expect(adaSeat.locator('.power-state')).toContainText('ACTIVE');
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
      status: 'skip',
      verifications: [
        {
          spec: 'All ten Program cards are face up while register playback remains visible',
          check: async () => {
            await expect(table.locator('.program-card.revealed')).toHaveCount(10);
            await expect(table.getByTestId('tabletop-register-playback')).toBeVisible();
            await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toHaveCount(0);
            await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toHaveCount(0);
          }
        }
      ]
    });
    await finishSyntheticPlayback([table]);
    await completePrivateResolutionChoices([firstPhone, secondPhone]);
    await expect.poll(() => table.locator('.damage-track i.taken').count()).toBeGreaterThan(0);
    await expect(firstPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();
    await expect(secondPhone.getByRole('button', { name: 'BEGIN TURN 2' })).toBeVisible();

    await firstPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await secondPhone.getByRole('button', { name: 'BEGIN TURN 2' }).click();
    await expect(firstPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expect(secondPhone.getByText('Choose five registers privately for turn 2.')).toBeVisible();
    await expect(firstPhone.locator('.hand button').first()).toBeEnabled();
    await expect(secondPhone.locator('.hand button').first()).toBeEnabled();

    const phones = [firstPhone, secondPhone];
    const damagedPhones = [];
    if (await adaSeat.locator('.damage-track i.taken').count()) damagedPhones.push(firstPhone);
    if (await table.locator('[data-seat="2"] .damage-track i.taken').count()) {
      damagedPhones.push(secondPhone);
    }
    expect(damagedPhones.length).toBeGreaterThan(0);

    await submitVisibleProgram(firstPhone);
    const shutdownIndex = await phoneWithPowerChoice(phones);
    const shutdownPhone = phones[shutdownIndex];
    const activePhone = phones[1 - shutdownIndex];
    await shutdownPhone.getByRole('button', { name: 'POWER DOWN' }).click();

    for (let response = 1; response < damagedPhones.length; response += 1) {
      const nextIndex = await phoneWithPowerChoice(phones);
      await phones[nextIndex].getByRole('button', { name: 'STAY ACTIVE' }).click();
    }
    await submitVisibleProgram(secondPhone);
    await completePrivateResolutionChoices(phones, 3);

    await firstPhone.getByRole('button', { name: 'BEGIN TURN 3' }).click();
    await secondPhone.getByRole('button', { name: 'BEGIN TURN 3' }).click();
    const activePhoneNeedsPowerChoice = (await activePhone.locator('.hand button').count()) < 9;
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
