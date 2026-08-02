import { expect, test, type BrowserContext } from '@playwright/test';
import { stayActiveInDockOrder } from '../helpers/game-actions';
import { TestStepHelper } from '../helpers/test-step-helper';

async function rewindSubmissionDeadline(roomCode: string) {
  const collectionUrl =
    `http://127.0.0.1:8188/v1/projects/roborally-e2e/databases/(default)/documents/` +
    `games/${roomCode.toLowerCase()}/events`;

  await expect
    .poll(async () => {
      const response = await fetch(collectionUrl, {
        headers: { Authorization: 'Bearer owner' }
      });
      const body = (await response.json()) as {
        documents?: { name: string; fields: { type?: { stringValue?: string } } }[];
      };
      return body.documents?.find(
        ({ fields }) => fields.type?.stringValue === 'program/submitted'
      )?.name;
    })
    .not.toBeUndefined();

  const response = await fetch(collectionUrl, {
    headers: { Authorization: 'Bearer owner' }
  });
  const body = (await response.json()) as {
    documents: {
      name: string;
      fields: {
        type?: { stringValue?: string };
        createdAt?: { timestampValue?: string };
      };
    }[];
  };
  const submission = body.documents.find(
    ({ fields }) => fields.type?.stringValue === 'program/submitted'
  );
  if (!submission) throw new Error('Program submission was not persisted.');

  const patches = await Promise.all(
    body.documents.map((document) => {
      const timestamp = document.fields.createdAt?.timestampValue;
      if (!timestamp) throw new Error(`Event ${document.name} has no canonical timestamp.`);
      return fetch(
        `http://127.0.0.1:8188/v1/${document.name}?updateMask.fieldPaths=createdAt`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer owner',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              createdAt: {
                timestampValue: new Date(Date.parse(timestamp) - 31_000).toISOString()
              }
            }
          })
        }
      );
    })
  );
  for (const patch of patches) {
    if (!patch.ok) {
      throw new Error(`Could not inject emulator timestamp: ${await patch.text()}`);
    }
  }
}

