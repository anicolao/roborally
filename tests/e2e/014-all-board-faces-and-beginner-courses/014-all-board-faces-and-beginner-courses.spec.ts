import { expect, test } from '@playwright/test';
import { ALL_BOARD_FACES } from '../../../src/lib/game/board-catalog';
import { BEGINNER_COURSES } from '../../../src/lib/game/course-catalog';
import { TestStepHelper } from '../helpers/test-step-helper';

test('players explore every board and beginner course', async ({
  page
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R14PHN' : 'R14DSK';
  await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
  await expect(page.getByRole('status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Create race' }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();

  const catalog = page.getByLabel('2005 board and course catalog');
  await catalog.getByText('10 boards · 34 courses').click();
  await expect(catalog.locator('[data-board-id]')).toHaveCount(10);

  for (const face of ALL_BOARD_FACES) {
    await catalog.getByRole('button', { name: `Preview ${face.id}` }).click();
    const preview = catalog.getByTestId('selected-board-preview');
    await expect(preview).toContainText(face.id.replaceAll('-', ' '));
    await expect(preview).toContainText(`${face.walls.length} walls`);
  }

  await catalog.getByRole('button', { name: 'Beginner' }).click();
  const beginnerList = catalog.getByRole('list', { name: 'beginner courses' });
  await expect(beginnerList.getByRole('listitem')).toHaveCount(10);
  for (const course of BEGINNER_COURSES) {
    await catalog.locator(`[data-course-id="${course.id}"] button`).click();
    await expect(catalog.locator(`[data-course-preview="${course.id}"]`)).toBeVisible();
  }

  await catalog.locator('[data-course-id="around-the-world"] button').click();
  await expect(catalog.getByRole('img')).toHaveAccessibleName('Around the World: 3 placed board pieces and 3 flags');

  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Explore every board and beginner course',
    'Players browse ten board previews and ten beginner courses, then inspect Around the World and its three flags.'
  );
  await steps.step('around-the-world-preview', {
    description: 'The catalog shows the selected beginner course and its flags',
    verifications: [
      {
        spec: 'All ten board previews are available',
        check: async () => {
          await catalog.getByRole('button', { name: 'Board faces' }).click();
          await expect(catalog.locator('[data-board-id]')).toHaveCount(10);
          await catalog.getByRole('button', { name: 'Beginner' }).click();
        }
      },
      {
        spec: 'All ten published beginner diagrams are selectable',
        check: async () => {
          await expect(catalog.locator('[data-course-id]')).toHaveCount(10);
        }
      },
      {
        spec: 'Around the World shows its three flags without developer test controls',
        check: async () => {
          await expect(catalog.getByRole('img')).toHaveAccessibleName('Around the World: 3 placed board pieces and 3 flags');
          await expect(catalog.getByRole('button', { name: /Run complete|Rule probes/ })).toHaveCount(0);
        }
      }
    ]
  });
  steps.generateDocs();
});
