import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('robot selection and the course share complete graphical robot and flag assets', async ({ page, browser }, testInfo) => {
  const room = testInfo.project.name === 'phone' ? 'ARTPHN' : 'ARTDSK';
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Choose a robot by its artwork',
    'Eight distinct robots load in the real race picker, and the same artwork joins numbered flag checkpoints on the configured board.');
  await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${room}&e2eSeed=ART-1`);
  await expect(page.getByRole('status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Create race' }).click();
  await steps.step('eight-robot-designs', {
    description: 'All eight robots have readable names and distinct artwork',
    verifications: [{ spec: 'Every robot image loads and every named robot can be selected', check: async () => {
      const names = ['Axle', 'Bit', 'Cog', 'Dash', 'Flux', 'Gizmo', 'Hex', 'Rivet'];
      for (const name of names) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toBeEnabled();
        expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await expect.poll(() => button.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 256)).toBe(true);
      }
    }}]
  });
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle', exact: true }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto(`/?room=${room}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit', exact: true }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();
    await expect(page.getByRole('button', { name: 'Configure Risky Exchange' })).toBeEnabled();
    await page.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await page.getByRole('button', { name: 'Ready for race' }).click();
    await steps.step('robots-and-repair-flags-on-board', {
      description: 'Robot bodies and numbered wrench flags share the playable board',
      verifications: [{ spec: 'Both clients load the two robots and three numbered graphical flags', check: async () => {
        for (const client of [page, guest]) {
          await expect(client.locator('.race-robot img')).toHaveCount(2);
          await expect(client.locator('.course-flag')).toHaveCount(3);
          await expect.poll(() => client.locator('.race-robot img, .course-flag img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 256))).toBe(true);
          await expect(client.locator('.race-robot.robot-axle')).toHaveAttribute('title', /Axle, facing north/);
          await expect(client.locator('.course-flag').first()).toHaveAttribute('title', 'Flag 1');
        }
      }}]
    });
    steps.generateDocs();
  } finally { await context.close(); }
});
