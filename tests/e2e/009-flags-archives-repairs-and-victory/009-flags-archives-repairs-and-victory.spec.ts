import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import {
  enableSyntheticPlaybackClock,
  finishSyntheticPlayback
} from '../helpers/playback-clock';
import { TestStepHelper } from '../helpers/test-step-helper';

type Program = readonly string[];

const turns: readonly { host: Program; guest: Program }[] = [
  {
    host: ['move-1 priority 520', 'move-2 priority 740', 'rotate-right priority 150', 'move-3 priority 830', 'move-2 priority 700'],
    guest: ['move-1 priority 490', 'rotate-left priority 100', 'move-2 priority 770', 'move-2 priority 670', 'move-1 priority 550']
  },
  {
    host: ['rotate-left priority 380', 'move-3 priority 810', 'rotate-right priority 110', 'back-up priority 480', 'move-1 priority 490'],
    guest: ['rotate-right priority 250', 'rotate-left priority 140', 'back-up priority 470', 'rotate-right priority 90', 'move-2 priority 710']
  },
  {
    host: ['move-2 priority 700', 'rotate-left priority 360', 'rotate-right priority 190', 'move-1 priority 580', 'move-1 priority 490'],
    guest: ['move-1 priority 600', 'move-1 priority 530', 'rotate-left priority 260', 'u-turn priority 30', 'rotate-right priority 370']
  },
  {
    host: ['rotate-right priority 270', 'move-1 priority 610', 'u-turn priority 60', 'back-up priority 480', 'move-1 priority 500'],
    guest: ['move-2 priority 770', 'back-up priority 460', 'rotate-right priority 190', 'rotate-left priority 420', 'u-turn priority 10']
  },
  {
    host: ['move-2 priority 680', 'rotate-left priority 260', 'move-3 priority 810', 'rotate-left priority 120', 'move-2 priority 780'],
    guest: ['rotate-left priority 140', 'move-1 priority 520', 'rotate-left priority 380', 'move-1 priority 500', 'move-1 priority 490']
  },
  {
    host: ['rotate-right priority 270', 'move-3 priority 830', 'back-up priority 450', 'move-1 priority 490', 'back-up priority 470'],
    guest: ['move-3 priority 820', 'move-1 priority 590', 'rotate-right priority 70', 'move-1 priority 650', 'move-3 priority 800']
  },
  {
    host: ['u-turn priority 60', 'move-2 priority 730', 'rotate-right priority 110', 'back-up priority 480', 'back-up priority 470'],
    guest: ['move-3 priority 800', 'move-1 priority 570', 'move-1 priority 660', 'rotate-right priority 190', 'rotate-right priority 390']
  },
  {
    host: ['rotate-left priority 400', 'rotate-right priority 150', 'back-up priority 460', 'rotate-left priority 260', 'rotate-right priority 190'],
    guest: ['u-turn priority 30', 'move-1 priority 660', 'move-3 priority 810', 'move-2 priority 780', 'rotate-left priority 120']
  },
  {
    host: ['rotate-left priority 200', 'move-1 priority 620', 'rotate-right priority 350', 'rotate-right priority 290', 'rotate-left priority 140'],
    guest: ['move-3 priority 810', 'move-2 priority 680', 'rotate-left priority 240', 'back-up priority 460', 'move-3 priority 840']
  },
  {
    host: ['rotate-left priority 240', 'rotate-right priority 170', 'move-1 priority 610', 'move-2 priority 740', 'rotate-left priority 360'],
    guest: ['rotate-left priority 220', 'move-1 priority 650', 'rotate-left priority 260', 'move-2 priority 750', 'back-up priority 470']
  }
];

async function chooseProgram(page: Page, labels: Program) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit immutable program' }).click();
}

