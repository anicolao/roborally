import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { chooseReentry, stayActiveInDockOrder } from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

async function chooseProgram(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
  await expect(page.getByText(/Program committed/)).toBeVisible();
  await expect(page.getByText('locked', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Locked Program' }).getByRole('listitem')
  ).toHaveCount(5);
}

function roomStatus(page: Page) {
  return page.locator('[data-status]');
}

test('cache, cursor, retry, and replay converge across a resolution disconnect', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R16PHN' : 'R16DSK';
  let guestContext: BrowserContext | undefined;
  const steps = new TestStepHelper(host, testInfo);
  steps.setMetadata(
    'Reconnect cache, cursor, conflicts, and pending resolution',
    'A player commits an ordinary Program, loses the network while the barrier closes, then converges on an owner-only re-entry. Reloading rehydrates the exact cached prefix before the Firestore cursor supplies its delta; both owners finish ordered re-entry through normal controls.'
  );

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=risky-exchange-a`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(roomStatus(guest)).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('PUSH-416');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();
    await stayActiveInDockOrder([host, guest]);

    await chooseProgram(host, [
      'move-1 priority 520',
      'rotate-left priority 300',
      'u-turn priority 60',
      'rotate-right priority 170',
      'rotate-left priority 140'
    ]);
    await expect(roomStatus(host)).toHaveAttribute('data-event-count', '12');
    await host.context().setOffline(true);
    await expect(roomStatus(host)).toHaveAttribute('data-status', 'offline');

    await chooseProgram(guest, [
      'move-1 priority 570',
      'rotate-right priority 250',
      'move-3 priority 800',
      'move-3 priority 820',
      'move-3 priority 790'
    ]);
    await expect(guest.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();

    await steps.step('programming-disconnect-retains-cached-prefix', {
      status: 'offline',
      description: 'The disconnected player remains on the last server-confirmed prefix',
      verifications: [
        {
          spec: 'The offline client retains seven confirmed immutable events',
          check: async () => {
            await expect(roomStatus(host)).toHaveAttribute('data-event-count', '12');
            await expect(roomStatus(host)).toContainText('cached');
          }
        },
        {
          spec: 'The connected peer closes the simultaneous barrier and reaches pending re-entry',
          check: async () => {
            await expect(guest.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();
          }
        },
        {
          spec: 'Scratch replay is unavailable until transport returns, preserving the cache',
          check: async () => {
            await expect(host.getByRole('button', { name: 'Replay from server' })).toBeDisabled();
          }
        }
      ]
    });

    await host.context().setOffline(false);
    await expect(roomStatus(host)).toHaveAttribute('data-status', 'synced');
    await expect(host.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();
    await expect(roomStatus(host)).toHaveAttribute('data-event-count', '18');

    await host.reload();
    await expect(roomStatus(host)).toHaveAttribute('data-status', 'synced');
    await expect(roomStatus(host)).toHaveAttribute('data-cache-hydrated', 'true');
    await expect(roomStatus(host)).toHaveAttribute('data-event-count', '18');
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await expect(host.getByRole('heading', { name: /awaiting re-entry/ })).toBeVisible();

    await chooseReentry(host, 'north');
    await host.getByRole('button', { name: 'Confirm re-entry' }).click();
    await chooseReentry(guest, 'east');
    await guest.getByRole('button', { name: 'Confirm re-entry' }).click();

    await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await expect(guest.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
    await steps.step('cache-cursor-reload-converges-after-reentry', {
      description: 'Cached replay plus cursor delta converges with scratch Firestore replay',
      verifications: [
        {
          spec: 'Reload visibly reports cache-plus-cursor hydration',
          check: async () => {
            await expect(host.getByLabel(/Cache \+ cursor replay verified/)).toHaveAttribute(
              'aria-label',
              /immutable events/
            );
            await expect(roomStatus(host)).toHaveAttribute('data-cache-hydrated', 'true');
          }
        },
        {
          spec: 'Both owner-authored re-entry choices survive the reconnect boundary',
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
          spec: 'Both clients project the same completed turn and event count',
          check: async () => {
            await expect(roomStatus(host)).toHaveAttribute('data-event-count', '22');
            await expect(roomStatus(guest)).toHaveAttribute('data-event-count', '22');
          }
        }
      ]
    });
    await steps.step('scratch-server-replay-matches-cursor-projection', {
      description: 'An explicit scratch replay preserves the converged race',
      verifications: [
        {
          spec: 'The player can discard the compatible cache and read the complete server stream',
          check: async () => {
            await host.getByRole('button', { name: 'Replay from server' }).click();
            await expect(roomStatus(host)).toHaveAttribute('data-status', 'synced');
            await expect(roomStatus(host)).toHaveAttribute('data-cache-hydrated', 'false');
            await expect(roomStatus(host)).toHaveAttribute('data-event-count', '22');
          }
        },
        {
          spec: 'Scratch replay produces the same completed turn and robot coordinates',
          check: async () => {
            const openConsole = host.getByRole('button', { name: 'Open programming console' });
            if (await openConsole.isVisible()) await openConsole.click();
            await expect(host.getByRole('heading', { name: /Turn 1 complete/ })).toBeVisible();
          await expect(host.locator('[data-coordinate="7,15"] .race-robot')).toHaveAttribute(
              'title',
              /Ada, Axle, facing north/
            );
          }
        }
      ]
    });
    steps.generateDocs();
  } finally {
    await host.context().setOffline(false);
    await guestContext?.close();
  }
});
