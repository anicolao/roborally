import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { enableSyntheticPlaybackClock } from '../helpers/playback-clock';

async function computerPrograms(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('roborally.room-events.') && key.endsWith((new URL(location.href).searchParams.get('room') ?? new URL(location.href).searchParams.get('e2eRoomCode') ?? '').toLowerCase()));
    if (!key) return [];
    const { events } = JSON.parse(localStorage.getItem(key)!);
    const bots = new Set(events.filter((e: any) => e.type === 'player/joined' && e.payload.computerOwnerUid).map((e: any) => e.actorUid));
    return events.filter((e: any) => e.type === 'program/submitted' && bots.has(e.actorUid));
  });
}

test('a host adds a computer which readies and programs without a private controller', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Race a simple computer', 'A host adds a computer with its own identity, configures a race, and receives its automatically submitted program. Reloading the host keeps that computer connected.');
  const room = `C31${testInfo.project.name === 'phone' ? 'P' : 'D'}AA`;
  await enableSyntheticPlaybackClock(page);
  await page.goto(`/?e2eRoomCode=${room}&e2eSeed=COMPUTER-PLAY`);
  await page.getByRole('button', { name: 'Create race', exact: true }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();
  await page.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Race room players' })).toContainText('Computer Bit');
  await steps.step('computer-in-lobby', { description: 'The host adds a computer to the race without opening another phone', verifications: [{ spec: 'The lobby identifies the computer and allows course configuration', check: async () => {
    await expect(page.getByRole('list', { name: 'Race room players' })).toContainText('Computer Bit');
    await expect(page.getByRole('button', { name: 'Configure Risky Exchange', exact: true })).toBeEnabled();
  }}] });
  await page.reload();
  await page.getByRole('button', { name: 'Configure Risky Exchange', exact: true }).click();
  await page.getByRole('button', { name: 'Ready for race', exact: true }).click();
  await expect.poll(async () => (await computerPrograms(page)).length).toBe(1);
  const programs = await computerPrograms(page);
  expect(programs[0].payload.cardIds).toHaveLength(5);
  expect(new Set(programs[0].payload.cardIds).size).toBe(5);
  await steps.step('computer-program-ready', { description: 'The computer chooses and locks its own five cards while Ada is still programming', verifications: [{ spec: 'The board contains both racers and the human can open their own hand', check: async () => {
    await expect(page.locator('.race-robot')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Open programming console' })).toBeEnabled();
  }}] });
  steps.generateDocs('WEB_PLAY.md');
});

test('tabletop computers continue into another turn after the host reloads', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Computer players on the tabletop', 'Two computers independently ready and program; the host advances normal playback, reloads, and receives both next-turn programs.');
  const room = `C31${testInfo.project.name === 'phone' ? 'P' : 'D'}TT`;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await enableSyntheticPlaybackClock(page);
  await page.goto(`/tt/?e2eRoomCode=${room}&course=risky-exchange&seed=COMPUTER-TABLE`);
  await page.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(page.getByText('Computer Axle', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(page.getByText('Computer Bit', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'CONFIGURE RACE', exact: true }).click();
  await expect.poll(async () => (await computerPrograms(page)).length).toBe(2);
  await page.goto(`/tt/?room=${room}`);
  await expect.poll(async () => {
    await page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.());
    return (await computerPrograms(page)).length;
  }, { timeout: 90_000, intervals: [100] }).toBeGreaterThanOrEqual(4);
  await expect.poll(async () => {
    if (await page.getByText('Moving in 1', { exact: true }).first().isVisible()) return true;
    await page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.());
    return false;
  }, { timeout: 30_000, intervals: [100] }).toBe(true);
  await steps.step('computer-second-turn', { description: 'Both computers continue playing after reloading the tabletop', verifications: [{ spec: 'Two occupied mats remain and both turn-two programs are persisted', check: async () => {
    const programs = await computerPrograms(page);
    expect(programs.filter((e: any) => e.payload.turnId === 'turn-002')).toHaveLength(2);
    await expect(page.locator('[data-log-seat]')).toHaveCount(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }}] });
  steps.generateDocs();
});

test('web computers answer damage decisions after local playback finishes', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Computer decisions during web playback', 'A computer waits until web playback reaches its laser damage decision, then answers without requiring a tabletop checkpoint.');
  const room = `C31${testInfo.project.name === 'phone' ? 'P' : 'D'}DC`;
  await enableSyntheticPlaybackClock(page);
  await page.goto(`/?e2eRoomCode=${room}&e2eCourse=option-lab&e2eSeed=BOT-CHOICE-3`);
  await page.getByRole('button', { name: 'Create race', exact: true }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();
  await page.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Race room players' })).toContainText('Computer Bit');
  await page.getByRole('button', { name: 'Configure Risky Exchange', exact: true }).click();
  await page.getByRole('button', { name: 'Ready for race', exact: true }).click();
  await page.getByRole('button', { name: 'Open programming console' }).click();
  const stay = page.getByRole('button', { name: 'Stay powered up', exact: true });
  if (await stay.isVisible()) await stay.click();
  for (const priority of [700, 470, 340, 270, 610]) {
    await page.getByLabel('Your Program hand').getByRole('button', { name: new RegExp(`priority ${priority}$`) }).click();
  }
  await page.getByRole('button', { name: 'Lock program', exact: true }).click();
  const decisions = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('roborally.room-events.') && key.endsWith(new URL(location.href).searchParams.get('room')!.toLowerCase()))!;
    const { events } = JSON.parse(localStorage.getItem(key)!);
    const bot = events.find((event: any) => event.type === 'player/joined' && event.payload.computerOwnerUid)?.actorUid;
    return events.filter((event: any) => event.type === 'effect/chosen' && event.actorUid === bot && event.payload.choice.kind === 'option-decision');
  });
  // The resolver has a pending decision, but the web clock has not shown it yet.
  await page.waitForTimeout(750);
  expect(await decisions()).toHaveLength(0);
  await expect.poll(async () => {
    await page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.());
    return (await decisions()).length;
  }, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(0);
  expect((await decisions())[0].payload.choice.choiceId).toBe('take-damage');
  await expect.poll(async () => {
    await page.evaluate(() => window.__roborallyE2ePlaybackClock?.advanceToNext?.());
    return page.getByRole('heading', { name: 'Turn 1 complete', exact: true }).isVisible();
  }, { timeout: 60_000, intervals: [100] }).toBe(true);
  await expect.poll(async () => (await computerPrograms(page)).length).toBe(2);
  await steps.step('computer-web-decision-resolved', { resetScroll: true, description: 'Computer Bit resolves its damage choice and web playback finishes the turn', verifications: [{ spec: 'The bot answered its own decision and the race is no longer waiting for it', check: async () => {
    expect((await decisions())[0].payload.choice.choiceId).toBe('take-damage');
    await expect(page.getByRole('heading', { name: 'Turn 1 complete', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }}] });
  steps.generateDocs('WEB_DECISIONS.md');
});
