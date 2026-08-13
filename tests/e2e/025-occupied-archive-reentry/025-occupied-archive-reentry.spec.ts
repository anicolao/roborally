import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import {
  LB49CR_REENTRY_PREFIX,
  LB49CR_SOURCE_UIDS,
  type FixtureActor
} from '../helpers/lb49cr-reentry-fixture';

function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, child]) => [
            key,
            firestoreValue(child)
          ])
        )
      }
    };
  }
  throw new Error(`Unsupported Firestore fixture value: ${String(value)}`);
}

async function anonymousUid(page: Page) {
  const readUid = () => page.evaluate(async () => {
    try {
      const request = indexedDB.open('firebaseLocalStorageDb');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
        db.close();
        return '';
      }
      const getAll = db
        .transaction('firebaseLocalStorage', 'readonly')
        .objectStore('firebaseLocalStorage')
        .getAll();
      const records = await new Promise<unknown[]>((resolve, reject) => {
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
      });
      db.close();
      return records
        .map((record) => (record as { value?: { uid?: string } })?.value?.uid)
        .find((uid): uid is string => Boolean(uid)) ?? '';
    } catch {
      return '';
    }
  });
  await expect.poll(readUid).not.toBe('');
  return readUid();
}

function replaceIdentities(value: unknown, identities: Record<FixtureActor, string>): unknown {
  if (typeof value === 'string') {
    return (Object.keys(LB49CR_SOURCE_UIDS) as FixtureActor[]).reduce(
      (result, actor) => result.replaceAll(LB49CR_SOURCE_UIDS[actor], identities[actor]),
      value
    );
  }
  if (Array.isArray(value)) return value.map((child) => replaceIdentities(child, identities));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceIdentities(child, identities)])
    );
  }
  return value;
}

async function seedReentryPrefix(roomCode: string, justinUid: string) {
  const identities: Record<FixtureActor, string> = {
    table: `table-${roomCode.toLowerCase()}`,
    alex: `alex-${roomCode.toLowerCase()}`,
    anna: `anna-${roomCode.toLowerCase()}`,
    justin: justinUid
  };
  const sequences = new Map<FixtureActor, number>();
  const events = LB49CR_REENTRY_PREFIX.map((fixture, index) => {
    const clientSeq = (sequences.get(fixture.actor) ?? 0) + 1;
    sequences.set(fixture.actor, clientSeq);
    const actorUid = identities[fixture.actor];
    const payload = replaceIdentities(fixture.payload, identities) as Record<string, unknown>;
    if (fixture.type === 'game/created') {
      payload.gameId = roomCode.toLowerCase();
      payload.roomCode = roomCode;
    }
    return {
      id: `${actorUid}-${String(clientSeq).padStart(6, '0')}`,
      actorUid,
      clientSeq,
      type: fixture.type,
      payload,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
    };
  });
  const presentationSequence = (sequences.get('table') ?? 0) + 1;
  events.push({
    id: `${identities.table}-${String(presentationSequence).padStart(6, '0')}`,
    actorUid: identities.table,
    clientSeq: presentationSequence,
    type: 'presentation/decision-revealed',
    payload: { decisionKey: `reentry:5:${justinUid}` },
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 1)).toISOString()
  });

  for (const event of events) {
    const response = await fetch(
      `http://127.0.0.1:8188/v1/projects/roborally-e2e/databases/(default)/documents/` +
        `games/${roomCode.toLowerCase()}/events/${encodeURIComponent(event.id)}`,
      {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer owner',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            actorUid: firestoreValue(event.actorUid),
            clientSeq: firestoreValue(event.clientSeq),
            type: firestoreValue(event.type),
            payload: firestoreValue(event.payload),
            schemaVersion: firestoreValue(1),
            reducerVersion: firestoreValue('room-v1'),
            createdAt: { timestampValue: event.createdAt }
          }
        })
      }
    );
    if (!response.ok) throw new Error(`Could not seed ${event.id}: ${await response.text()}`);
  }
}

test('an occupied archive uses a staged, spatial re-entry control', async ({ page }, testInfo) => {
  const roomCode = testInfo.project.name === 'phone' ? 'R25PHN' : 'R25DSK';
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Occupied archive re-entry',
    'The LB49CR turn-five state is replayed with Anna occupying Justin’s current archive. The private controller presents seven spatial placement choices before the legal facing choices, then accepts Justin’s recorded placement.'
  );

  await page.goto(`/hand/?room=${roomCode}&seat=1`);
  const uid = await anonymousUid(page);
  await seedReentryPrefix(roomCode, uid);

  const control = page.getByRole('region', { name: 'Robot re-entry choice' });
  await expect(control).toBeVisible();
  const squares = page.getByRole('button', { name: /^Re-entry square \(/ });
  await expect(squares).toHaveCount(7);
  await steps.step('occupied-archive-choices', {
    status: 'skip',
    description: 'Justin sees the occupied archive and seven nearby legal squares',
    verifications: [
      {
        spec: 'The archive identifies Anna as its occupant and is not selectable',
        check: async () => {
          await expect(page.getByText('Archive (7,7) is occupied by Anna.')).toBeVisible();
          await expect(page.getByLabel('Occupied archive (7,7), Anna')).toBeVisible();
        }
      },
      {
        spec: 'Seven square choices replace the former 23-item cell-and-facing menu',
        check: async () => {
          await expect(squares).toHaveCount(7);
          await expect(page.getByRole('button', { name: /^Face / }).first()).toBeDisabled();
        }
      }
    ]
  });

  const selectedSquare = page.getByRole('button', { name: 'Re-entry square (6,6)' });
  await selectedSquare.click();
  await steps.step('select-nearest-square', {
    status: 'skip',
    description: 'Justin selects the legal square at (6,6)',
    verifications: [
      {
        spec: 'The selected square is visibly highlighted before facing is chosen',
        check: async () => await expect(selectedSquare).toHaveAttribute('aria-pressed', 'true')
      }
    ]
  });

  const north = page.getByRole('button', { name: 'Face north' });
  await north.click();
  await steps.step('select-facing', {
    status: 'skip',
    description: 'Justin selects north from the legal facings for (6,6)',
    verifications: [
      {
        spec: 'The north arrow is visibly selected and confirmation becomes available',
        check: async () => {
          await expect(north).toHaveAttribute('aria-pressed', 'true');
          await expect(page.getByRole('button', { name: 'CONFIRM RE-ENTRY' })).toBeEnabled();
        }
      }
    ]
  });

  await page.getByRole('button', { name: 'CONFIRM RE-ENTRY' }).click();
  await expect(control).toBeHidden();
  await steps.step('recorded-reentry-completes', {
    status: 'skip',
    description: 'The recorded LB49CR placement completes cleanup',
    verifications: [
      {
        spec: 'The controller advances instead of remaining stuck on a rejected re-entry event',
        check: async () => {
          await expect(control).toBeHidden();
          await expect(
            page.getByText(
              'Watch the shared tabletop—the next decision will appear here when playback reaches it.'
            )
          ).toBeVisible();
        }
      }
    ]
  });

  steps.generateDocs();
});
