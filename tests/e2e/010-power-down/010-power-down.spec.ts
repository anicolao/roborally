import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  respondPowerDownsInDockOrder,
  stayActiveInDockOrder
} from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

type Program = readonly string[];

const activeTurns: readonly { host: Program; guest: Program }[] = [
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
    host: ['rotate-right priority 270', 'move-2 priority 720', 'move-1 priority 610', 'rotate-left priority 380', 'back-up priority 480'],
    guest: ['move-2 priority 770', 'back-up priority 460', 'rotate-right priority 190', 'rotate-left priority 420', 'u-turn priority 10']
  },
  {
    host: ['move-1 priority 590', 'rotate-right priority 170', 'move-2 priority 680', 'move-1 priority 620', 'rotate-left priority 260'],
    guest: ['rotate-left priority 140', 'move-1 priority 520', 'rotate-left priority 380', 'move-1 priority 500', 'move-1 priority 490']
  }
];

const downTurns: readonly Program[] = [
  ['rotate-right priority 270', 'rotate-right priority 70', 'move-3 priority 820', 'back-up priority 450', 'move-1 priority 590'],
  ['u-turn priority 60', 'move-3 priority 800', 'move-1 priority 570', 'rotate-right priority 110', 'rotate-right priority 190']
];

async function chooseProgram(page: Page, labels: Program) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  const submit = page.getByRole('button', { name: 'Submit immutable program' });
  if (!(await submit.isEnabled())) {
    const registers = await page
      .getByRole('list', { name: 'Chosen registers' })
      .getByRole('listitem')
      .allTextContents();
    throw new Error(`Program did not fill every open register: ${registers.join(' | ')}`);
  }
  await submit.click();
}

function robotState(page: Page, name: string) {
  return page
    .getByRole('list', { name: 'Robot Life and damage state' })
    .getByRole('listitem')
    .filter({ hasText: name });
}

