import { expect, test } from '@playwright/test';
import {
  BEGINNER_COURSES,
  EXPERT_COURSES,
  PUBLISHED_COURSES,
  TEAM_COURSES
} from '../../../src/lib/game/course-catalog';
import { publishedCourseRuleProbes } from '../../../src/lib/game/course-rules';
import { TestStepHelper } from '../helpers/test-step-helper';

test('all expert and team courses expose executable published exceptions', async ({
  page
}, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R15PHN' : 'R15DSK';
  await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
  await expect(page.getByRole('status')).toHaveText('Firebase emulator ready');
  await page.getByRole('button', { name: 'Create race' }).click();
  await page.getByLabel('Racer name').fill('Ada');
  await page.getByRole('button', { name: 'Axle' }).click();
  await page.getByRole('button', { name: 'Create and claim seat' }).click();

  const catalog = page.getByLabel('2005 board and course catalog');
  await catalog.getByText('10 board faces · 34 published courses · executable exceptions').click();
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
      for (const rule of course.specialRules) await expect(preview).toContainText(rule.kind);
    }
  }
  expect([...renderedIds].sort()).toEqual(PUBLISHED_COURSES.map(({ id }) => id).sort());

  await catalog.getByRole('button', { name: 'Rule probes' }).click();
  const probes = publishedCourseRuleProbes();
  await expect(catalog.locator('[data-rule-probe]')).toHaveCount(probes.length);
  for (const probe of probes) {
    const row = catalog.locator(`[data-rule-probe="${probe.id}"]`);
    await expect(row).toHaveAttribute('data-passed', 'true');
    await expect(row).toContainText(probe.evidence);
  }

  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Inspect every expert/team course and execute every exception family',
    'All 34 printed course diagrams share one reviewed manifest. Fourteen named probes execute timed programming, moving flags, laser and Option variants, SuperBot, dual robots, rotating boards, team progress, capture, toggle control, and elimination rules.'
  );
  await steps.step('complete-expert-team-catalog', {
    description: 'The published catalog and every exceptional rule family pass in product',
    verifications: [
      {
        spec: 'The inventory contains 10 beginner, 19 expert, and 5 team courses',
        check: async () => {
          expect(renderedIds.size).toBe(34);
        }
      },
      {
        spec: 'Every exceptional rule probe is executable and passing',
        check: async () => {
          await expect(catalog.locator('[data-rule-probe][data-passed="true"]')).toHaveCount(14);
        }
      },
      {
        spec: 'Alternative victories and multi-robot/team setup remain edition-specific',
        check: async () => {
          await expect(catalog).toContainText('Capture home boards and re-entry');
          await expect(catalog).toContainText('Interference racer and blocker');
          await expect(catalog).toContainText('War Zone elimination');
        }
      }
    ]
  });
  steps.generateDocs();
});
