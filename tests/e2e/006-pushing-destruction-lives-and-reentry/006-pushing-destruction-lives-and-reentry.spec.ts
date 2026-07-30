import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

async function chooseProgram(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
}

test('ordinary Programs push, destroy, spend Lives, and pause for ordered re-entry', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R6PHON' : 'R6DESK';
  let guestContext: BrowserContext | undefined;

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Push, destroy, spend Lives, and re-enter',
      'Two ordinary immutable Programs form a deterministic push chain. One robot is pushed off course, the pusher follows it over the edge, and both owners answer cleanup re-entry choices in destruction order.'
    );

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('PUSH-416');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    await chooseProgram(host, [
      'move-1 priority 520',
      'rotate-left priority 300',
      'u-turn priority 60',
      'rotate-right priority 170',
      'rotate-left priority 140'
    ]);
    await chooseProgram(guest, [
      'move-1 priority 570',
      'rotate-right priority 250',
      'move-3 priority 800',
      'move-3 priority 820',
      'move-3 priority 790'
    ]);

    await expect(host.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();
    await expect(guest.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();

    await steps.step('both-robots-destroyed-in-order', {
      description: 'A chained push and the following Program step destroy both robots in order',
      verifications: [
        {
          spec: 'Grace pushes Ada repeatedly before Ada is destroyed off course first',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Ada was pushed east');
            await expect(trace).toContainText('Ada was destroyed off course as destruction 1');
            await expect(trace).toContainText('Grace was destroyed off course as destruction 2');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Each destruction runs the Option-loss hook and spends exactly one Life',
          check: async () => {
            const state = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(state).toContainText('Ada destroyed · 2 Lives · 0 Damage');
            await expect(state).toContainText('Grace destroyed · 2 Lives · 0 Damage');
          }
        },
        {
          spec: 'Destroyed robots leave the board immediately',
          check: async () => {
            await expect(host.locator('.race-robot')).toHaveCount(0);
          }
        },
        {
          spec: 'Only the first destroyed robot owner receives the first re-entry control',
          check: async () => {
            await expect(host.getByLabel('Re-entry cell and facing')).toBeVisible();
            await expect(guest.getByText('Waiting for Ada to choose re-entry.')).toBeVisible();
          }
        }
      ]
    });

    await host
      .getByLabel('Re-entry cell and facing')
      .selectOption({ label: '(7,15) facing north' });
    await host.getByRole('button', { name: 'Confirm re-entry' }).click();
    await expect(guest.getByLabel('Re-entry cell and facing')).toBeVisible();
    await guest
      .getByLabel('Re-entry cell and facing')
      .selectOption({ label: '(6,15) facing east' });
    await guest.getByRole('button', { name: 'Confirm re-entry' }).click();

    await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await expect(guest.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await steps.step('ordered-reentry-complete', {
      description: 'Both owners re-enter on their archives with two damage',
      verifications: [
        {
          spec: 'Destruction order authorizes Ada before Grace',
          check: async () => {
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Ada re-entered at (7,15) facing north');
            await expect(trace).toContainText('Grace re-entered at (6,15) facing east');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Each returning robot has two damage and two remaining Lives',
          check: async () => {
            const state = host.getByRole('list', { name: 'Robot Life and damage state' });
            await expect(state).toContainText('Ada active · 2 Lives · 2 Damage');
            await expect(state).toContainText('Grace active · 2 Lives · 2 Damage');
          }
        },
        {
          spec: 'Both clients converge on the chosen cells and facings',
          check: async () => {
            await expect(host.locator('[data-coordinate="7,15"] .race-robot')).toHaveAttribute(
              'title',
              /Ada, Axle, facing north/
            );
            await expect(guest.locator('[data-coordinate="6,15"] .race-robot')).toHaveAttribute(
              'title',
              /Grace, Bit, facing east/
            );
          }
        },
        {
          spec: 'The UI exposes the adjacent-cell and three-space line-of-sight shared-archive rule',
          check: async () => {
            await expect(host.getByText(/Shared archive safety/)).toContainText(
              'no robot in line of sight within three spaces'
            );
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
