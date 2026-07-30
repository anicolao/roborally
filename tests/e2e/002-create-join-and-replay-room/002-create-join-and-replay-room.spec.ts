import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const racers = [
  { identity: 'GUEST', name: 'Grace', robot: 'Bit' },
  { identity: 'RACER-3', name: 'Lin', robot: 'Cog' },
  { identity: 'RACER-4', name: 'Edsger', robot: 'Dash' },
  { identity: 'RACER-5', name: 'Margaret', robot: 'Flux' },
  { identity: 'RACER-6', name: 'Katherine', robot: 'Gizmo' },
  { identity: 'RACER-7', name: 'Alan', robot: 'Hex' },
  { identity: 'RACER-8', name: 'Hedy', robot: 'Rivet' }
];

async function expectLobby(page: Page, roomCode: string) {
  await expect(page).toHaveTitle(`Room ${roomCode} — Robo Rally`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Room${roomCode}`);
}

test('players create, join, fill, and replay an immutable room', async (
  { browser, page },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R2PHON' : 'R2DESK';
  const contexts: BrowserContext[] = [];
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Create, join, and replay a room',
    'Eight isolated anonymous clients claim unique robots through the real Firestore event stream. Reloading replays the same ordered room.'
  );

  try {
    await page.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(page.getByRole('status')).toHaveText('Firebase emulator ready');
    await page.getByRole('button', { name: 'Create race' }).click();
    await page.getByLabel('Racer name').fill('Ada');
    await page.getByRole('button', { name: 'Axle' }).click();
    await page.getByRole('button', { name: 'Create and claim seat' }).click();
    await expectLobby(page, roomCode);
    await expect(page.getByText('Ada', { exact: true })).toBeVisible();

    for (const [index, racer] of racers.entries()) {
      const context = await browser.newContext();
      contexts.push(context);
      const racerPage = await context.newPage();
      await racerPage.goto(`/?room=${roomCode}&e2eIdentity=${racer.identity}`);
      await expect(racerPage.getByRole('status')).toHaveAttribute('data-status', 'synced');
      await expect(racerPage.getByRole('button', { name: 'Axle' })).toBeDisabled();
      await racerPage.getByLabel('Racer name').fill(racer.name);
      await racerPage.getByRole('button', { name: racer.robot }).click();
      await racerPage.getByRole('button', { name: 'Claim seat' }).click();
      await expectLobby(racerPage, roomCode);
      await expect(page.getByRole('list', { name: 'Race room players' }).getByRole('listitem'))
        .toHaveClass(new Array(8).fill(null).map((_, seat) => seat <= index + 1 ? /claimed/ : /.*/));

      if (index === 0) {
        await racerPage.reload();
        await expectLobby(racerPage, roomCode);
        await expect(racerPage.getByText('Ada', { exact: true })).toBeVisible();
        await expect(racerPage.getByText('Grace', { exact: true })).toBeVisible();
      }
    }

    const overflowContext = await browser.newContext();
    contexts.push(overflowContext);
    const overflowPage = await overflowContext.newPage();
    await overflowPage.goto(`/?room=${roomCode}&e2eIdentity=RACER-9`);
    await expect(overflowPage.getByRole('alert')).toHaveText(
      'Room full — all eight robot docks are claimed.'
    );
    await expect(overflowPage.getByRole('button', { name: 'Claim seat' })).toBeDisabled();
    await expect(overflowPage.locator('.robot-options button:disabled')).toHaveCount(8);

    await steps.step('full-room-replayed', {
      description: 'Eight unique robots share one replay-clean room',
      verifications: [
        {
          spec: 'The creator and seven joiners occupy the eight original Dock-order seats',
          check: async () => {
            await expect(page.locator('.seats li.claimed')).toHaveCount(8);
            await expect(page.locator('.seat-name strong')).toHaveText([
              'Ada',
              'Grace',
              'Lin',
              'Edsger',
              'Margaret',
              'Katherine',
              'Alan',
              'Hedy'
            ]);
          }
        },
        {
          spec: 'The room projects nine accepted immutable events with no replay diagnostics',
          check: async () => {
            await expect(page.getByText('9', { exact: true })).toBeVisible();
            await expect(page.getByText('0', { exact: true })).toBeVisible();
            await expect(page.getByText('Replay clean')).toBeVisible();
          }
        },
        {
          spec: 'Reloading a joined client reconstructs both observed players from Firestore',
          check: async () => {
            const guestPage = contexts[0].pages()[0];
            await expect(guestPage.getByText('Ada', { exact: true })).toBeVisible();
            await expect(guestPage.getByText('Grace', { exact: true })).toBeVisible();
          }
        },
        {
          spec: 'Claimed robots are unavailable and a ninth client sees a full room',
          check: async () => {
            await expect(overflowPage.locator('.robot-options button:disabled')).toHaveCount(8);
            await expect(overflowPage.getByRole('alert')).toContainText('Room full');
          }
        },
        {
          spec: 'The creator has a shareable join link and a deterministic emulator identity',
          check: async () => {
            await expect(page.getByRole('link', { name: 'Open join link' })).toHaveAttribute(
              'href',
              new RegExp(`room=${roomCode}`)
            );
            await expect(page.getByText('Identity HOST')).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
