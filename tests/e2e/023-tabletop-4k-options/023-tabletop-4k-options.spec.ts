import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the 4K tabletop gives players wide seats and inspectable public Options', async ({
  browser,
  page: table
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The 4K tabletop baseline belongs to desktop.');

  const roomCode = 'T234KU';
  const phoneOptions = { viewport: { width: 393, height: 852 }, hasTouch: true };
  const adaContext = await browser.newContext(phoneOptions);
  const graceContext = await browser.newContext(phoneOptions);
  const adaPhone = await adaContext.newPage();
  const gracePhone = await graceContext.newPage();
  const steps = new TestStepHelper(table, testInfo);
  steps.setMetadata(
    '4K tabletop player and Option layout',
    'A 3840×2160 tabletop uses the available display width for public player seats. Each starting Option appears as a tappable icon, and selecting one opens a legible shared card inspector.'
  );

  try {
    await table.setViewportSize({ width: 3840, height: 2160 });
    await table.goto(
      `/tt/?e2eIdentity=TABLE&e2eRoomCode=${roomCode}&course=option-lab&seed=TABLETOP-4K-OPTIONS`
    );
    await expect(table.locator('[data-e2e-tabletop]')).toHaveAttribute('data-room-code', roomCode);

    const positionOneUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 1` })
      .getAttribute('href');
    const positionEightUrl = await table
      .getByRole('link', { name: `Join tabletop ${roomCode} at position 8` })
      .getAttribute('href');
    expect(positionOneUrl).toBeTruthy();
    expect(positionEightUrl).toBeTruthy();

    await adaPhone.goto(`${positionOneUrl}&e2eIdentity=ADA`);
    await adaPhone.getByLabel('Racer name').fill('Ada');
    await adaPhone.getByRole('button', { name: 'Axle' }).click();
    await adaPhone.getByRole('button', { name: 'CLAIM POSITION 1' }).click();

    await gracePhone.goto(`${positionEightUrl}&e2eIdentity=GRACE`);
    await gracePhone.getByLabel('Racer name').fill('Grace');
    await gracePhone.getByRole('button', { name: 'Bit' }).click();
    await gracePhone.getByRole('button', { name: 'CLAIM POSITION 8' }).click();

    await table.getByRole('button', { name: 'CONFIGURE RACE' }).click();
    await adaPhone.getByRole('button', { name: 'READY FOR RACE' }).click();
    await gracePhone.getByRole('button', { name: 'READY FOR RACE' }).click();

    const adaSeat = table.locator('[data-seat="1"]');
    const graceSeat = table.locator('[data-seat="8"]');
    const adaOptions = adaSeat.getByLabel('Ada Options');
    const graceOptions = graceSeat.getByLabel('Grace Options');
    await expect(adaOptions).toHaveAttribute('data-option-count', '1');
    await expect(graceOptions).toHaveAttribute('data-option-count', '1');

    const seatGeometry = await Promise.all([
      adaSeat.boundingBox(),
      graceSeat.boundingBox()
    ]);
    for (const bounds of seatGeometry) {
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(680);
      expect(bounds!.width).toBeLessThanOrEqual(721);
    }

    await steps.step('wide-tabletop-option-icons', {
      description: 'Wide 4K player seats expose each public Option as an icon',
      status: 'skip',
      verifications: [
        {
          spec: 'Side seats expand well beyond the old narrow desktop cap',
          check: async () => {
            expect(seatGeometry[0]!.width).toBeGreaterThanOrEqual(680);
            expect(seatGeometry[1]!.width).toBeGreaterThanOrEqual(680);
          }
        },
        {
          spec: 'Every player starting Option is visible as an individual control',
          check: async () => {
            await expect(adaOptions.locator('[data-option-icon]')).toHaveCount(1);
            await expect(graceOptions.locator('[data-option-icon]')).toHaveCount(1);
          }
        },
        {
          spec: 'The 4K shared display remains fixed and non-scrolling',
          check: async () => {
            const viewport = await table.evaluate(() => ({
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
              innerWidth,
              innerHeight
            }));
            expect(viewport).toEqual({ width: 3840, height: 2160, innerWidth: 3840, innerHeight: 2160 });
          }
        }
      ]
    });

    const optionButton = adaOptions.locator('[data-option-icon]');
    const selectedCardId = await optionButton.getAttribute('data-option-icon');
    await optionButton.click();
    const inspector = table.getByRole('dialog', { name: 'Ada Options' });
    await expect(inspector).toBeVisible();
    await expect(inspector.locator(`[data-card-id="${selectedCardId}"]`)).toBeVisible();

    await steps.step('shared-option-inspector', {
      description: 'Tapping an Option icon opens its full card on the shared display',
      status: 'skip',
      verifications: [
        {
          spec: 'The inspector identifies the owning player and selected Option',
          check: async () => {
            await expect(inspector.getByRole('heading', { name: 'Ada' })).toBeVisible();
            await expect(inspector.locator(`[data-card-id="${selectedCardId}"]`)).toBeVisible();
          }
        },
        {
          spec: 'The full Option card is large enough to read from the tabletop',
          check: async () => {
            const bounds = await inspector.locator('.option-card').boundingBox();
            expect(bounds).not.toBeNull();
            expect(bounds!.width).toBeGreaterThanOrEqual(1000);
          }
        }
      ]
    });

    await inspector.getByRole('button', { name: 'Close Option inspection' }).click();
    await expect(inspector).toHaveCount(0);
    steps.generateDocs();
  } finally {
    await adaContext.close();
    await graceContext.close();
  }
});
