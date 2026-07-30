import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFile } from 'node:fs/promises';

let environment: RulesTestEnvironment;

describe('append-only game stream rules', () => {
  const eventData = (actorUid: string, type = 'game/created') => ({
    actorUid,
    type,
    payload:
      type === 'game/created'
        ? { hostUid: actorUid, gameId: 'room', roomCode: 'ROOM22' }
        : { uid: actorUid, name: 'Ada', robotId: 'axle' },
    clientSeq: 1,
    createdAt: serverTimestamp(),
    schemaVersion: 1,
    reducerVersion: 'room-v1'
  });

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'roborally-e2e',
      firestore: { rules: await readFile('firestore.rules', 'utf8') }
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows attributed creates and authenticated reads', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    const event = doc(db, 'games/room/events/robot-a-000001');
    await assertSucceeds(setDoc(event, eventData('robot-a')));
    await assertSucceeds(getDoc(event));
  });

  it('denies unauthenticated access, false attribution, and malformed IDs', async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    const authenticated = environment.authenticatedContext('robot-a').firestore();
    await assertFails(getDoc(doc(anonymous, 'games/room/events/event')));
    await assertFails(
      setDoc(doc(authenticated, 'games/room/events/robot-a-000001'), eventData('robot-b'))
    );
    await assertFails(
      setDoc(doc(authenticated, 'games/room/events/not-an-event-id'), eventData('robot-a'))
    );
  });

  it('denies malformed envelopes, updates, deletes, and unrelated paths', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    const event = doc(db, 'games/room/events/robot-a-000001');
    await assertSucceeds(setDoc(event, eventData('robot-a')));
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a', 'player/joined'),
        clientSeq: 2,
        unexpected: true
      })
    );
    await assertFails(updateDoc(event, { type: 'changed' }));
    await assertFails(deleteDoc(event));
    await assertFails(setDoc(doc(db, 'games/room'), { mutable: true }));
  });

  it('allows attributed configuration and readiness events but denies false readiness', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'race/configured',
        payload: {
          config: {
            editionId: 'avalon-hill-2005',
            courseId: 'risky-exchange'
          }
        }
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'player/ready',
        clientSeq: 2,
        payload: {
          uid: 'robot-a',
          configurationEventId: 'robot-a-000001'
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000003'), {
        ...eventData('robot-a'),
        type: 'player/ready',
        clientSeq: 3,
        payload: {
          uid: 'robot-b',
          configurationEventId: 'robot-a-000001'
        }
      })
    );
  });

  it('attributes private Program submissions and permits any member to claim a timeout', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'program/submitted',
        payload: {
          uid: 'robot-a',
          turnId: 'turn-001',
          cardIds: [
            'program-010',
            'program-020',
            'program-030',
            'program-040',
            'program-050'
          ]
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'program/submitted',
        clientSeq: 2,
        payload: {
          uid: 'robot-b',
          turnId: 'turn-001',
          cardIds: []
        }
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000003'), {
        ...eventData('robot-a'),
        type: 'program/timed-out',
        clientSeq: 3,
        payload: {
          targetUid: 'robot-b',
          turnId: 'turn-001'
        }
      })
    );
  });

  it('allows only the owner to append a shaped re-entry choice', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'effect/chosen',
        payload: {
          uid: 'robot-a',
          turnId: 'turn-001',
          choice: { kind: 'reentry', x: 6, y: 15, facing: 'north' }
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'effect/chosen',
        clientSeq: 2,
        payload: {
          uid: 'robot-b',
          turnId: 'turn-001',
          choice: { kind: 'reentry', x: 7, y: 15, facing: 'north' }
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000003'), {
        ...eventData('robot-a'),
        type: 'effect/chosen',
        clientSeq: 3,
        payload: {
          uid: 'robot-a',
          turnId: 'turn-001',
          choice: { kind: 'reentry', x: 6, y: 15, facing: 'diagonal' }
        }
      })
    );
  });
});
