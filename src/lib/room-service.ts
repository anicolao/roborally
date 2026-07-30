import {
  collection,
  doc,
  documentId,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  ROOM_REDUCER_VERSION,
  ROOM_SCHEMA_VERSION,
  normalizeRoomCode,
  replayRoom,
  type GameCreatedPayload,
  type GameRematchedPayload,
  type EffectChosenPayload,
  type PlayerJoinedPayload,
  type ProgramSubmittedPayload,
  type ProgramTimedOutPayload,
  type RaceConfiguredPayload,
  type RoomEvent,
  type RoomEventPayload,
  type RoomEventType,
  type RoomState
} from './room-model';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createRoomCode(randomValues = crypto.getRandomValues(new Uint8Array(6))): string {
  return Array.from(randomValues, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

export function roomEventId(actorUid: string, clientSeq: number): string {
  return `${actorUid}-${String(clientSeq).padStart(6, '0')}`;
}

function gameIdForCode(roomCode: string) {
  return normalizeRoomCode(roomCode).toLowerCase();
}

function sequenceKey(gameId: string, uid: string) {
  return `roborally.room-sequence.${gameId}.${uid}`;
}

function nextClientSequence(gameId: string, uid: string): number {
  return Number(localStorage.getItem(sequenceKey(gameId, uid)) ?? '0') + 1;
}

function rememberClientSequence(gameId: string, uid: string, sequence: number) {
  localStorage.setItem(sequenceKey(gameId, uid), String(sequence));
}

function samePersistedEvent(
  persisted: Record<string, unknown> | undefined,
  expected: Omit<RoomEvent, 'id' | 'createdAt'>
) {
  return (
    persisted?.type === expected.type &&
    persisted.actorUid === expected.actorUid &&
    persisted.clientSeq === expected.clientSeq &&
    persisted.schemaVersion === expected.schemaVersion &&
    persisted.reducerVersion === expected.reducerVersion &&
    JSON.stringify(persisted.payload) === JSON.stringify(expected.payload)
  );
}

export async function appendRoomEvent(
  db: Firestore,
  user: User,
  roomCode: string,
  type: RoomEventType,
  payload: RoomEventPayload
) {
  const gameId = gameIdForCode(roomCode);
  const clientSeq = nextClientSequence(gameId, user.uid);
  const id = roomEventId(user.uid, clientSeq);
  const event = {
    type,
    payload,
    actorUid: user.uid,
    clientSeq,
    schemaVersion: ROOM_SCHEMA_VERSION,
    reducerVersion: ROOM_REDUCER_VERSION
  };
  const reference = doc(db, `games/${gameId}/events/${id}`);

  try {
    await setDoc(reference, { ...event, createdAt: serverTimestamp() });
  } catch (error) {
    const existing = await getDoc(reference);
    if (!existing.exists() || !samePersistedEvent(existing.data(), event)) throw error;
  }

  rememberClientSequence(gameId, user.uid, clientSeq);
}

export async function createRoom(
  db: Firestore,
  user: User,
  roomCode: string,
  player: Omit<PlayerJoinedPayload, 'uid'>
) {
  const normalizedCode = normalizeRoomCode(roomCode);
  const created: GameCreatedPayload = {
    gameId: gameIdForCode(normalizedCode),
    roomCode: normalizedCode,
    hostUid: user.uid
  };
  await appendRoomEvent(db, user, normalizedCode, 'game/created', created);
  await appendRoomEvent(db, user, normalizedCode, 'player/joined', {
    uid: user.uid,
    ...player
  });
}

export async function joinRoom(
  db: Firestore,
  user: User,
  roomCode: string,
  player: Omit<PlayerJoinedPayload, 'uid'>
) {
  await appendRoomEvent(db, user, roomCode, 'player/joined', {
    uid: user.uid,
    ...player
  });
}

export async function configureRace(
  db: Firestore,
  user: User,
  roomCode: string,
  payload: RaceConfiguredPayload
) {
  await appendRoomEvent(db, user, roomCode, 'race/configured', payload);
}

export async function markReady(
  db: Firestore,
  user: User,
  roomCode: string,
  configurationEventId: string
) {
  await appendRoomEvent(db, user, roomCode, 'player/ready', {
    uid: user.uid,
    configurationEventId
  });
}

export async function submitProgram(
  db: Firestore,
  user: User,
  roomCode: string,
  cardIds: ProgramSubmittedPayload['cardIds'],
  turnId: ProgramSubmittedPayload['turnId'] = 'turn-001'
) {
  await appendRoomEvent(db, user, roomCode, 'program/submitted', {
    uid: user.uid,
    turnId,
    cardIds
  });
}

export async function claimProgramTimeout(
  db: Firestore,
  user: User,
  roomCode: string,
  targetUid: string,
  turnId: ProgramTimedOutPayload['turnId'] = 'turn-001'
) {
  await appendRoomEvent(db, user, roomCode, 'program/timed-out', {
    targetUid,
    turnId
  });
}

export async function chooseEffect(
  db: Firestore,
  user: User,
  roomCode: string,
  choice: EffectChosenPayload['choice'],
  turnId: EffectChosenPayload['turnId'] = 'turn-001'
) {
  await appendRoomEvent(db, user, roomCode, 'effect/chosen', {
    uid: user.uid,
    turnId,
    choice
  });
}

export async function rematchGame(
  db: Firestore,
  user: User,
  roomCode: string,
  payload: GameRematchedPayload
) {
  await appendRoomEvent(db, user, roomCode, 'game/rematched', payload);
}

export function subscribeRoom(
  db: Firestore,
  roomCode: string,
  onState: (state: RoomState) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const gameId = gameIdForCode(roomCode);
  const eventsQuery = query(
    collection(db, `games/${gameId}/events`),
    orderBy('createdAt'),
    orderBy(documentId())
  );

  return onSnapshot(
    eventsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const events = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data();
        return {
          id: snapshotDocument.id,
          type: data.type,
          payload: data.payload,
          actorUid: data.actorUid,
          clientSeq: data.clientSeq,
          createdAt: data.createdAt?.toMillis?.() ?? null,
          schemaVersion: data.schemaVersion,
          reducerVersion: data.reducerVersion
        } as RoomEvent;
      });
      onState(replayRoom(events));
    },
    onError
  );
}
