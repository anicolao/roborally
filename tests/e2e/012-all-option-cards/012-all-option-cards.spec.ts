import { expect, test, type BrowserContext } from '@playwright/test';
import { OPTION_CARDS } from '../../../src/lib/game/option-manifest';
import { TestStepHelper } from '../helpers/test-step-helper';

test('all 26 reviewed Option behaviors are inspectable in product', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R12PHN' : 'R12DSK';
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();

  try {
    await host.goto(`/?e2eIdentity=HOST&e2eRoomCode=${roomCode}`);
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

    await host.getByLabel('Setup seed').fill('OPTION-12');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();

    const catalog = host.getByLabel('2005 Option catalog');
    await catalog.getByText('26-card Option catalog').click();
    await expect(catalog.locator('li')).toHaveCount(26);
    for (const card of OPTION_CARDS) {
      const entry = catalog.locator(`[data-option-id="${card.id}"]`);
      await entry.scrollIntoViewIfNeeded();
      await expect(entry).toContainText(card.name);
      await expect(entry).toContainText(card.kind);
      await expect(entry).toContainText(card.summary);
    }
    await catalog.getByText('26-card Option catalog').click();

    const steps = new TestStepHelper(host, testInfo);
    steps.setMetadata(
      'Inspect all 26 executable Option cards',
      'The in-product 2005 catalog is generated from the same versioned manifest used by the reducer. Every card exposes its timing class and concise behavior; exhaustive pure fixtures execute each active effect and explicit non-activation cases.'
    );
    await steps.step('complete-executable-option-catalog', {
      description: 'The reviewed 2005 Option deck is complete and inspectable',
      verifications: [
        {
          spec: 'Exactly 26 uniquely identified card behaviors are rendered',
          check: async () => {
            await expect(catalog.locator('li')).toHaveCount(26);
          }
        },
        {
          spec: 'The edition-specific Crab Legs and Dual Processor cards are present',
          check: async () => {
            await expect(catalog).toContainText('Crab Legs');
            await expect(catalog).toContainText('Dual Processor');
          }
        },
        {
          spec: 'Cards from a different Option inventory are absent',
          check: async () => {
            await expect(catalog.locator('[data-option-id="shield"]')).toHaveCount(0);
            await expect(catalog.locator('[data-option-id="turret"]')).toHaveCount(0);
          }
        }
      ]
    });
    steps.generateDocs();
  } finally {
    await guestContext.close();
  }
});
