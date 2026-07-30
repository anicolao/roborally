import {
  EDITION_ID,
  PRNG_VERSION,
  RACE_REDUCER_VERSION,
  deriveRaceSetup,
  type RaceConfig,
  type RaceSetup
} from './game/setup';
import { BOARD_MANIFEST_VERSION, COURSE_MANIFEST_VERSION } from './game/course-manifest';
import { PROGRAM_MANIFEST_VERSION } from './game/program-manifest';
import type { ProgramCard } from './game/program-manifest';
import {
  createProgrammingState,
  submitProgram,
  timeOutProgram,
  type ProgrammingState
} from './game/programming';

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
export type RoomEventType =
  | 'game/created'
  | 'player/joined'
  | 'race/configured'
  | 'player/ready'
  | 'program/submitted'
  | 'program/timed-out';

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

export interface RaceConfiguredPayload {
  config: RaceConfig;
}

export interface PlayerReadyPayload {
  uid: string;
  configurationEventId: string;
}

export interface ProgramSubmittedPayload {
  uid: string;
  turnId: 'turn-001';
  cardIds: ProgramCard['id'][];
}

export interface ProgramTimedOutPayload {
  targetUid: string;
  turnId: 'turn-001';
}

export type RoomEventPayload =
  | GameCreatedPayload
  | PlayerJoinedPayload
  | RaceConfiguredPayload
  | PlayerReadyPayload
  | ProgramSubmittedPayload
  | ProgramTimedOutPayload;

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
    | 'robot-unavailable'
    | 'host-only'
    | 'not-seated'
    | 'not-enough-players'
    | 'invalid-configuration'
    | 'stale-configuration'
    | 'already-ready'
    | 'race-already-started'
    | 'invalid-program'
    | 'invalid-timeout';
  message: string;
}

export interface RoomState {
  gameId: string;
  roomCode: string;
  hostUid: string;
  players: RoomPlayer[];
  configuration: RaceConfig | null;
  configurationEventId: string;
  readyPlayerUids: string[];
  setup: RaceSetup | null;
  programming: ProgrammingState | null;
  acceptedEventIds: string[];
  diagnostics: ReplayDiagnostic[];
}

export function emptyRoomState(): RoomState {
  return {
    gameId: '',
    roomCode: '',
    hostUid: '',
    players: [],
    configuration: null,
    configurationEventId: '',
    readyPlayerUids: [],
    setup: null,
    programming: null,
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

function isSupportedConfiguration(value: unknown, playerCount: number): value is RaceConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<RaceConfig>;
  return (
    config.editionId === EDITION_ID &&
    config.reducerVersion === RACE_REDUCER_VERSION &&
    config.prngVersion === PRNG_VERSION &&
    config.programManifestVersion === PROGRAM_MANIFEST_VERSION &&
    config.optionManifestVersion === null &&
    config.boardManifestVersion === BOARD_MANIFEST_VERSION &&
    config.courseManifestVersion === COURSE_MANIFEST_VERSION &&
    config.courseId === 'risky-exchange' &&
    typeof config.seed === 'string' &&
    config.seed.length >= 1 &&
    config.seed.length <= 64 &&
    (config.lives === 3 || (config.lives === 4 && playerCount >= 5)) &&
    Array.isArray(config.expansionIds) &&
    config.expansionIds.length === 0 &&
    Array.isArray(config.houseRuleIds) &&
    config.houseRuleIds.length === 0
  );
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
      if (state.setup) {
        diagnostic(state, event, 'race-already-started', 'A player cannot join a started race.');
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
      state.readyPlayerUids = [];
    } else if (event.type === 'race/configured') {
      const payload = event.payload as RaceConfiguredPayload;
      if (state.setup) {
        diagnostic(state, event, 'race-already-started', 'A started race cannot be reconfigured.');
        continue;
      }
      if (event.actorUid !== state.hostUid) {
        diagnostic(state, event, 'host-only', 'Only the room host can configure the race.');
        continue;
      }
      if (state.players.length < 2) {
        diagnostic(state, event, 'not-enough-players', 'At least two players must be seated.');
        continue;
      }
      if (!payload || !isSupportedConfiguration(payload.config, state.players.length)) {
        diagnostic(
          state,
          event,
          'invalid-configuration',
          'The race references unsupported or invalid 2005 manifests.'
        );
        continue;
      }

      state.configuration = payload.config;
      state.configurationEventId = event.id;
      state.readyPlayerUids = [];
    } else if (event.type === 'player/ready') {
      const payload = event.payload as PlayerReadyPayload;
      if (state.setup) {
        diagnostic(state, event, 'race-already-started', 'The race readiness barrier has closed.');
        continue;
      }
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        !state.players.some((player) => player.uid === event.actorUid)
      ) {
        diagnostic(state, event, 'not-seated', 'Only a seated player can become ready.');
        continue;
      }
      if (
        !state.configuration ||
        payload.configurationEventId !== state.configurationEventId
      ) {
        diagnostic(
          state,
          event,
          'stale-configuration',
          'Readiness must reference the current race configuration.'
        );
        continue;
      }
      if (state.readyPlayerUids.includes(event.actorUid)) {
        diagnostic(state, event, 'already-ready', 'The player is already ready.');
        continue;
      }

      state.readyPlayerUids.push(event.actorUid);
      if (state.readyPlayerUids.length === state.players.length) {
        state.setup = deriveRaceSetup(state.players, state.configuration);
        state.programming = createProgrammingState(state.setup, state.configuration);
      }
    } else if (event.type === 'program/submitted') {
      const payload = event.payload as ProgramSubmittedPayload;
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        payload.turnId !== 'turn-001' ||
        !Array.isArray(payload.cardIds) ||
        !state.programming
      ) {
        diagnostic(state, event, 'invalid-program', 'The Program submission is malformed.');
        continue;
      }
      const next = submitProgram(
        state.programming,
        event.actorUid,
        payload.cardIds,
        event.createdAt ?? 0
      );
      if (next.diagnostics.length !== state.programming.diagnostics.length) {
        diagnostic(state, event, 'invalid-program', 'The Program submission is not legal.');
        continue;
      }
      state.programming = next;
    } else if (event.type === 'program/timed-out') {
      const payload = event.payload as ProgramTimedOutPayload;
      if (
        !payload ||
        payload.turnId !== 'turn-001' ||
        typeof payload.targetUid !== 'string' ||
        !state.programming ||
        !state.configuration
      ) {
        diagnostic(state, event, 'invalid-timeout', 'The timeout claim is malformed.');
        continue;
      }
      const next = timeOutProgram(
        state.programming,
        payload.targetUid,
        event.createdAt ?? 0,
        state.configuration.seed
      );
      if (next.diagnostics.length !== state.programming.diagnostics.length) {
        diagnostic(state, event, 'invalid-timeout', 'The timeout claim is not yet legal.');
        continue;
      }
      state.programming = next;
    } else {
      diagnostic(state, event, 'invalid-event', `Event ${event.id} has an unknown type.`);
      continue;
    }

    lastSequence.set(event.actorUid, event.clientSeq);
    state.acceptedEventIds.push(event.id);
  }

  return state;
}
