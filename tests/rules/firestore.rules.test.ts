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
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000003'), {
        ...eventData('robot-a'),
        type: 'race/configured',
        clientSeq: 3,
        payload: {
          config: {
            editionId: 'avalon-hill-2005',
            courseId: 'factory-rejects'
          }
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000004'), {
        ...eventData('robot-a'),
        type: 'race/configured',
        clientSeq: 4,
        payload: {
          config: {
            editionId: 'avalon-hill-2005',
            courseId: 'unreviewed-course'
          }
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000005'), {
        ...eventData('robot-a'),
        type: 'player/ready',
        clientSeq: 5,
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
          turnId: 'turn-002',
          cardIds: []
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000004'), {
        ...eventData('robot-a'),
        type: 'program/timed-out',
        clientSeq: 4,
        payload: {
          targetUid: 'robot-b',
          turnId: 'turn-002',
          cardIds: ['program-010']
        }
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000005'), {
        ...eventData('robot-a'),
        type: 'program/timed-out',
        clientSeq: 5,
        payload: {
          targetUid: 'robot-a',
          turnId: 'turn-002',
          cardIds: ['program-010']
        }
      })
    );
  });

  it('persists editable Program and effect drafts under the acting UID', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'program/draft-updated',
        payload: { uid: 'robot-a', turnId: 'turn-001', cardIds: ['program-010'] }
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'effect/draft-updated',
        clientSeq: 2,
        payload: {
          uid: 'robot-a',
          turnId: 'turn-001',
          draft: {
            kind: 'option-plan',
            preventDamageWith: ['ablative-coat'],
            activations: []
          }
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000003'), {
        ...eventData('robot-a'),
        type: 'program/draft-updated',
        clientSeq: 3,
        payload: { uid: 'robot-b', turnId: 'turn-001', cardIds: [] }
      })
    );
  });

  it('allows shaped immutable rematch epochs', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'game/rematched',
        payload: { epoch: 2, seed: 'REMATCH-2' }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'game/rematched',
        clientSeq: 2,
        payload: { epoch: 1, seed: 'STALE' }
      })
    );
  });

  it('allows shaped tabletop roster transfers and finished-room redirects', async () => {
    const db = environment.authenticatedContext('tabletop').firestore();
    const players = [
      { uid: 'robot-a', name: 'Ada', robotId: 'axle', seat: 1 },
      { uid: 'robot-b', name: 'Grace', robotId: 'bit', seat: 7 }
    ];
    await assertSucceeds(
      setDoc(doc(db, 'games/newrm2/events/tabletop-000001'), {
        ...eventData('tabletop'),
        type: 'game/roster-transferred',
        payload: { sourceRoomCode: 'OLDRM2', players }
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'games/oldrm2/events/tabletop-000001'), {
        ...eventData('tabletop'),
        type: 'game/rematch-redirected',
        payload: { roomCode: 'NEWRM2' }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/newrm2/events/tabletop-000002'), {
        ...eventData('tabletop'),
        type: 'game/roster-transferred',
        clientSeq: 2,
        payload: { sourceRoomCode: 'BAD', players }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/oldrm2/events/tabletop-000002'), {
        ...eventData('tabletop'),
        type: 'game/rematch-redirected',
        clientSeq: 2,
        payload: { roomCode: 'TOO-LONG' }
      })
    );
  });

  it('attributes ordered power-down responses to their owner', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'power-down/responded',
        payload: {
          uid: 'robot-a',
          turnId: 'turn-002',
          powerDownNextTurn: true
        }
      })
    );
    await assertFails(
      setDoc(doc(db, 'games/room/events/robot-a-000002'), {
        ...eventData('robot-a'),
        type: 'power-down/responded',
        clientSeq: 2,
        payload: {
          uid: 'robot-b',
          turnId: 'turn-002',
          powerDownNextTurn: false
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

  it('allows the owner to append a shaped Option-loss choice', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'effect/chosen',
        payload: {
          uid: 'robot-a',
          turnId: 'turn-003',
          choice: { kind: 'option-loss', cardId: 'brakes' }
        }
      })
    );
  });

  it('allows only the prompted owner to append a shaped damage-prevention choice', async () => {
    const hostDb = environment.authenticatedContext('host').firestore();
    await assertSucceeds(
      setDoc(doc(hostDb, 'games/room/events/host-000001'), {
        ...eventData('host'),
        type: 'effect/chosen',
        payload: {
          uid: 'host',
          turnId: 'turn-004',
          choice: {
            kind: 'damage-prevention',
            decisionId: 'r3-damage-01-host',
            uid: 'host',
            cardId: null
          }
        }
      })
    );

    const guestDb = environment.authenticatedContext('guest').firestore();
    await assertFails(
      setDoc(doc(guestDb, 'games/room/events/guest-000001'), {
        ...eventData('guest'),
        type: 'effect/chosen',
        payload: {
          uid: 'guest',
          turnId: 'turn-004',
          choice: {
            kind: 'damage-prevention',
            decisionId: 'r3-damage-01-host',
            uid: 'host',
            cardId: 'brakes'
          }
        }
      })
    );
  });

  it('allows the owner to append a finite Option plan', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'games/room/events/robot-a-000001'), {
        ...eventData('robot-a'),
        type: 'effect/chosen',
        payload: {
          uid: 'robot-a',
          turnId: 'turn-004',
          choice: {
            kind: 'option-plan',
            preventDamageWith: ['brakes'],
            activations: []
          }
        }
      })
    );
  });
});
