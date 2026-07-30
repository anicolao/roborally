import { describe, expect, it } from 'vitest';
import {
  MAX_ROOM_PLAYERS,
  ROBOTS,
  ROOM_REDUCER_VERSION,
  ROOM_SCHEMA_VERSION,
  replayRoom,
  type RoomEvent
} from './room-model';

function event(
  actorUid: string,
  clientSeq: number,
  type: RoomEvent['type'],
  payload: RoomEvent['payload'],
  createdAt = clientSeq
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

const created = event('host', 1, 'game/created', {
  gameId: 'rally2',
  roomCode: 'RALLY2',
  hostUid: 'host'
});

describe('immutable room replay', () => {
  it('orders events by timestamp and ID and seats players deterministically', () => {
    const joinedHost = event(
      'host',
      2,
      'player/joined',
      { uid: 'host', name: ' Ada ', robotId: 'axle' },
      3
    );
    const joinedGuest = event(
      'guest',
      1,
      'player/joined',
      { uid: 'guest', name: 'Grace', robotId: 'bit' },
      4
    );

    const state = replayRoom([joinedGuest, joinedHost, created]);

    expect(state.roomCode).toBe('RALLY2');
    expect(state.players).toEqual([
      { uid: 'host', name: 'Ada', robotId: 'axle', seat: 1 },
      { uid: 'guest', name: 'Grace', robotId: 'bit', seat: 2 }
    ]);
    expect(state.diagnostics).toEqual([]);
  });

  it('rejects stale, duplicate, incompatible, and conflicting events without partial mutation', () => {
    const joinedHost = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const duplicateName = event(
      'guest-a',
      1,
      'player/joined',
      { uid: 'guest-a', name: 'ada', robotId: 'bit' },
      3
    );
    const duplicateRobot = event(
      'guest-b',
      1,
      'player/joined',
      { uid: 'guest-b', name: 'Grace', robotId: 'axle' },
      4
    );
    const stale = event(
      'guest-c',
      2,
      'player/joined',
      { uid: 'guest-c', name: 'Lin', robotId: 'cog' },
      5
    );
    const incompatible = {
      ...event(
        'guest-d',
        1,
        'player/joined',
        { uid: 'guest-d', name: 'Edsger', robotId: 'dash' },
        6
      ),
      reducerVersion: 'room-v2'
    };

    const state = replayRoom([
      created,
      joinedHost,
      joinedHost,
      duplicateName,
      duplicateRobot,
      stale,
      incompatible
    ]);

    expect(state.players).toHaveLength(1);
    expect(state.diagnostics.map(({ code }) => code)).toEqual([
      'duplicate-event',
      'name-unavailable',
      'robot-unavailable',
      'stale-sequence',
      'incompatible-version'
    ]);
  });

  it('caps rooms at eight players and produces the same projection for every replay', () => {
    const joins = ROBOTS.map((robot, index) =>
      event(`player-${index}`, 1, 'player/joined', {
        uid: `player-${index}`,
        name: `Racer ${index + 1}`,
        robotId: robot.id
      }, index + 2)
    );
    const ninth = event(
      'player-nine',
      1,
      'player/joined',
      { uid: 'player-nine', name: 'Racer 9', robotId: 'axle' },
      20
    );

    const firstReplay = replayRoom([ninth, ...joins, created]);
    const secondReplay = replayRoom(JSON.parse(JSON.stringify([created, ...joins, ninth])));

    expect(firstReplay.players).toHaveLength(MAX_ROOM_PLAYERS);
    expect(firstReplay.diagnostics.at(-1)?.code).toBe('room-full');
    expect(secondReplay).toEqual(firstReplay);
  });
});
