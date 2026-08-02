import { expect, test } from '@playwright/test';
import { ALL_BOARD_FACES } from '../../../src/lib/game/board-catalog';
import { TestStepHelper } from '../helpers/test-step-helper';

test('every board route renders its manifest with square generated raster tiles', async ({
  page
}, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Generated artwork for every 2005 board face',
    'Each standalone board route renders the reviewed semantic manifest with the generated industrial raster tile family. Every board is captured independently so the artwork and its placement can be reviewed at a glance.'
  );

  for (const board of ALL_BOARD_FACES) {
    const readableName = board.id.replaceAll('-', ' ');
    await page.goto(`/boards/${board.id}/`);

    await steps.step(`${board.id}-board-artwork`, {
      description: `${readableName} uses the generated square tile artwork`,
      verifications: [
        {
          spec: `The /boards/${board.id}/ route identifies the intended reviewed board face`,
          check: async () => {
            await expect(page).toHaveTitle(`${readableName} board — Robo Rally`);
            await expect(page.getByRole('heading', { name: `${readableName} board face` })).toBeAttached();
          }
        },
        {
          spec: `The ${board.width} × ${board.height} manifest renders all ${board.width * board.height} cells`,
          check: async () => {
            const grid = page.getByRole('grid', { name: `${readableName} board face` });
            await expect(grid).toHaveAttribute('aria-rowcount', String(board.height));
            await expect(grid).toHaveAttribute('aria-colcount', String(board.width));
            await expect(grid.getByRole('gridcell')).toHaveCount(board.width * board.height);
          }
        },
        {
          spec: 'Every cell is square and every generated raster asset is fully loaded',
          check: async () => {
            const grid = page.getByRole('grid', { name: `${readableName} board face` });
            const firstCell = grid.getByRole('gridcell').first();
            const bounds = await firstCell.boundingBox();
            expect(bounds).not.toBeNull();
            expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThanOrEqual(0.1);
            await expect
              .poll(() =>
                grid.locator('img').evaluateAll((images) =>
                  images.every(
                    (image) =>
                      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
                  )
                )
              )
              .toBe(true);
          }
        }
      ]
    });
  }

  steps.generateDocs();
});
