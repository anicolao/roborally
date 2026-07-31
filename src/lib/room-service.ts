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
  startAfter,
  Timestamp,
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
  type PowerDownRespondedPayload,
  type ProgramSubmittedPayload,
  type ProgramTimedOutPayload,
  type RaceConfiguredPayload,
  type RoomEvent,
  type RoomEventPayload,
  type RoomEventType,
  type RoomState
} from './room-model';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CACHE_VERSION = 1;

export interface RoomEventCursor {
  createdAt: number;
  id: string;
}

export interface RoomEventCache {
  cacheVersion: typeof ROOM_CACHE_VERSION;
  gameId: string;
  schemaVersion: typeof ROOM_SCHEMA_VERSION;
  reducerVersion: typeof ROOM_REDUCER_VERSION;
  cursor: RoomEventCursor | null;
  events: RoomEvent[];
}

export interface RoomSyncStatus {
  source: 'room-cache' | 'firestore-cache' | 'server';
  hasPendingWrites: boolean;
  eventCount: number;
  cursor: RoomEventCursor | null;
}

type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function roomCacheKey(gameId: string) {
  return `roborally.room-events.v${ROOM_CACHE_VERSION}.${gameId}`;
}

function cursorForEvents(events: readonly RoomEvent[]): RoomEventCursor | null {
  const last = [...events]
    .filter((event): event is RoomEvent & { createdAt: number } => event.createdAt !== null)
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.id.localeCompare(right.id)
    )
    .at(-1);
  return last ? { createdAt: last.createdAt, id: last.id } : null;
}

function validCachedEvent(value: unknown): value is RoomEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<RoomEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.type === 'string' &&
    typeof event.actorUid === 'string' &&
    Number.isInteger(event.clientSeq) &&
    (event.createdAt === null || typeof event.createdAt === 'number') &&
    typeof event.schemaVersion === 'number' &&
    typeof event.reducerVersion === 'string' &&
    !!event.payload &&
    typeof event.payload === 'object'
  );
}

