import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('application shell reaches Firebase and renders deterministically', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Application shell and Firebase readiness',
    'The static Robo Rally client loads its factory console and reaches the local Firebase emulators.'
  );

  await page.goto('/?e2eIdentity=SHELL');
  await steps.step('firebase-ready', {
    description: 'The factory is ready for racers',
    verifications: [
      {
        spec: 'The page exposes the stable Robo Rally title',
        check: async () => expect(page).toHaveTitle('Robo Rally — Program the factory')
      },
      {
        spec: 'The landing page presents the programming premise and component counts',
        check: async () => {
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            /Program\.\s*Collide\.\s*Survive\./
          );
          await expect(page.locator('.facts dt')).toHaveText(['2–8', '84', '5', '34']);
          await expect(page.locator('.registers li')).toHaveCount(5);
        }
      },
      {
        spec: 'Room creation and join actions become available after anonymous authentication',
        check: async () => {
          await expect(page.getByRole('button', { name: 'Create race' })).toBeEnabled();
          await expect(page.getByRole('button', { name: 'Join with code' })).toBeEnabled();
        }
      },
      {
        spec: 'The client has authenticated and reached the Firebase emulators',
        check: async () =>
          expect(page.getByRole('status')).toHaveText('Firebase emulator ready')
      },
      {
        spec: 'The deterministic build marker and GPL license are visible',
        check: async () => {
          await expect(page.getByTestId('build-marker')).toHaveText('Build e2e-test');
          await expect(page.getByText('GPL-3.0-only')).toBeVisible();
        }
      }
    ]
  });

  steps.generateDocs();
});
