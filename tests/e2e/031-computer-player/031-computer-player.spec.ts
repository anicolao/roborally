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
  await steps.step('computer-second-turn', { description: 'Both computers continue playing after reloading the tabletop', verifications: [{ spec: 'Two occupied mats remain and both turn-two programs are persisted', check: async () => {
    const programs = await computerPrograms(page);
    expect(programs.filter((e: any) => e.payload.turnId === 'turn-002')).toHaveLength(2);
    await expect(page.locator('[data-log-seat]')).toHaveCount(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }}] });
  steps.generateDocs();
});