export function readRoomEventCache(
  roomCode: string,
  storage: CacheStorage = localStorage
): RoomEventCache | null {
  const gameId = gameIdForCode(roomCode);
  const key = roomCacheKey(gameId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Partial<RoomEventCache>;
    if (
      cache.cacheVersion !== ROOM_CACHE_VERSION ||
      cache.gameId !== gameId ||
      cache.schemaVersion !== ROOM_SCHEMA_VERSION ||
      cache.reducerVersion !== ROOM_REDUCER_VERSION ||
      !Array.isArray(cache.events) ||
      !cache.events.every(validCachedEvent)
    ) {
      storage.removeItem(key);
      return null;
    }
    const events = orderCachedEvents(cache.events);
    return {
      cacheVersion: ROOM_CACHE_VERSION,
      gameId,
      schemaVersion: ROOM_SCHEMA_VERSION,
      reducerVersion: ROOM_REDUCER_VERSION,
      cursor: cursorForEvents(events),
      events
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeRoomEventCache(
  roomCode: string,
  events: readonly RoomEvent[],
  storage: CacheStorage = localStorage
): RoomEventCache {
  const gameId = gameIdForCode(roomCode);
  const ordered = orderCachedEvents(events);
  const cache: RoomEventCache = {
    cacheVersion: ROOM_CACHE_VERSION,
    gameId,
    schemaVersion: ROOM_SCHEMA_VERSION,
    reducerVersion: ROOM_REDUCER_VERSION,
    cursor: cursorForEvents(ordered),
    events: ordered
  };
  storage.setItem(roomCacheKey(gameId), JSON.stringify(cache));
  return cache;
}

export function clearRoomEventCache(
  roomCode: string,
  storage: CacheStorage = localStorage
) {
  storage.removeItem(roomCacheKey(gameIdForCode(roomCode)));
}

function orderCachedEvents(events: readonly RoomEvent[]) {
  return [...new Map(events.map((event) => [event.id, event])).values()].sort(
    (left, right) => {
      const leftTime = left.createdAt ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.createdAt ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    }
  );
}

export function mergeRoomEventPages(
  cachedEvents: readonly RoomEvent[],
  deltaEvents: readonly RoomEvent[]
) {
  return orderCachedEvents([...cachedEvents, ...deltaEvents]);
}

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

const pendingActorWrites = new Map<string, Promise<void>>();

async function appendRoomEventUnlocked(
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

export function appendRoomEvent(
  db: Firestore,
  user: User,
  roomCode: string,
  type: RoomEventType,
  payload: RoomEventPayload
): Promise<void> {
  const queueKey = `${gameIdForCode(roomCode)}:${user.uid}`;
  const previous = pendingActorWrites.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => {
      // A rejected write consumes no local sequence, so the next queued intent
      // retries from the same persisted cursor.
    })
    .then(() => appendRoomEventUnlocked(db, user, roomCode, type, payload));
  pendingActorWrites.set(queueKey, next);
  const cleanup = () => {
    if (pendingActorWrites.get(queueKey) === next) pendingActorWrites.delete(queueKey);
  };
  void next.then(cleanup, cleanup);
  return next;
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
  turnId: ProgramTimedOutPayload['turnId'] = 'turn-001',
  cardIds: ProgramTimedOutPayload['cardIds'] = []
) {
  await appendRoomEvent(db, user, roomCode, 'program/timed-out', {
    targetUid,
    turnId,
    cardIds: targetUid === user.uid ? cardIds : []
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

export async function respondPowerDown(
  db: Firestore,
  user: User,
  roomCode: string,
  payload: Omit<PowerDownRespondedPayload, 'uid'>
) {
  await appendRoomEvent(db, user, roomCode, 'power-down/responded', {
    uid: user.uid,
    ...payload
  });
}

export function subscribeRoom(
  db: Firestore,
  roomCode: string,
  onState: (state: RoomState) => void,
  onError: (error: Error) => void,
  onSync: (status: RoomSyncStatus) => void = () => {},
  storage: CacheStorage = localStorage
): Unsubscribe {
  const gameId = gameIdForCode(roomCode);
  const cached = readRoomEventCache(roomCode, storage);
  const mergedEvents = new Map((cached?.events ?? []).map((event) => [event.id, event]));
  if (cached) {
    onState(replayRoom(cached.events));
    onSync({
      source: 'room-cache',
      hasPendingWrites: false,
      eventCount: cached.events.length,
      cursor: cached.cursor
    });
  }

  const eventsCollection = collection(db, `games/${gameId}/events`);
  const eventsQuery = cached?.cursor
    ? query(
        eventsCollection,
        orderBy('createdAt'),
        orderBy(documentId()),
        startAfter(Timestamp.fromMillis(cached.cursor.createdAt), cached.cursor.id)
      )
    : query(eventsCollection, orderBy('createdAt'), orderBy(documentId()));

  return onSnapshot(
    eventsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      for (const snapshotDocument of snapshot.docs) {
        const data = snapshotDocument.data();
        mergedEvents.set(snapshotDocument.id, {
          id: snapshotDocument.id,
          type: data.type,
          payload: data.payload,
          actorUid: data.actorUid,
          clientSeq: data.clientSeq,
          createdAt: data.createdAt?.toMillis?.() ?? null,
          schemaVersion: data.schemaVersion,
          reducerVersion: data.reducerVersion
        } as RoomEvent);
      }
      const events = mergeRoomEventPages([], [...mergedEvents.values()]);
      onState(replayRoom(events));
      const source = snapshot.metadata.fromCache ? 'firestore-cache' : 'server';
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;
      const cache =
        source === 'server' && !hasPendingWrites
          ? writeRoomEventCache(roomCode, events, storage)
          : {
              cursor: cursorForEvents(events)
            };
      onSync({
        source,
        hasPendingWrites,
        eventCount: events.length,
        cursor: cache.cursor
      });
    },
    onError
  );
}
