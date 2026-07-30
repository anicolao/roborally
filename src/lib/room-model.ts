export const ROOM_SCHEMA_VERSION = 1;
export const ROOM_REDUCER_VERSION = 'room-v1';
export const MAX_ROOM_PLAYERS = 8;

export const ROBOTS = [
  { id: 'axle', name: 'Axle', mark: 'AX' },
  { id: 'bit', name: 'Bit', mark: 'BT' },
  { id: 'cog', name: 'Cog', mark: 'CG' },
  { id: 'dash', name: 'Dash', mark: 'DS' },
  { id: 'flux', name: 'Flux', mark: 'FX' },
  { id: 'gizmo', name: 'Gizmo', mark: 'GZ' },
  { id: 'hex', name: 'Hex', mark: 'HX' },
  { id: 'rivet', name: 'Rivet', mark: 'RV' }
] as const;

export type RobotId = (typeof ROBOTS)[number]['id'];
export type RoomEventType = 'game/created' | 'player/joined';

export interface GameCreatedPayload {
  gameId: string;
  roomCode: string;
  hostUid: string;
}

export interface PlayerJoinedPayload {
  uid: string;
  name: string;
  robotId: RobotId;
}

export type RoomEventPayload = GameCreatedPayload | PlayerJoinedPayload;

export interface RoomEvent {
  id: string;
  type: RoomEventType;
  payload: RoomEventPayload;
  actorUid: string;
  clientSeq: number;
  createdAt: number | null;
  schemaVersion: number;
  reducerVersion: string;
}

export interface RoomPlayer {
  uid: string;
  name: string;
  robotId: RobotId;
  seat: number;
}

export interface ReplayDiagnostic {
  eventId: string;
  code:
    | 'duplicate-event'
    | 'incompatible-version'
    | 'invalid-event'
    | 'stale-sequence'
    | 'room-already-created'
    | 'room-not-created'
    | 'room-mismatch'
    | 'player-already-joined'
    | 'room-full'
    | 'name-unavailable'
    | 'robot-unavailable';
  message: string;
}

export interface RoomState {
  gameId: string;
  roomCode: string;
  hostUid: string;
  players: RoomPlayer[];
  acceptedEventIds: string[];
  diagnostics: ReplayDiagnostic[];
}

export function emptyRoomState(): RoomState {
  return {
    gameId: '',
    roomCode: '',
    hostUid: '',
    players: [],
    acceptedEventIds: [],
    diagnostics: []
  };
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function orderRoomEvents(events: readonly RoomEvent[]): RoomEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = left.createdAt ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt ?? Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}

function diagnostic(
  state: RoomState,
  event: RoomEvent,
  code: ReplayDiagnostic['code'],
  message: string
) {
  state.diagnostics.push({ eventId: event.id, code, message });
}

function isRobotId(value: unknown): value is RobotId {
  return ROBOTS.some((robot) => robot.id === value);
}

export function replayRoom(events: readonly RoomEvent[]): RoomState {
  const state = emptyRoomState();
  const seen = new Set<string>();
  const lastSequence = new Map<string, number>();

  for (const event of orderRoomEvents(events)) {
    if (seen.has(event.id)) {
      diagnostic(state, event, 'duplicate-event', `Duplicate event ${event.id} was ignored.`);
      continue;
    }
    seen.add(event.id);

    if (
      event.schemaVersion !== ROOM_SCHEMA_VERSION ||
      event.reducerVersion !== ROOM_REDUCER_VERSION
    ) {
      diagnostic(
        state,
        event,
        'incompatible-version',
        `Event ${event.id} requires an unsupported room protocol.`
      );
      continue;
    }

    const expectedSequence = (lastSequence.get(event.actorUid) ?? 0) + 1;
    if (
      !Number.isInteger(event.clientSeq) ||
      event.clientSeq !== expectedSequence ||
      event.id !== `${event.actorUid}-${String(event.clientSeq).padStart(6, '0')}`
    ) {
      diagnostic(
        state,
        event,
        'stale-sequence',
        `Event ${event.id} is not the next event for its actor.`
      );
      continue;
    }

    if (event.type === 'game/created') {
      const payload = event.payload as GameCreatedPayload;
      const roomCode = normalizeRoomCode(payload.roomCode);
      if (
        !payload ||
        payload.hostUid !== event.actorUid ||
        payload.gameId !== roomCode.toLowerCase() ||
        roomCode.length !== 6
      ) {
        diagnostic(state, event, 'invalid-event', `Event ${event.id} has invalid room data.`);
        continue;
      }
      if (state.gameId) {
        diagnostic(state, event, 'room-already-created', 'The room already has a creation event.');
        continue;
      }

      state.gameId = payload.gameId;
      state.roomCode = roomCode;
      state.hostUid = payload.hostUid;
    } else if (event.type === 'player/joined') {
      const payload = event.payload as PlayerJoinedPayload;
      const name = normalizePlayerName(payload.name);
      if (!payload || payload.uid !== event.actorUid || !name || !isRobotId(payload.robotId)) {
        diagnostic(state, event, 'invalid-event', `Event ${event.id} has invalid player data.`);
        continue;
      }
      if (!state.gameId) {
        diagnostic(state, event, 'room-not-created', 'A player cannot join before room creation.');
        continue;
      }
      if (state.players.some((player) => player.uid === payload.uid)) {
        diagnostic(state, event, 'player-already-joined', `${name} is already seated.`);
        continue;
      }
      if (state.players.length >= MAX_ROOM_PLAYERS) {
        diagnostic(state, event, 'room-full', `Room ${state.roomCode} already has eight racers.`);
        continue;
      }
      if (state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
        diagnostic(state, event, 'name-unavailable', `The racer name ${name} is unavailable.`);
        continue;
      }
      if (state.players.some((player) => player.robotId === payload.robotId)) {
        diagnostic(state, event, 'robot-unavailable', `Robot ${payload.robotId} is unavailable.`);
        continue;
      }

      state.players.push({
        uid: payload.uid,
        name,
        robotId: payload.robotId,
        seat: state.players.length + 1
      });
    } else {
      diagnostic(state, event, 'invalid-event', `Event ${event.id} has an unknown type.`);
      continue;
    }

    lastSequence.set(event.actorUid, event.clientSeq);
    state.acceptedEventIds.push(event.id);
  }

  return state;
}
