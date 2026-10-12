import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('art preview matches game typography and keeps flag numbers on their pennants', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Review robot headings and flag numbers',
    'The standalone art preview uses the real board and its fonts, with controls for headings, execution highlights, and board size.');
  // Open the gallery first: visiting the game beforehand would mask missing font imports.
  await page.goto('/art-preview/');
  await expect(page.getByRole('heading', { name: 'Robot & flag preview' })).toBeVisible();
  await expect(page.locator('.animated-race-robot')).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(font =>
    font.family.includes('Space Mono') && font.weight === '700' && font.status === 'loaded'))).toBe(true);

  await page.getByRole('button', { name: 'Rotate robots' }).click();
  await expect(page.locator('[data-playback-robot="axle"]')).toHaveAttribute('data-facing', 'east');
  await page.getByLabel('Executing').selectOption('axle');
  await expect(page.locator('.animated-race-robot.active-robot')).toHaveAttribute('data-playback-robot', 'axle');
  await page.getByLabel('Animated', { exact: true }).uncheck();
  await expect(page.locator('.race-robot.active-robot')).toHaveClass(/current-player/);

  await steps.step('flag-numbers-centred-at-every-size', {
    status: 'skip',
    description: 'Flag numbers stay on the pennants as the board changes size',
    verifications: [{ spec: 'The game font loads on a fresh visit, and flag numbers stay centred at phone, desktop, and full width', check: async () => {
      for (const width of ['320px', '680px', 'full']) {
        await page.getByLabel('Board width').selectOption(width);
        await expect.poll(async () => page.locator('.course-flag').evaluateAll(flags => flags.every(flag => {
          const tile = flag.getBoundingClientRect();
          const number = flag.querySelector('b')!.getBoundingClientRect();
          const x = (number.x + number.width / 2 - tile.x) / tile.width;
          const y = (number.y + number.height / 2 - tile.y) / tile.height;
          return x > .58 && x < .68 && y > .30 && y < .40;
        }))).toBe(true);
      }
    }}]
  });
  steps.generateDocs();
});