test('the shared deck deals, masks, commits, and times out deterministically', async (
  { browser, page: host },
  testInfo
) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R4PHON' : 'R4DESK';
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
      'Deal and commit programs from one shared deck',
      'Two clients receive one seeded round-robin deal. Programs cross the immutable event stream, stay masked to the observer, and a timeout is tested with an explicit emulator timestamp rather than a sleep.'
    );

    await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
    await expect(guest.getByRole('status')).toHaveAttribute('data-status', 'synced');
    await guest.getByLabel('Racer name').fill('Grace');
    await guest.getByRole('button', { name: 'Bit' }).click();
    await guest.getByRole('button', { name: 'Claim seat' }).click();

    await host.getByLabel('Setup seed').fill('PROGRAM-E2E');
    await host.getByRole('button', { name: 'Configure Risky Exchange' }).click();
    await guest.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Ready for race' }).click();
    await host.getByRole('button', { name: 'Open programming console' }).click();
    await guest.getByRole('button', { name: 'Open programming console' }).click();
    await stayActiveInDockOrder([host, guest]);

    await expect(host.getByLabel('Your Program hand').getByRole('button')).toHaveCount(9);
    await expect(guest.getByLabel('Your Program hand').getByRole('button')).toHaveCount(9);
    await expect(host.getByTestId('program-conservation')).toContainText('84/84 cards accounted');
    await expect(host.getByTestId('program-conservation')).toContainText('66 undealt');

    const guestCards = guest.getByLabel('Your Program hand').getByRole('button');
    for (let index = 0; index < 5; index += 1) await guestCards.nth(index).click();
    await expect(guest.getByRole('list', { name: 'Chosen registers' }).getByRole('listitem'))
      .not.toContainText(['empty', 'empty', 'empty', 'empty', 'empty']);
    await expect(guest.getByText(/Preview excludes robots and unrevealed board outcomes/)).toBeVisible();
    await guest.getByRole('button', { name: 'Submit immutable program' }).click();

    await steps.step('opponent-program-masked', {
      description: 'The first immutable submission stays face down to its observer',
      verifications: [
        {
          spec: 'Both hands came from one 84-card deal with 66 cards left undealt',
          check: async () => {
            await expect(guest.getByTestId('program-conservation')).toContainText(
              '84/84 cards accounted'
            );
            await expect(guest.getByTestId('program-conservation')).toContainText('66 undealt');
          }
        },
        {
          spec: 'The submitter can no longer inspect, rearrange, or resubmit the program',
          check: async () => {
            await expect(guest.getByText(/Program committed/)).toBeVisible();
            await expect(guest.getByLabel('Your Program hand')).toHaveCount(0);
            await expect(guest.getByRole('button', { name: 'Submit immutable program' })).toHaveCount(0);
          }
        },
        {
          spec: 'The observer sees five face-down registers and no card priorities',
          check: async () => {
            await expect(
              host.getByRole('list', { name: 'Program submission status' })
            ).toContainText('▰ ▰ ▰ ▰ ▰');
          }
        },
        {
          spec: 'The last programmer receives the active canonical deadline',
          check: async () => {
            await expect(host.getByRole('timer')).toContainText(
              /Ada has (?:[1-9]|[12]\d|30) seconds/
            );
          }
        }
      ]
    });

    await rewindSubmissionDeadline(roomCode);
    // The REST patches are acknowledged before Firestore necessarily delivers every
    // reordered timestamp through the active listener. Wait for the live projection
    // to converge before replacing that listener with a page reload.
    await expect(host.getByRole('timer')).toContainText('Ada has 0 seconds');
    await expect(
      host.getByRole('list', { name: 'Program submission status' })
    ).toContainText('▰ ▰ ▰ ▰ ▰');
    await host.reload();
    await expect(host.locator('[data-status]')).toHaveAttribute('data-status', 'synced');
    const openProgramming = host.getByRole('button', { name: 'Open programming console' });
    await expect(openProgramming).toBeVisible();
    await openProgramming.click();
    await expect(
      host.getByRole('list', { name: 'Program submission status' })
    ).toContainText('▰ ▰ ▰ ▰ ▰');
    await expect(host.getByRole('timer')).toContainText('Ada has 0 seconds');

    const timedOutHand = host.getByLabel('Your Program hand').getByRole('button');
    const preservedPriorities: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const label = await timedOutHand.nth(index).getAttribute('aria-label');
      const priority = label?.match(/priority (\d+)$/)?.[1];
      if (!priority) throw new Error(`Timed-out card has no priority: ${label}`);
      preservedPriorities.push(priority);
      await timedOutHand.nth(index).click();
    }
    await expect(
      host.getByRole('list', { name: 'Chosen registers' }).getByRole('listitem').nth(0)
    ).toContainText(preservedPriorities[0]);
    await expect(
      host.getByRole('list', { name: 'Chosen registers' }).getByRole('listitem').nth(1)
    ).toContainText(preservedPriorities[1]);

    await host.getByRole('button', { name: 'Fill timed-out program' }).click();

    await steps.step('timeout-filled-and-revealed', {
      description: 'An explicit canonical timestamp enables deterministic timeout fill',
      resetScroll: true,
      verifications: [
        {
          spec: 'The timeout claim preserves chosen registers and fills only empty slots',
          check: async () => {
            await expect(host.getByText(/Program committed/)).toBeVisible();
            await expect(host.getByRole('timer')).toHaveCount(0);
            await expect(
              guest.getByRole('list', { name: 'Program submission status' }).getByRole('listitem')
            ).toContainText(`${preservedPriorities[0]} · ${preservedPriorities[1]} ·`);
          }
        },
        {
          spec: 'The closed barrier reveals numeric priorities to both clients',
          check: async () => {
            await expect(
              guest.getByRole('list', { name: 'Program submission status' })
            ).not.toContainText('▰');
            await expect(
              guest.getByRole('list', { name: 'Program submission status' }).getByRole('listitem')
            ).toContainText(/\d+ · \d+ · \d+ · \d+ · \d+/);
          }
        },
        {
          spec: 'Every Program card remains in exactly one canonical zone after cleanup',
          check: async () => {
            await expect(guest.getByTestId('program-conservation')).toContainText(
              '84/84 cards accounted'
            );
            await expect(guest.getByTestId('program-conservation')).toContainText('8 turn discard');
          }
        },
        {
          spec: 'Reloading the submitter replays the committed program without reopening it',
          check: async () => {
            await guest.reload();
            await guest.getByRole('button', { name: 'Open programming console' }).click();
            await expect(guest.getByText(/Program committed/)).toBeVisible();
          }
        }
      ]
    });

    steps.generateDocs();
  } finally {
    await guestContext?.close();
  }
});