test('power down clears damage, remains vulnerable, repeats, and restores programming', async (
  { browser, page: host },
  testInfo
) => {
  test.setTimeout(360_000);
  const roomCode = testInfo.project.name === 'phone' ? 'R10PHN' : 'R10DSK';
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();

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
      'Complete an ordered, consecutive power down',
      'Two real clients play eight deterministic turns. Ada announces after taking damage and in original Dock order, clears damage, skips programming and robot fire, remains vulnerable to factory lasers, receives exact random locks while shut down, continues once, and powers up with the new lock retained.'
    );

    await host.getByLabel('Setup seed').fill('REPAIR-4');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();

    for (const [index, programs] of activeTurns.entries()) {
      const turn = index + 1;
      if (turn > 1) {
        await host.getByRole('button', { name: `Begin Turn ${turn}` }).click();
        await guest.getByRole('button', { name: `Begin Turn ${turn}` }).click();
      }
      if (turn < 5) {
        await stayActiveInDockOrder([host, guest]);
      } else {
        await respondPowerDownsInDockOrder([
          { page: host, powerDownNextTurn: true }
        ]);
        await expect(host.getByLabel('Ordered power-down control')).toContainText(
          'Power down committed for next turn'
        );
      }
      await chooseProgram(host, programs.host);
      await expect(guest.getByLabel('Five face-down registers')).toBeVisible();
      await chooseProgram(guest, programs.guest);
      await expect(host.getByRole('heading', { name: new RegExp(`Turn ${turn} complete`) })).toBeVisible();
    }

    await steps.step('shutdown-announced-in-dock-order', {
      description: 'The next-turn shutdown announcement survives ordinary resolution',
      verifications: [
        {
          spec: 'Ada is damaged before making a committed shutdown announcement',
          check: async () => {
            const ada = robotState(host, 'Ada');
            await expect(ada).toContainText('Ada active · 3 Lives · 3 Damage · Shutdown announced');
          }
        },
        {
          spec: 'The observer sees the same public announcement',
          check: async () => {
            await expect(robotState(guest, 'Ada')).toContainText('Shutdown announced');
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Begin Turn 6' }).click();
    await guest.getByRole('button', { name: 'Begin Turn 6' }).click();
    await respondPowerDownsInDockOrder([
      { page: host, powerDownNextTurn: true }
    ]);
    await expect(host.getByLabel('Ordered power-down control')).toContainText(
      'Power down committed for next turn'
    );
    await expect(host.getByRole('heading', { name: 'Your hand · submitted' })).toBeVisible();
    await chooseProgram(guest, downTurns[0]);
    await expect(host.getByRole('heading', { name: /Turn 6 complete/ })).toBeVisible();

    await steps.step('factory-damage-locks-powered-down-robot', {
      description: 'A powered-down robot skips programming but remains a factory target',
      verifications: [
        {
          spec: 'Beginning the shutdown cleared prior damage before five board-laser hits',
          check: async () => {
            const ada = robotState(host, 'Ada');
            await expect(ada).toContainText(
              'Ada active · 3 Lives · 5 Damage · Powered down · Locked R5'
            );
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace.getByText('A board laser hit Ada at (11,3).')).toHaveCount(5);
            await expect(trace).toContainText('Ada took one damage and now has 1');
            await expect(trace).toContainText('Ada took one damage and now has 5');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'The random lock reserves the exact Turn 6 card',
          check: async () => {
            await expect(robotState(guest, 'Ada')).toContainText('Locked R5');
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Begin Turn 7' }).click();
    await guest.getByRole('button', { name: 'Begin Turn 7' }).click();
    await respondPowerDownsInDockOrder([
      { page: host, powerDownNextTurn: false }
    ]);
    await expect(host.getByLabel('Ordered power-down control')).toContainText(
      'Active next turn'
    );
    await chooseProgram(guest, downTurns[1]);
    await expect(host.getByRole('heading', { name: /Turn 7 complete/ })).toBeVisible();

    await steps.step('consecutive-shutdown-clears-and-relocks', {
      description: 'Continuing shutdown clears the old lock before factory damage creates a new one',
      verifications: [
        {
          spec: 'The second shutdown turn again starts from zero and ends at five damage',
          check: async () => {
            await expect(robotState(host, 'Ada')).toContainText(
              'Ada active · 3 Lives · 5 Damage · Powered down · Locked R5'
            );
            await host.getByText('Full resolution text').click();
            const trace = host.getByRole('list', { name: 'Full resolution feed' });
            await expect(trace).toContainText('Ada took one damage and now has 1');
            await expect(trace).toContainText('Ada took one damage and now has 5');
            await host.getByText('Full resolution text').click();
          }
        },
        {
          spec: 'Ada has chosen to power up after this consecutive shutdown turn',
          check: async () => {
            await expect(host.getByLabel('Ordered power-down control')).toContainText(
              'Active next turn'
            );
          }
        }
      ]
    });

    await host.getByRole('button', { name: 'Begin Turn 8' }).click();
    await guest.getByRole('button', { name: 'Begin Turn 8' }).click();
    await steps.step('power-up-retains-new-lock', {
      description: 'Powering up restores programming with damage and the new random lock retained',
      verifications: [
        {
          spec: 'Ada receives four cards for four open registers at five damage',
          check: async () => {
            await expect(host.getByRole('heading', { name: 'Your hand · 4' })).toBeVisible();
            await expect(host.getByText('0/4 open')).toBeVisible();
          }
        },
        {
          spec: 'Register 5 retains the exact Turn 7 random card',
          check: async () => {
            await expect(
              host.getByRole('list', { name: 'Chosen registers' }).getByRole('listitem').nth(4)
            ).toContainText('R5 back-up 480 · locked');
          }
        },
        {
          spec: 'Both clients converged before the next ordered announcement barrier',
          check: async () => {
            await expect(guest.getByRole('heading', { name: /Your hand · 9/ })).toBeVisible();
            await expect(host.getByLabel('Ordered power-down control')).toContainText(
              'Announce shutdown for next turn?'
            );
            await expect(guest.getByLabel('Ordered power-down control')).toContainText(
              'Waiting for Ada in original Dock order'
            );
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext.close();
  }
});
