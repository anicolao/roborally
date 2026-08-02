import { describe, expect, it } from 'vitest';
import {
  MAX_ROOM_PLAYERS,
  ROBOTS,
  ROOM_REDUCER_VERSION,
  ROOM_SCHEMA_VERSION,
  replayRoom,
  type RoomEvent
} from './room-model';
import { factoryRejectsConfig, riskyExchangeConfig } from './game/setup';

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

  it('claims explicit tabletop positions and rejects a second claim for the same QR seat', () => {
    const positionEight = event('ada', 1, 'player/joined', {
      uid: 'ada',
      name: 'Ada',
      robotId: 'axle',
      seat: 8
    }, 2);
    const positionTwo = event('grace', 1, 'player/joined', {
      uid: 'grace',
      name: 'Grace',
      robotId: 'bit',
      seat: 2
    }, 3);
    const duplicatePosition = event('lin', 1, 'player/joined', {
      uid: 'lin',
      name: 'Lin',
      robotId: 'cog',
      seat: 2
    }, 4);
    const nextOpenPosition = event('margaret', 1, 'player/joined', {
      uid: 'margaret',
      name: 'Margaret',
      robotId: 'dash'
    }, 5);

    const state = replayRoom([
      created,
      positionEight,
      positionTwo,
      duplicatePosition,
      nextOpenPosition
    ]);

    expect(state.players.map(({ uid, seat }) => ({ uid, seat }))).toEqual([
      { uid: 'margaret', seat: 1 },
      { uid: 'grace', seat: 2 },
      { uid: 'ada', seat: 8 }
    ]);
    expect(state.diagnostics.map(({ code }) => code)).toEqual(['seat-unavailable']);
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

  it('consumes a valid actor sequence even when its domain action is rejected', () => {
    const rejectedCreation = event('host', 2, 'game/created', {
      gameId: 'replacement',
      roomCode: 'REPLAC',
      hostUid: 'host'
    }, 2);
    const recoveredJoin = event('host', 3, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 3);

    const state = replayRoom([created, rejectedCreation, recoveredJoin]);

    expect(state.players).toEqual([
      { uid: 'host', name: 'Ada', robotId: 'axle', seat: 1 }
    ]);
    expect(state.diagnostics.map(({ code }) => code)).toEqual(['invalid-event']);
  });

  it('uses event IDs as the deterministic tie-breaker for simultaneous timestamps', () => {
    const hostJoined = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const guestB = event('guest-b', 1, 'player/joined', {
      uid: 'guest-b',
      name: 'Babbage',
      robotId: 'bit'
    }, 3);
    const guestA = event('guest-a', 1, 'player/joined', {
      uid: 'guest-a',
      name: 'Curie',
      robotId: 'cog'
    }, 3);

    const first = replayRoom([guestB, hostJoined, created, guestA]);
    const second = replayRoom([created, guestA, guestB, hostJoined]);

    expect(first.players.map(({ uid, seat }) => ({ uid, seat }))).toEqual([
      { uid: 'host', seat: 1 },
      { uid: 'guest-a', seat: 2 },
      { uid: 'guest-b', seat: 3 }
    ]);
    expect(second).toEqual(first);
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

  it('closes a configuration-scoped readiness barrier into the exact seeded setup', () => {
    const joinedHost = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const joinedGuest = event('guest', 1, 'player/joined', {
      uid: 'guest',
      name: 'Grace',
      robotId: 'bit'
    }, 3);
    const configured = event('host', 3, 'race/configured', {
      config: riskyExchangeConfig('RISKY-6')
    }, 4);
    const hostReady = event('host', 4, 'player/ready', {
      uid: 'host',
      configurationEventId: configured.id
    }, 5);
    const guestReady = event('guest', 2, 'player/ready', {
      uid: 'guest',
      configurationEventId: configured.id
    }, 6);

    const state = replayRoom([
      guestReady,
      hostReady,
      configured,
      joinedGuest,
      joinedHost,
      created
    ]);

    expect(state.diagnostics).toEqual([]);
    expect(state.readyPlayerUids).toEqual(['host', 'guest']);
    expect(state.setup?.firstPlayerUid).toBe('guest');
    expect(state.setup?.players.map(({ uid, dock, facing, lives }) => ({
      uid,
      dock,
      facing,
      lives
    }))).toEqual([
      { uid: 'guest', dock: 1, facing: 'north', lives: 3 },
      { uid: 'host', dock: 2, facing: 'north', lives: 3 }
    ]);
  });

  it('starts Factory Rejects with five damaged robots and no power-down barrier', () => {
    const joins = Array.from({ length: 5 }, (_, index) => {
      const uid = index === 0 ? 'host' : `guest-${index}`;
      return event(uid, index === 0 ? 2 : 1, 'player/joined', {
        uid,
        name: `Racer ${index + 1}`,
        robotId: ROBOTS[index].id
      }, index + 2);
    });
    const configured = event('host', 3, 'race/configured', {
      config: factoryRejectsConfig('REJECTS-ROOM')
    }, 8);
    const readiness = joins.map((join, index) => {
      const uid = (join.payload as { uid: string }).uid;
      return event(uid, index === 0 ? 4 : 2, 'player/ready', {
        uid,
        configurationEventId: configured.id
      }, 9 + index);
    });

    const state = replayRoom([created, ...joins, configured, ...readiness]);

    expect(state.diagnostics).toEqual([]);
    expect(state.setup).toMatchObject({
      courseId: 'factory-rejects',
      startingDamage: 2,
      powerDownAllowed: false
    });
    expect(state.programming?.players).toHaveLength(5);
    expect(
      state.programming?.players.every(({ damage, hand }) => damage === 2 && hand.length === 7)
    ).toBe(true);
    expect(state.pendingPowerDownUid).toBeNull();
  });

  it('invalidates readiness on reconfiguration and rejects unsupported manifests', () => {
    const joinedHost = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const joinedGuest = event('guest', 1, 'player/joined', {
      uid: 'guest',
      name: 'Grace',
      robotId: 'bit'
    }, 3);
    const configured = event('host', 3, 'race/configured', {
      config: riskyExchangeConfig('first')
    }, 4);
    const ready = event('guest', 2, 'player/ready', {
      uid: 'guest',
      configurationEventId: configured.id
    }, 5);
    const replacement = event('host', 4, 'race/configured', {
      config: riskyExchangeConfig('replacement')
    }, 6);
    const staleReady = event('guest', 3, 'player/ready', {
      uid: 'guest',
      configurationEventId: configured.id
    }, 7);
    const unsupported = event('host', 5, 'race/configured', {
      config: { ...riskyExchangeConfig('bad'), boardManifestVersion: 'future' }
    } as never, 8);

    const state = replayRoom([
      created,
      joinedHost,
      joinedGuest,
      configured,
      ready,
      replacement,
      staleReady,
      unsupported
    ]);

    expect(state.configuration?.seed).toBe('replacement');
    expect(state.readyPlayerUids).toEqual([]);
    expect(state.setup).toBeNull();
    expect(state.diagnostics.map(({ code }) => code)).toEqual([
      'stale-configuration',
      'invalid-configuration'
    ]);
  });

  it('replays hidden Program submissions through the immutable event stream', () => {
    const joinedHost = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const joinedGuest = event('guest', 1, 'player/joined', {
      uid: 'guest',
      name: 'Grace',
      robotId: 'bit'
    }, 3);
    const configured = event('host', 3, 'race/configured', {
      config: riskyExchangeConfig('PROGRAM-REPLAY')
    }, 4);
    const hostReady = event('host', 4, 'player/ready', {
      uid: 'host',
      configurationEventId: configured.id
    }, 5);
    const guestReady = event('guest', 2, 'player/ready', {
      uid: 'guest',
      configurationEventId: configured.id
    }, 6);
    const dealt = replayRoom([
      created,
      joinedHost,
      joinedGuest,
      configured,
      hostReady,
      guestReady
    ]);
    const hostHand = dealt.programming!.players.find(({ uid }) => uid === 'host')!.hand;
    const guestHand = dealt.programming!.players.find(({ uid }) => uid === 'guest')!.hand;
    const hostProgram = event('host', 5, 'program/submitted', {
      uid: 'host',
      turnId: 'turn-001',
      cardIds: hostHand.slice(0, 5)
    }, 1_000);
    const guestDraft = event('guest', 3, 'program/draft-updated', {
      uid: 'guest',
      turnId: 'turn-001',
      cardIds: guestHand.slice(0, 2)
    }, 1_500);
    const guestProgram = event('guest', 4, 'program/submitted', {
      uid: 'guest',
      turnId: 'turn-001',
      cardIds: guestHand.slice(0, 5)
    }, 2_000);

    const state = replayRoom([
      created,
      joinedHost,
      joinedGuest,
      configured,
      hostReady,
      guestReady,
      hostProgram,
      guestDraft,
      guestProgram
    ]);

    expect(state.programming?.phase).toBe('programmed');
    expect(state.programming?.players.every(({ submitted }) => submitted)).toBe(true);
    expect(state.programming?.currentTurnDiscard).toHaveLength(8);
    expect(state.diagnostics).toEqual([]);
  });

  it('resolves ordinary Programs from the corrected Risky Exchange Docking Bay', () => {
    const joinedHost = event('host', 2, 'player/joined', {
      uid: 'host',
      name: 'Ada',
      robotId: 'axle'
    }, 2);
    const joinedGuest = event('guest', 1, 'player/joined', {
      uid: 'guest',
      name: 'Grace',
      robotId: 'bit'
    }, 3);
    const configured = event('host', 3, 'race/configured', {
      config: riskyExchangeConfig('PUSH-416')
    }, 4);
    const hostReady = event('host', 4, 'player/ready', {
      uid: 'host',
      configurationEventId: configured.id
    }, 5);
    const guestReady = event('guest', 2, 'player/ready', {
      uid: 'guest',
      configurationEventId: configured.id
    }, 6);
    const hostProgram = event('host', 5, 'program/submitted', {
      uid: 'host',
      turnId: 'turn-001',
      cardIds: [
        'program-520',
        'program-300',
        'program-060',
        'program-170',
        'program-140'
      ]
    }, 1_000);
    const guestProgram = event('guest', 3, 'program/submitted', {
      uid: 'guest',
      turnId: 'turn-001',
      cardIds: [
        'program-570',
        'program-250',
        'program-800',
        'program-820',
        'program-790'
      ]
    }, 2_000);
    const events = [
      created,
      joinedHost,
      joinedGuest,
      configured,
      hostReady,
      guestReady,
      hostProgram,
      guestProgram
    ];
    const destroyed = replayRoom(events);

    expect(destroyed.resolution?.phase).toBe('turn-complete');
    expect(destroyed.resolution?.robots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uid: 'host',
          status: 'active',
          archive: { x: 7, y: 16 }
        }),
        expect.objectContaining({
          uid: 'guest',
          status: 'active',
          archive: { x: 6, y: 16 }
        })
      ])
    );
    expect(destroyed.diagnostics).toEqual([]);
  });
});
