import { expect, type Page } from '@playwright/test';

export interface PowerDownResponse {
  page: Page;
  powerDownNextTurn: boolean;
}

function responseButton({ page, powerDownNextTurn }: PowerDownResponse) {
  return page.getByRole('button', {
    name: powerDownNextTurn
      ? /^(Power down next turn|Continue power down next turn)$/
      : /^(Stay active next turn|Power up next turn)$/
  });
}

export async function respondPowerDownsInDockOrder(
  responses: readonly PowerDownResponse[]
) {
  const pending = [...responses];
  while (pending.length > 0) {
    const next = await Promise.any(
      pending.map(async (response) => {
        await responseButton(response).waitFor({ state: 'visible' });
        return response;
      })
    );
    await responseButton(next).click();
    pending.splice(pending.indexOf(next), 1);
  }
}

export function stayActiveInDockOrder(pages: readonly Page[]) {
  return declineEligiblePowerDowns(pages);
}

export async function chooseReentry(
  page: Page,
  facing?: 'north' | 'east' | 'south' | 'west',
  cell?: { x: number; y: number }
) {
  const square = cell
    ? page.getByRole('button', { name: `Re-entry square (${cell.x},${cell.y})` })
    : page.getByRole('button', { name: /^Re-entry square \(/ }).first();
  if (await square.isVisible()) await square.click();
  const facingButton = facing
    ? page.getByRole('button', { name: `Face ${facing}` })
    : page
        .getByRole('group', { name: 'Re-entry facing' })
        .locator('button:not([disabled])')
        .first();
  await facingButton.click();
  return (await facingButton.getAttribute('aria-label')) ?? '';
}

async function declineEligiblePowerDowns(pages: readonly Page[]) {
  const targetTurnId = await pages[0]
    .getByLabel('Ordered power-down control')
    .getAttribute('data-turn-id');
  await expect
    .poll(() =>
      Promise.all(
        pages.map((page) =>
          page.getByLabel('Ordered power-down control').getAttribute('data-turn-id')
        )
      )
    )
    .toEqual(pages.map(() => targetTurnId));
  while (true) {
    let availableIndex = -2;
    try {
      await expect
        .poll(async () => {
        for (const [index, page] of pages.entries()) {
          const control = page.getByLabel('Ordered power-down control');
          const button = responseButton({ page, powerDownNextTurn: false });
          if (
            (await control.getAttribute('data-can-respond')) === 'true' &&
            (await button.isVisible()) &&
            (await button.isEnabled())
          ) {
            availableIndex = index;
            return availableIndex;
          }
        }
        const pendingUids = await Promise.all(
          pages.map((page) =>
            page.getByLabel('Ordered power-down control').getAttribute('data-pending-uid')
          )
        );
        if (pendingUids.some(Boolean)) {
          availableIndex = -2;
          return availableIndex;
        }
        availableIndex = -1;
        return availableIndex;
        }, { timeout: 10_000 })
        .not.toBe(-2);
    } catch {
      const diagnostics = await Promise.all(
        pages.map(async (page) => {
          const control = page.getByLabel('Ordered power-down control');
          return {
            turnId: await control.getAttribute('data-turn-id'),
            canRespond: await control.getAttribute('data-can-respond'),
            pendingUid: await control.getAttribute('data-pending-uid'),
            text: await control.textContent()
          };
        })
      );
      throw new Error(`Power-down barrier did not settle: ${JSON.stringify(diagnostics)}`);
    }
    if (availableIndex === -1) return;
    try {
      const page = pages[availableIndex];
      await responseButton({
        page,
        powerDownNextTurn: false
      }).click({ timeout: 1_000 });
      await expect
        .poll(
          () =>
            page
              .getByLabel('Ordered power-down control')
              .getAttribute('data-can-respond'),
          { timeout: 5_000 }
        )
        .toBe('false');
    } catch {
      // A locally selected next turn can be replaced by the canonical
      // subscription between discovery and click. Re-evaluate the barrier.
    }
  }
}
