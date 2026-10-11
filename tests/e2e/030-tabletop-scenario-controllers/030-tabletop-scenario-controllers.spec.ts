import { expect, test } from '@playwright/test';
import { ROBOTS } from '../../../src/lib/room-model';
import { TestStepHelper } from '../helpers/test-step-helper';
import { enableSyntheticPlaybackClock } from '../helpers/playback-clock';

test('private controllers draft Options, switch Interference robots, and deploy on team turf', async ({ browser, page: table }, testInfo) => {
  test.setTimeout(300_000);
  await table.setViewportSize({ width: 1920, height: 1080 });
  const steps = new TestStepHelper(table, testInfo);
  steps.setMetadata('Published scenarios on the tabletop and phones', 'Real private controllers choose starting Options, keep separate Interference hands, and deploy Capture the Flag robots while the tabletop displays the public board.');
  for (const [index, course] of ['tricksy', 'interference', 'capture-the-flag'].entries()) {
    const room = `S30${testInfo.project.name === 'phone' ? 'P' : 'D'}${index}A`;
    const contexts = await Promise.all(Array.from({ length: course === 'capture-the-flag' ? 4 : 2 }, () => browser.newContext({ viewport: { width: 393, height: 852 } })));
    const phones = await Promise.all(contexts.map((context) => context.newPage()));
    try {
      await enableSyntheticPlaybackClock(table);
      await table.goto(`/tt/?e2eIdentity=TABLE&e2eRoomCode=${room}&course=${course}&seed=PUBLISHED-PRIVATE`);
      for (const [seat, phone] of phones.entries()) {
        const url = await table.getByRole('link', { name: `Join tabletop ${room} at position ${seat + 1}` }).getAttribute('href');
        let releaseSignIn: (() => void) | undefined;
        if (index === 0 && seat === 0) {
          const signInGate = new Promise<void>((resolve) => { releaseSignIn = resolve; });
          await phone.route('**/accounts:signUp*', async (route) => {
            await signInGate;
            await route.continue();
          });
        }
        await phone.goto(`${url}&e2eIdentity=PRIVATE-${seat}`);
        await phone.getByLabel('Racer name').fill(`Player ${seat + 1}`);
        await phone.getByRole('button', { name: ROBOTS[seat].name }).click();
        const claim = phone.getByRole('button', { name: `CLAIM POSITION ${seat + 1}` });
        if (releaseSignIn) {
          await expect(claim).toBeDisabled();
          releaseSignIn();
        }
        await expect(claim).toBeEnabled();
        await claim.click();
        await expect(table.locator(`[data-seat="${seat + 1}"]`)).toContainText(`Player ${seat + 1}`);
      }
      await table.getByRole('button', { name: 'CONFIGURE RACE' }).click();
      for (const phone of phones) await phone.getByRole('button', { name: 'READY FOR RACE' }).click();
      if (course === 'tricksy') {
        steps.setPage(phones[0]);
        await steps.step('private-starting-options', { status: 'skip', description: 'Each phone receives its own three graphical starting Options', verifications: [{ spec: 'Three choices appear privately, while the table waits without showing them', check: async () => {
          await expect(phones[0].getByLabel('Starting Option selection').getByRole('button')).toHaveCount(3);
          await expect(table.getByRole('button', { name: /^Keep / })).toHaveCount(0);
        }}] });
        for (const phone of phones) await phone.getByLabel('Starting Option selection').getByRole('button').first().click();
        await expect(phones[0].getByLabel('Your Options').getByRole('button', { name: /View .* Option/ })).toBeVisible();
      }
      if (course === 'capture-the-flag') {
        let captain = -1;
        await expect.poll(async () => {
          captain = (await Promise.all(phones.map((phone) => phone.getByRole('button', { name: 'Choose Vault', exact: true }).isVisible()))).findIndex(Boolean);
          return captain;
        }).toBeGreaterThanOrEqual(0);
        await phones[captain].getByRole('button', { name: 'Choose Vault', exact: true }).click();
        // Both teammates may deploy at once. Choose a fixed seat order instead
        // of letting network delivery decide which robot gets the first cell.
        const firstTeamSeat = captain % 2;
        const deploymentOrder = [firstTeamSeat, firstTeamSeat + 2, 1 - firstTeamSeat, 3 - firstTeamSeat];
        for (let placed = 0; placed < phones.length; placed++) {
          const current = deploymentOrder[placed];
          const phone = phones[current];
          await expect(phone.getByRole('button', { name: 'Place my robot', exact: true })).toBeVisible();
          await phone.getByRole('button', { name: /^Start at / }).first().click();
          if (placed === 0) {
            steps.setPage(phone);
            await steps.step('private-home-deployment', { status: 'skip', description: 'A phone chooses a legal home-board space and starting direction', verifications: [{ spec: 'A selected safe space enables placement', check: async () => {
              await expect(phone.getByRole('button', { name: 'Place my robot', exact: true })).toBeEnabled();
            }}] });
          }
          await phone.getByRole('button', { name: 'Place my robot', exact: true }).click();
          await expect(phone.getByRole('button', { name: 'Place my robot', exact: true })).toHaveCount(0);
        }
      }
      await expect(phones[0].getByLabel('Your Program hand').getByRole('button')).toHaveCount(9);
      if (course === 'interference') {
        const phone = phones[0];
        await phone.getByLabel('Your Program hand').getByRole('button').first().click();
        const card = await phone.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first().getAttribute('aria-label');
        await phone.getByLabel('Control robot').selectOption({ index: 1 });
        await expect(phone.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first()).toContainText('empty');
        await phone.getByLabel('Your Program hand').getByRole('button').nth(1).click();
        steps.setPage(phone);
        await steps.step('private-blocker-hand', { status: 'skip', description: 'The owner programs a separate blocker hand', verifications: [{ spec: 'The blocker has a selected card and the table has four robot mats', check: async () => {
          await expect(phone.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first()).not.toContainText('empty');
          await expect(table.locator('.race-robot')).toHaveCount(4);
        }}] });
        await phone.getByLabel('Control robot').selectOption({ index: 0 });
        await expect(phone.getByRole('list', { name: 'Chosen registers' }).getByRole('button').first()).toHaveAttribute('aria-label', card!);
      }
      steps.setPage(table);
      await steps.step(`${course}-table`, { status: 'skip', description: `${course}: the public table is ready for programming`, verifications: [{ spec: 'Every robot has a board marker and private cards remain face down', check: async () => {
        await expect(table.locator('.race-robot')).toHaveCount(course === 'interference' ? 4 : phones.length);
        await expect(table.locator('.seat.open')).toHaveCount(0);
      }}] });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
  steps.generateDocs();
});
