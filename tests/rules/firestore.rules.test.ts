import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFile } from 'node:fs/promises';

let environment: RulesTestEnvironment;

describe('append-only game stream rules', () => {
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
    await assertSucceeds(setDoc(event, { actorUid: 'robot-a', type: 'game/created' }));
    await assertSucceeds(getDoc(event));
  });

  it('denies unauthenticated access and false attribution', async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    const authenticated = environment.authenticatedContext('robot-a').firestore();
    await assertFails(getDoc(doc(anonymous, 'games/room/events/event')));
    await assertFails(
      setDoc(doc(authenticated, 'games/room/events/event'), {
        actorUid: 'robot-b',
        type: 'game/created'
      })
    );
  });

  it('denies updates, deletes, and unrelated paths', async () => {
    const db = environment.authenticatedContext('robot-a').firestore();
    const event = doc(db, 'games/room/events/robot-a-000001');
    await assertSucceeds(setDoc(event, { actorUid: 'robot-a', type: 'game/created' }));
    await assertFails(updateDoc(event, { type: 'changed' }));
    await assertFails(deleteDoc(event));
    await assertFails(setDoc(doc(db, 'games/room'), { mutable: true }));
  });
});
