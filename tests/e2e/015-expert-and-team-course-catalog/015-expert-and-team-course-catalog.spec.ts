import { expect, test } from '@playwright/test';
import {
  BEGINNER_COURSES,
  EXPERT_COURSES,
  PUBLISHED_COURSES,
  TEAM_COURSES
} from '../../../src/lib/game/course-catalog';
import { TestStepHelper } from '../helpers/test-step-helper';

test('players explore every expert and team course with readable rules', async ({
  page
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R15PHN' : 'R15DSK';
  await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
  await expect(page.getByRole('status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Create race' }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();

  const catalog = page.getByLabel('2005 board and course catalog');
  await catalog.getByText('10 boards · 34 courses').click();
  const categories = [
    ['Beginner', BEGINNER_COURSES],
    ['Expert', EXPERT_COURSES],
    ['Team', TEAM_COURSES]
  ] as const;
  const renderedIds = new Set<string>();
  for (const [label, courses] of categories) {
    await catalog.getByRole('button', { name: label, exact: true }).click();
    await expect(catalog.locator('[data-course-id]')).toHaveCount(courses.length);
    for (const course of courses) {
      const entry = catalog.locator(`[data-course-id="${course.id}"]`);
      renderedIds.add(course.id);
      await entry.getByRole('button').click();
      const preview = catalog.locator(`[data-course-preview="${course.id}"]`);
      await expect(preview).toContainText(course.name);
      await expect(preview).toContainText(`PAGE ${course.manualPage}`);
      await expect(preview).toContainText(course.description);
      for (const rule of course.specialRules) {
        if (rule.kind.includes('-')) await expect(preview).not.toContainText(rule.kind);
      }
    }
  }
  expect([...renderedIds].sort()).toEqual(PUBLISHED_COURSES.map(({ id }) => id).sort());

  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Explore every expert and team course',
    'Players can browse all 34 courses, see their layouts, and read course descriptions and special rules. Developer rule probes and raw rule identifiers are absent.'
  );
  await steps.step('complete-expert-team-catalog', {
    description: 'The catalog explains team courses in player language',
    verifications: [
      {
        spec: 'The inventory contains 10 beginner, 19 expert, and 5 team courses',
        check: async () => {
          expect(renderedIds.size).toBe(34);
        }
      },
      {
        spec: 'Rule-test controls are absent',
        check: async () => {
          await expect(catalog.getByRole('button', { name: 'Rule probes' })).toHaveCount(0);
        }
      },
      {
        spec: 'War Zone explains its team objective and starting Options',
        check: async () => {
          await expect(catalog.locator('[data-course-preview]')).toContainText('Eliminate the opposing team.');
          await expect(catalog.locator('[data-course-preview]')).toContainText('Start with 1 Option.');
        }
      }
    ]
  });
  steps.generateDocs();
});
