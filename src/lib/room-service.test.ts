import { describe, expect, it } from 'vitest';
import {
  ROOM_REDUCER_VERSION,
  ROOM_SCHEMA_VERSION,
  replayRoom,
  type RoomEvent,
  type RoomEventPayload,
  type RoomEventType
} from './room-model';
import {
  ROOM_CACHE_VERSION,
  clearRoomEventCache,
  mergeRoomEventPages,
  readRoomEventCache,
  writeRoomEventCache
} from './room-service';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

function event(
  actorUid: string,
  clientSeq: number,
  createdAt: number | null,
  type: RoomEventType,
  payload: RoomEventPayload
): RoomEvent {
  return {
    id: `${actorUid}-${String(clientSeq).padStart(6, '0')}`,
    type,
    payload,
    actorUid,
    clientSeq,
    createdAt,
    schemaVersion: ROOM_SCHEMA_VERSION,
    reducerVersion: ROOM_REDUCER_VERSION
  };
}

const created = event('host', 1, 100, 'game/created', {
  gameId: 'r16tst',
  roomCode: 'R16TST',
  hostUid: 'host'
});
const hostJoined = event('host', 2, 101, 'player/joined', {
  uid: 'host',
  name: 'Ada',
  robotId: 'axle'
});
const guestJoined = event('guest', 1, 102, 'player/joined', {
  uid: 'guest',
  name: 'Grace',
  robotId: 'bit'
});

describe('room cache plus immutable cursor', () => {
  it('round-trips an ordered prefix and records its last confirmed Firestore cursor', () => {
    const storage = new MemoryStorage();
    const cache = writeRoomEventCache('r16tst', [hostJoined, created], storage);
    expect(cache).toMatchObject({
      cacheVersion: ROOM_CACHE_VERSION,
      gameId: 'r16tst',
      cursor: { createdAt: 101, id: hostJoined.id }
    });
    expect(readRoomEventCache('R16TST', storage)?.events.map(({ id }) => id)).toEqual([
      created.id,
      hostJoined.id
    ]);
  });

  it('merges a cursor delta idempotently and replays exactly like a scratch read', () => {
    const pendingGuest = { ...guestJoined, createdAt: null };
    const merged = mergeRoomEventPages(
      [created, hostJoined, pendingGuest],
      [guestJoined, guestJoined]
    );
    expect(merged).toHaveLength(3);
    expect(merged.find(({ id }) => id === guestJoined.id)?.createdAt).toBe(102);
    expect(replayRoom(merged)).toEqual(replayRoom([created, hostJoined, guestJoined]));
  });

  it('does not advance a server cursor through a locally pending timestamp', () => {
    const storage = new MemoryStorage();
    const pending = event('guest', 1, null, 'player/joined', {
      uid: 'guest',
      name: 'Grace',
      robotId: 'bit'
    });
    expect(writeRoomEventCache('R16TST', [created, pending], storage).cursor).toEqual({
      createdAt: 100,
      id: created.id
    });
  });

  it('purges corrupt or incompatible wrappers and supports an explicit scratch replay', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `roborally.room-events.v${ROOM_CACHE_VERSION}.r16tst`,
      JSON.stringify({
        cacheVersion: ROOM_CACHE_VERSION,
        gameId: 'r16tst',
        schemaVersion: 999,
        reducerVersion: ROOM_REDUCER_VERSION,
        events: [created]
      })
    );
    expect(readRoomEventCache('R16TST', storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    writeRoomEventCache('R16TST', [created], storage);
    clearRoomEventCache('R16TST', storage);
    expect(readRoomEventCache('R16TST', storage)).toBeNull();
  });
});
