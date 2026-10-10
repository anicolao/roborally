import { expect, test, type Page } from '@playwright/test';
import { PUBLISHED_COURSES } from '../../../src/lib/game/course-catalog';
import { ROBOTS } from '../../../src/lib/room-model';
import { TestStepHelper } from '../helpers/test-step-helper';
import { enableSyntheticPlaybackClock, advanceSyntheticPlayback, finishSyntheticPlayback } from '../helpers/playback-clock';
import { rewindSubmissionDeadline } from '../helpers/program-deadline';

async function fillProgram(page: Page) {
  const hand = page.getByLabel('Your Program hand').getByRole('button');
  for (let i = 0; i < 5; i++) await hand.nth(i).click();
  await page.getByRole('button', { name: 'Lock program', exact: true }).click();
}

test('all published scenarios can be selected, set up, and dealt through ordinary player controls', async ({ browser, page: host }, testInfo) => {
  test.setTimeout(900_000);
  const steps = new TestStepHelper(host, testInfo);
  steps.setMetadata('Play every published 2005 scenario', 'All 34 courses cross real configuration and readiness events. Players choose Tricksy Options and Capture the Flag deployment, switch Interference hands, and use the published clocks. Moving Targets visibly moves flags during a real programmed turn.');
  await enableSyntheticPlaybackClock(host);
  for (const [index, course] of PUBLISHED_COURSES.entries()) {
    const room = `S29${testInfo.project.name === 'phone' ? 'P' : 'D'}${String(index).padStart(2, '0')}`;
    const contexts = await Promise.all(Array.from({ length: course.players[0] - 1 }, () => browser.newContext()));
    const guests = await Promise.all(contexts.map((context) => context.newPage()));
    const pages = [host, ...guests];
    try {
      await host.goto(`/?e2eIdentity=SCENARIO-HOST&e2eRoomCode=${room}&e2eSeed=PUBLISHED-ROOM`);
      await expect(host.getByRole('status')).toHaveText('Connected');
      await host.getByRole('button', { name: 'Create race', exact: true }).click();
      await host.getByLabel('Racer name').fill('Ada');
      await host.getByRole('button', { name: 'Axle' }).click();
      await host.getByRole('button', { name: 'Create and claim seat' }).click();
      for (const [i, guest] of guests.entries()) {
        await enableSyntheticPlaybackClock(guest);
        await guest.goto(`/?room=${room}&e2eIdentity=SCENARIO-${i + 1}`);
        await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
        await guest.getByLabel('Racer name').fill(`Racer ${i + 2}`);
        await guest.getByRole('button', { name: ROBOTS[i + 1].name }).click();
        await guest.getByRole('button', { name: 'Claim seat', exact: true }).click();
      }
      await expect(host.getByRole('list', { name: 'Race room players' }).locator('li.claimed')).toHaveCount(course.players[0]);
      await host.getByLabel('Course', { exact: true }).selectOption(course.id);
      await host.getByRole('button', { name: `Configure ${course.name}`, exact: true }).click();
      for (const page of [...guests, host]) await page.getByRole('button', { name: 'Ready for race', exact: true }).click();
      await expect(host.getByRole('heading', { name: course.name, exact: true })).toBeVisible();
      if (course.id === 'tricksy') {
        await steps.step('tricksy-starting-options', { description: 'Tricksy offers each player three graphical Options before dealing', verifications: [{ spec: 'Only the owner sees their three choices; programming waits for everyone', check: async () => {
          await expect(host.getByLabel('Starting Option selection').getByRole('button')).toHaveCount(3);
          await expect(host.getByRole('button', { name: 'Open programming console' })).toBeDisabled();
        }}] });
        for (const page of pages) await page.getByLabel('Starting Option selection').getByRole('button').first().click();
      }
      if (course.id === 'capture-the-flag') {
        let chooser = -1;
        await expect.poll(async () => {
          chooser = (await Promise.all(pages.map((page) => page.getByRole('button', { name: 'Choose Vault', exact: true }).isVisible()))).findIndex(Boolean);
          return chooser;
        }).toBeGreaterThanOrEqual(0);
        await pages[chooser].getByRole('button', { name: 'Choose Vault', exact: true }).click();
        for (let deployed = 0; deployed < pages.length; deployed++) {
          let next = -1;
          await expect.poll(async () => {
            next = (await Promise.all(pages.map((page) => page.getByRole('button', { name: 'Place my robot', exact: true }).isVisible()))).findIndex(Boolean);
            return next;
          }).toBeGreaterThanOrEqual(0);
          await pages[next].getByRole('button', { name: /^Start at / }).first().click();
          await pages[next].getByRole('button', { name: 'Place my robot', exact: true }).click();
          await expect(pages[next].getByRole('button', { name: 'Place my robot', exact: true })).toHaveCount(0);
        }
      }
      const count = course.players[0] * (course.id === 'interference' ? 2 : 1);
      await expect(host.getByRole('button', { name: 'Open programming console' })).toBeEnabled();
      await steps.step(course.id, { resetScroll: true, description: `${course.name}: the published layout is ready to play`, verifications: [
        { spec: `${count} robots and ${course.flags.length} flags appear on the selected course for both players`, check: async () => {
          for (const page of [host, guests[0]]) {
            await expect(page.getByRole('heading', { name: course.name, exact: true })).toBeVisible();
            await expect(page.locator('.race-robot')).toHaveCount(count);
            await expect(page.locator('.course-flag')).toHaveCount(course.flags.length);
          }
        }}
      ] });
      await host.getByRole('button', { name: 'Open programming console' }).click();
      await expect(host.getByLabel('Your Program hand').getByRole('button')).toHaveCount(course.id === 'factory-rejects' ? 7 : 9);
      if (course.id === 'interference') {
        const racerCards = await host.getByLabel('Your Program hand').getByRole('button').allTextContents();
        const selector = host.getByLabel('Control robot');
        const blocker = await selector.locator('option').nth(1).getAttribute('value');
        await selector.selectOption(blocker!);
        await expect(host.getByLabel('Your Program hand').getByRole('button')).toHaveCount(9);
        expect(await host.getByLabel('Your Program hand').getByRole('button').allTextContents()).not.toEqual(racerCards);
        await host.getByLabel('Your Program hand').getByRole('button').first().click();
        await expect(host.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first()).not.toContainText('empty');
        await selector.selectOption({ index: 0 });
        await expect(host.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first()).toContainText('empty');
      }
      if (course.id === 'ball-lightning' || course.id === 'tight-collar') {
        await expect(host.getByRole('timer', { name: 'Course programming clock' })).toContainText('Everyone has');
        await fillProgram(host);
        await rewindSubmissionDeadline(room, 70_000);
        await expect(host.getByRole('button', { name: 'Fill timed-out program' })).toBeEnabled();
        await host.getByRole('button', { name: 'Fill timed-out program' }).click();
        await expect(host.getByRole('button', { name: 'Fill timed-out program' })).toHaveCount(0);
      }
      if (course.id === 'moving-targets') {
        await guests[0].getByRole('button', { name: 'Open programming console' }).click();
        for (const page of pages) await fillProgram(page);
        await advanceSyntheticPlayback(pages);
        await finishSyntheticPlayback(pages);
        await steps.step('moving-targets-playback', { resetScroll: true, description: 'Moving Targets conveys the flags during the programmed turn', verifications: [{ spec: 'Flag movement is visible in the log and the board no longer shows Flag 1 at its starting cell', check: async () => {
          await expect(host.locator('[data-coordinate="2,1"] .course-flag')).toHaveCount(0);
          await expect(host.locator('li:visible').filter({ hasText: /Flag 1 moved/ }).first()).toBeVisible();
        }}] });
      }
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  }
  steps.generateDocs();
});