test('ordered flags, archives, repairs, victory, and rematch span real turns', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(360_000);
  const roomCode = testInfo.project.name === 'phone' ? 'R9PHON' : 'R9DESK';
  const rematchCode = testInfo.project.name === 'phone' ? 'N9PHON' : 'N9DESK';
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const tableContext: BrowserContext = await browser.newContext();
  const table = await tableContext.newPage();

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=risky-exchange-a`);
    await expect(host.getByRole('status')).toHaveText('Firebase emulator ready');
    await host.getByRole('button', { name: 'Create race' }).click();
    await host.getByLabel('Racer name').fill('Ada');
    await host.getByRole('button', { name: 'Axle' }).click();
    await host.getByRole('button', { name: 'Create and claim seat' }).click();

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Finish a race through flags, archives, repairs, and rematch',
      'Two real clients play ten deterministic turns. Ada archives on a repair site, touches all three flags in order, wins from ordinary Program submissions, and a separately authenticated tabletop creates a fresh rematch room that both connected controllers follow automatically.'
    );

    await host.getByLabel('Setup seed').fill('REPAIR-4');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    for (const [index, programs] of turns.entries()) {
      const turn = index + 1;
      if (turn > 1) {
        await host.getByRole('button', { name: `Begin Turn ${turn}` }).click();
        await guest.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      }
      await stayActiveInDockOrder([host, guest]);
      await chooseProgram(host, programs.host);
      await expect(guest.getByLabel('Five face-down registers')).toBeVisible();
      await chooseProgram(guest, programs.guest);

      if (turn === 6) {
        await expect(host.getByRole('heading', { name: /Turn 6 awaiting re-entry/ })).toBeVisible();
        await guest.getByLabel('Re-entry facing').selectOption({
          label: 'north'
        });
        await guest.getByRole('button', { name: 'Confirm re-entry' }).click();
      }
      await expect(host.getByRole('heading', { name: new RegExp(`Turn ${turn} (complete|finished)`) })).toBeVisible();

      if (turn === 1) {
        await steps.step('repair-site-archives-at-cleanup', {
          description: 'Register 5 reaches a repair site and moves the Archive before cleanup',
          verifications: [
            {
              spec: 'The robot state exposes the new repair-site Archive',
              check: async () => {
                const ada = host
                  .getByRole('list', { name: 'Robot Life and damage state' })
                  .getByRole('listitem')
                  .filter({ hasText: 'Ada' });
                await expect(ada).toContainText('Ada active · 3 Lives · 0 Damage');
                await expect(ada).toContainText('Flags none');
                await expect(ada).toContainText('Archive (12,12)');
              }
            },
            {
              spec: 'Repair happens once during cleanup, after the per-register Archive update',
              check: async () => {
                await host.getByText('Full resolution text').click();
                const trace = host.getByRole('list', { name: 'Full resolution feed' });
                await expect(trace).toContainText('Ada moved its Archive marker to (12,12)');
                await expect(trace).toContainText('Ada repaired from 0 to 0 damage');
                await host.getByText('Full resolution text').click();
              }
            }
          ]
        });
      }

      if (turn === 6) {
        await steps.step('first-two-flags-and-reentry', {
          description: 'Ordered flags persist while another robot completes owner-authored re-entry',
          verifications: [
            {
              spec: 'Ada has Flags 1 and 2 and archives on Flag 2',
              check: async () => {
                const ada = host
                  .getByRole('list', { name: 'Robot Life and damage state' })
                  .getByRole('listitem')
                  .filter({ hasText: 'Ada' });
                await expect(ada).toContainText('Flags 1→2');
                await expect(ada).toContainText('Archive (10,8)');
              }
            },
            {
              spec: 'Grace re-enters with two damage and both clients converge',
              check: async () => {
                await expect(host.getByRole('list', { name: 'Robot Life and damage state' })).toContainText(
                  'Grace active · 2 Lives · 2 Damage'
                );
                await expect(guest.getByRole('heading', { name: /Turn 6 complete/ })).toBeVisible();
              }
            }
          ]
        });
      }
    }

    await steps.step('flag-three-wins-and-freezes-summary', {
      description: 'Flag 3 ends the race with a shared immutable summary',
      verifications: [
        {
          spec: 'The final ordered flag ends resolution immediately',
          check: async () => {
            await expect(host.getByRole('heading', { name: /Turn 10 finished/ })).toBeVisible();
            const ada = host
              .getByRole('list', { name: 'Robot Life and damage state' })
              .getByRole('listitem')
              .filter({ hasText: 'Ada' });
            await expect(ada).toContainText('Ada active · 3 Lives · 2 Damage');
            await expect(ada).toContainText('Flags 1→2→3');
            await expect(ada).toContainText('Archive (2,5)');
          }
        },
        {
          spec: 'Owner and observer see the same winner summary',
          check: async () => {
            await expect(host.getByRole('region', { name: 'Immutable race summary' })).toContainText(
              'Ada wins Risky Exchange'
            );
            await expect(guest.getByRole('region', { name: 'Immutable race summary' })).toContainText(
              'Ada wins Risky Exchange'
            );
          }
        }
      ]
    });

    await host.goto(`/hand/?room=${roomCode}&seat=1`);
    await guest.goto(`/hand/?room=${roomCode}&seat=2`);
    await expect(host.getByRole('heading', { name: 'Ada' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Grace' })).toBeVisible();

    await enableSyntheticPlaybackClock(table);
    await table.goto(`/tt/?room=${roomCode}&e2eRematchRoomCode=${rematchCode}`);
    steps.setPage(table);
    await expect(table.getByTestId('tabletop-program-countdown')).toBeVisible();
    await finishSyntheticPlayback([table]);
    const finishDialog = table.getByRole('dialog', { name: 'Race finished' });
    await expect(finishDialog.getByRole('heading', { name: 'ADA WINS!' })).toBeVisible();
    await expect(table.locator('[data-seat="1"] .flag-track')).toHaveAttribute(
      'aria-label',
      'Ada touched flags: 1, 2, 3'
    );
    await expect(finishDialog.getByRole('button', { name: 'REMATCH · CHOOSE COURSE' })).toBeVisible();
    await expect(finishDialog.getByRole('button', { name: 'NEW GAME' })).toBeVisible();

    const newGameProbe = await table.context().newPage();
    await enableSyntheticPlaybackClock(newGameProbe);
    await newGameProbe.goto(`/tt/?room=${roomCode}`);
    await finishSyntheticPlayback([newGameProbe]);
    await newGameProbe.getByRole('button', { name: 'NEW GAME' }).click();
    await expect(newGameProbe.locator('[data-e2e-tabletop]')).toHaveAttribute(
      'data-room-code',
      /^[A-Z0-9]{6}$/
    );
    await expect(newGameProbe.locator('[data-e2e-tabletop]')).not.toHaveAttribute(
      'data-room-code',
      roomCode
    );
    await expect(newGameProbe.getByRole('img', { name: /QR code to join position/ })).toHaveCount(8);
    await newGameProbe.close();

    await steps.step('tabletop-announces-finished-race', {
      description: 'The tabletop unmistakably announces the completed race',
      status: 'skip',
      verifications: [
        {
          spec: 'The winner overlay offers rematch configuration and a genuinely fresh game',
          check: async () => {
            await expect(finishDialog.getByRole('heading', { name: 'ADA WINS!' })).toBeVisible();
            await expect(finishDialog.getByRole('button', { name: 'REMATCH · CHOOSE COURSE' })).toBeVisible();
            await expect(finishDialog.getByRole('button', { name: 'NEW GAME' })).toBeVisible();
          }
        },
        {
          spec: 'The final player panel retains all three touched flags',
          check: async () => {
            await expect(table.locator('[data-seat="1"] .flag-track')).toHaveAttribute(
              'aria-label',
              'Ada touched flags: 1, 2, 3'
            );
          }
        }
      ]
    });

    await finishDialog.getByRole('button', { name: 'REMATCH · CHOOSE COURSE' }).click();
    await expect(table.locator('[data-e2e-tabletop]')).toHaveAttribute(
      'data-room-code',
      rematchCode
    );
    const rematchRoomCode = await table.locator('[data-e2e-tabletop]').getAttribute('data-room-code');
    expect(rematchRoomCode).toBe(rematchCode);
    await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
    await expect(table.getByLabel('Setup seed')).toHaveValue('REPAIR-4:rematch');
    await expect(table.locator('[data-seat="1"]')).toContainText('Ada');
    await expect(table.locator('[data-seat="2"]')).toContainText('Grace');
    await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(6);
    await expect(host).toHaveURL(new RegExp(`/hand/\\?room=${rematchRoomCode}&seat=1$`));
    await expect(guest).toHaveURL(new RegExp(`/hand/\\?room=${rematchRoomCode}&seat=2$`));
    await expect(host.getByRole('heading', { name: 'Ada' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Grace' })).toBeVisible();
    await expect(
      host.locator('section.identity').getByText('The tabletop is choosing the course and settings.')
    ).toBeVisible();
    await expect(
      guest.locator('section.identity').getByText('The tabletop is choosing the course and settings.')
    ).toBeVisible();
    await steps.step('rematch-starts-new-epoch', {
      description: 'Rematch moves the retained racers and controllers to fresh configuration',
      status: 'skip',
      verifications: [
        {
          spec: 'The table can choose a new board before the next race',
          check: async () => {
            await expect(table.getByLabel('Tabletop race configuration')).toBeVisible();
            await expect(table.getByRole('button', { name: 'CONFIGURE RACE' })).toBeEnabled();
          }
        },
        {
          spec: 'Both controllers follow the new room while their seats and the six open QR positions persist',
          check: async () => {
            await expect(table.locator('[data-seat="1"]')).toContainText('Ada');
            await expect(table.locator('[data-seat="2"]')).toContainText('Grace');
            await expect(table.getByRole('img', { name: /QR code to join position/ })).toHaveCount(6);
            await expect(host.getByRole('heading', { name: 'Ada' })).toBeVisible();
            await expect(guest.getByRole('heading', { name: 'Grace' })).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext.close();
    await tableContext.close();
  }
});
