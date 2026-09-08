import { expect, test, type BrowserContext } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import { enableSyntheticPlaybackClock } from '../helpers/playback-clock';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the board stays visible beside graphical programming controls', async ({ browser, page: host }, testInfo) => {
  const roomCode = { phone: 'UIPHON', desktop: 'UIDESK', tablet: 'UITABL', 'mobile-landscape': 'UILAND' }[testInfo.project.name]!;
  let guestContext: BrowserContext | undefined;
  try {
    await enableSyntheticPlaybackClock(host);
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await enableSyntheticPlaybackClock(guest);
    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Board-first web play and shared graphical registers',
      'A real two-player deal keeps the board visible while graphical cards move into registers. Desktop, phone, landscape and tablet layouts retain the same controls.'
    );

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('UI-REVIEW');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();
    await stayActiveInDockOrder([host, guest]);


    const board = host.getByRole('grid', { name: /board explorer/ });
    await steps.step('board-and-hand', {
      description: 'The course stays visible while the player programs',
      resetScroll: true,
      verifications: [{
        spec: 'The board has square cells, remains visible on phones, and receives most desktop width',
        check: async () => {
          await expect(board).toBeVisible();
          const rect = (await board.boundingBox())!;
          const rows = Number(await board.getAttribute('aria-rowcount'));
          const columns = Number(await board.getAttribute('aria-colcount'));
          expect(Math.abs(rect.width / columns - rect.height / rows)).toBeLessThan(1);
          if (testInfo.project.name === 'desktop') {
            const sidebar = (await host.locator('.setup-summary').boundingBox())!;
            expect((await host.locator('.course-panel').boundingBox())!.width).toBeGreaterThan(sidebar.width * 1.5);
          }
          await expect(host.getByLabel('Your Program hand').getByRole('img')).toHaveCount(9);
          await expect(host.getByTestId('program-conservation')).toBeHidden();
        }
      }]
    });
    const cards = host.getByLabel('Your Program hand').getByRole('button');
    for (let index = 0; index < 5; index++) await cards.nth(index).click();
    await steps.step('graphical-registers', {
      description: 'Chosen registers show the same artwork as the hand and tabletop display',
      resetScroll: true,
      verifications: [{
        spec: 'All five chosen cards retain graphical commands, priorities and accessible register labels',
        check: async () => {
          const registers = host.getByRole('list', { name: 'Chosen registers' });
          await expect(registers.getByRole('img')).toHaveCount(5);
          for (let index = 0; index < 5; index++) {
            const id = await cards.nth(index).getByRole('img').getAttribute('data-card-id');
            await expect(registers.getByRole('img').nth(index)).toHaveAttribute('data-card-id', id!);
          }
          await expect(host.getByRole('button', { name: 'Submit immutable program' })).toBeEnabled();
          await expect(board).toBeVisible();
        }
      }]
    });
    await host.getByRole('button', { name: 'Submit immutable program' }).click();
    await steps.step('committed-graphical-registers', {
      description: 'Committed cards remain inspectable while the opponent sees a masked program',
      resetScroll: true,
      verifications: [{
        spec: 'The owner sees five graphical locked registers and the observer sees only card backs',
        check: async () => {
          await expect(host.getByRole('list', { name: 'Locked Program' }).getByRole('img')).toHaveCount(5);
          await expect(guest.getByRole('list', { name: 'Program submission status' })).toContainText('▰ ▰ ▰ ▰ ▰');
        }
      }]
    });
    await host.getByText('Race details & connection', { exact: true }).click();
    await expect(host.getByTestId('program-conservation')).toBeVisible();
    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
