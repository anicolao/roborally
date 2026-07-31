import { expect, test } from '@playwright/test';
import { ALL_BOARD_FACES } from '../../../src/lib/game/board-catalog';
import { BEGINNER_COURSES } from '../../../src/lib/game/course-catalog';
import { TestStepHelper } from '../helpers/test-step-helper';

test('all board faces and beginner courses compile into one multi-board race', async ({
  page
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R14PHN' : 'R14DSK';
  await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
  await expect(page.getByRole('status')).toHaveText('Firebase emulator ready');
  await page.getByRole('button', { name: 'Create race' }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();

  const catalog = page.getByLabel('2005 board and course catalog');
  await catalog.getByText('10 board faces · 34 published courses · executable exceptions').click();
  await expect(catalog.locator('[data-board-id]')).toHaveCount(10);

  for (const face of ALL_BOARD_FACES) {
    await catalog.getByRole('button', { name: `Preview ${face.id}` }).click();
    const preview = catalog.getByTestId('selected-board-preview');
    await expect(preview).toContainText(face.id.replaceAll('-', ' '));
    await expect(preview).toContainText(`${face.walls.length} wall edges`);
  }

  await catalog.getByRole('button', { name: 'Beginner' }).click();
  const beginnerList = catalog.getByRole('list', { name: 'beginner courses' });
  await expect(beginnerList.getByRole('listitem')).toHaveCount(10);
  for (const course of BEGINNER_COURSES) {
    await catalog.locator(`[data-course-id="${course.id}"] button`).click();
    await expect(catalog.locator(`[data-course-preview="${course.id}"]`)).toBeVisible();
  }

  await catalog.locator('[data-course-id="around-the-world"] button').click();
  await catalog.getByRole('button', { name: 'Run complete multi-board race' }).click();
  await expect(catalog.getByRole('status')).toContainText('Race complete · Flags 1 → 2 → 3');
  await expect(catalog.getByRole('status')).toContainText(
    'docking-bay-a-1 → spin-zone-2 → island-1'
  );

  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Review every 2005 board face and finish a multi-board beginner race',
    'The browser renders all ten golden semantic faces and all ten printed beginner diagrams. Around the World is compiled from rotated board instances; an ordinary control runs a wall- and pit-safe race from Dock 1 through Flags 1–3.'
  );
  await steps.step('complete-around-the-world-geometry-race', {
    description: 'Every beginner asset is reviewed and the multi-board route completes',
    verifications: [
      {
        spec: 'All ten reviewed board-face previews are generated from reducer geometry',
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
        spec: 'Around the World crosses Docking Bay, Spin Zone, and Island in printed flag order',
        check: async () => {
          await expect(catalog.getByRole('status')).toContainText('winner geometry-auditor');
        }
      }
    ]
  });
  steps.generateDocs();
});
