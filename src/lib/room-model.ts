import {
  EDITION_ID,
  PRNG_VERSION,
  SUPPORTED_RACE_REDUCER_VERSIONS,
  PLAYABLE_COURSE_IDS,
  deriveRaceSetup,
  type PlayableCourseId,
  type RaceConfig,
  type RaceSetup
} from './game/setup';
import { BOARD_MANIFEST_VERSION, COURSE_MANIFEST_VERSION } from './game/course-manifest';
import { COMPLETE_BOARD_MANIFEST_VERSION } from './game/board-catalog';
import {
  COMPLETE_COURSE_MANIFEST_VERSION,
  PUBLISHED_COURSES_BY_ID
} from './game/course-catalog';
import { PROGRAM_MANIFEST_VERSION } from './game/program-manifest';
import { OPTION_MANIFEST_VERSION } from './game/option-manifest';
import type { ProgramCard } from './game/program-manifest';
import type { OptionCardId } from './game/option-manifest';
import {
  createOptionDeck,
  drawOption,
  validateOptionPlan,
  type OptionTurnPlan
} from './game/options';
import { playableCourse } from './game/playable-courses';
import { scenarioResolutionRules } from './game/course-rules';
import {
  createProgrammingState,
  recompileDecisionId,
  recompileProgramHand,
  submitProgram,
  timeOutProgram,
  updateProgramDraft,
  type ProgrammingState,
  type TurnId
} from './game/programming';
import {
  applyReentryChoice,
  applyOptionLossChoice,
  beginNextTurnPowerDowns,
  createRaceRobotPositions,
  resolveProgrammedTurn,
  type OptionDecision,
  type ProgramResolution,
  type ProgramPlaybackFrame,
  type ReentryChoice
} from './game/movement';

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
  | 'program/draft-updated'
  | 'program/timed-out'
  | 'effect/draft-updated'
  | 'effect/chosen'
  | 'game/rematched'
  | 'game/roster-transferred'
  | 'game/rematch-redirected'
  | 'presentation/decision-revealed'
  | 'presentation/turn-started'
  | 'presentation/step-completed'
  | 'power-down/responded';

export interface GameCreatedPayload {
  gameId: string;
  roomCode: string;
  hostUid: string;
}

export interface PlayerJoinedPayload {
  uid: string;
  name: string;
  robotId: RobotId;
  /** A tabletop QR code may reserve a specific physical position. */
  seat?: number;
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
  turnId: TurnId;
  cardIds: ProgramCard['id'][];
  pairedSlots?: (ProgramCard['id'] | null)[];
}

export interface ProgramDraftUpdatedPayload {
  uid: string;
  turnId: TurnId;
  cardIds: ProgramCard['id'][];
  slots?: (ProgramCard['id'] | null)[];
  pairedSlots?: (ProgramCard['id'] | null)[];
}

export interface ProgramTimedOutPayload {
  targetUid: string;
  turnId: TurnId;
  cardIds?: ProgramCard['id'][];
}

export interface EffectChosenPayload {
  uid: string;
  turnId: TurnId;
  choice:
    | (ReentryChoice & { kind: 'reentry' })
    | { kind: 'option-loss'; cardId: OptionCardId }
    | ({ kind: 'option-decision' } & OptionDecision)
    | OptionTurnPlan;
}

export interface GameRematchedPayload {
  epoch: number;
  seed: string;
}

export interface GameRosterTransferredPayload {
  sourceRoomCode: string;
  players: RoomPlayer[];
}

export interface GameRematchRedirectedPayload {
  roomCode: string;
}

export interface PowerDownRespondedPayload {
  uid: string;
  turnId: TurnId;
  powerDownNextTurn: boolean;
}

export interface PresentationDecisionRevealedPayload {
  decisionKey: string;
}

export interface PresentationTurnStartedPayload {
  turnId: TurnId;
  turnNumber: number;
}

export interface PresentationStepCompletedPayload {
  turnId: TurnId;
  turnNumber: number;
  segment: number;
  frameIndex: number;
}

export type PresentationTimelineEntry =
  | {
      kind: 'frame';
      eventId: string;
      segment: number;
      frameIndex: number;
      frame: ProgramPlaybackFrame;
    }
  | {
      kind: 'decision';
      eventId: string;
      decisionKey: string;
      actorUid: string;
    };

export interface PresentationTurnState {
  turnId: TurnId;
  turnNumber: number;
  segment: number;
  frameCursor: number;
  timeline: PresentationTimelineEntry[];
}

export type EffectDraft =
  | {
      kind: 'reentry';
      x: number | null;
      y: number | null;
      facing: ReentryChoice['facing'] | null;
      poweredDown: boolean;
    }
  | {
      kind: 'option-plan';
      activations: [];
    };

export interface EffectDraftUpdatedPayload {
  uid: string;
  turnId: TurnId;
  draft: EffectDraft;
}

export type RoomEventPayload =
  | GameCreatedPayload
  | PlayerJoinedPayload
  | RaceConfiguredPayload
  | PlayerReadyPayload
  | ProgramSubmittedPayload
  | ProgramDraftUpdatedPayload
  | ProgramTimedOutPayload
  | EffectDraftUpdatedPayload
  | EffectChosenPayload
  | GameRematchedPayload
  | GameRosterTransferredPayload
  | GameRematchRedirectedPayload
  | PresentationDecisionRevealedPayload
  | PresentationTurnStartedPayload
  | PresentationStepCompletedPayload
  | PowerDownRespondedPayload;

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
    | 'seat-unavailable'
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
    | 'invalid-timeout'
    | 'invalid-effect'
    | 'invalid-presentation'
    | 'invalid-rematch'
    | 'invalid-power-down';
  message: string;
}

export interface RoomState {
  gameId: string;
  roomCode: string;
  hostUid: string;
  rematchRoomCode: string;
  players: RoomPlayer[];
  configuration: RaceConfig | null;
  configurationEventId: string;
  readyPlayerUids: string[];
  setup: RaceSetup | null;
  programming: ProgrammingState | null;
  nextProgramming: ProgrammingState | null;
  resolution: ProgramResolution | null;
  raceEpoch: number;
  raceSummaries: { epoch: number; summary: NonNullable<ProgramResolution['summary']> }[];
  powerDownResponses: PowerDownRespondedPayload[];
  pendingPowerDownUid: string | null;
  optionPlans: (OptionTurnPlan & { uid: string; turnId: TurnId })[];
  optionDecisions: (OptionDecision & { turnId: TurnId })[];
  effectDrafts: (EffectDraftUpdatedPayload & { uid: string })[];
  pendingOptionUid: string | null;
  /** The resolution decision the shared tabletop has actually reached. */
  revealedDecisionKey: string | null;
  /** Durable animation progress for the current event-driven presentation turn. */
  presentationTurn: PresentationTurnState | null;
  acceptedEventIds: string[];
  diagnostics: ReplayDiagnostic[];
}

export function emptyRoomState(): RoomState {
  return {
    gameId: '',
    roomCode: '',
    hostUid: '',
    rematchRoomCode: '',
    players: [],
    configuration: null,
    configurationEventId: '',
    readyPlayerUids: [],
    setup: null,
    programming: null,
    nextProgramming: null,
    resolution: null,
    raceEpoch: 0,
    raceSummaries: [],
    powerDownResponses: [],
    pendingPowerDownUid: null,
    optionPlans: [],
    optionDecisions: [],
    effectDrafts: [],
    pendingOptionUid: null,
    revealedDecisionKey: null,
    presentationTurn: null,
    acceptedEventIds: [],
    diagnostics: []
  };
}

/**
 * A canonical resolution can run ahead of the shared tabletop's local animation.
 * This key identifies the next private control that may be revealed once playback
 * has visually reached it.
 */
export function presentationDecisionKey(state: RoomState): string | null {
  const resolution = state.resolution;
  if (!resolution) return null;
  if (resolution.pendingOptionDecision) {
    return `option-decision:${resolution.pendingOptionDecision.decisionId}`;
  }
  if (resolution.nextOptionChoiceUid) {
    return `option-loss:${resolution.turnNumber}:${resolution.nextOptionChoiceUid}`;
  }
  if (resolution.nextReentryUid) {
    return `reentry:${resolution.turnNumber}:${resolution.nextReentryUid}`;
  }
  if (resolution.phase === 'turn-complete' && state.nextProgramming) {
    return `next-turn:${state.nextProgramming.turnId}`;
  }
  return null;
}

function resolutionTurnId(state: RoomState): TurnId | null {
  const turnNumber = state.resolution?.turnNumber;
  if (!turnNumber) return null;
  if (state.programming?.turnNumber === turnNumber) return state.programming.turnId;
  return `turn-${String(turnNumber).padStart(3, '0')}` as TurnId;
}

export function presentationUsesEventStream(state: RoomState): boolean {
  return !!state.resolution &&
    state.presentationTurn?.turnNumber === state.resolution.turnNumber &&
    state.presentationTurn.turnId === resolutionTurnId(state);
}

export function presentationPlaybackComplete(state: RoomState): boolean {
  if (!state.resolution) return false;
  if (!presentationUsesEventStream(state)) return false;
  return state.presentationTurn!.frameCursor >= state.resolution.playback.frames.length;
}

/**
 * A live controller may expose the pending control only after every animation
 * frame before it has its own accepted event. Legacy rooms retain the former
 * reveal checkpoint so an in-progress deployed game remains replayable.
 */
export function presentationDecisionAvailable(state: RoomState): boolean {
  const decisionKey = presentationDecisionKey(state);
  if (!decisionKey) return false;
  return presentationUsesEventStream(state)
    ? presentationPlaybackComplete(state)
    : state.revealedDecisionKey === decisionKey;
}

function firstChangedFrameIndex(
  previous: readonly ProgramPlaybackFrame[],
  next: readonly ProgramPlaybackFrame[]
): number | null {
  const sharedLength = Math.min(previous.length, next.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (JSON.stringify(previous[index]) !== JSON.stringify(next[index])) return index;
  }
  return previous.length === next.length ? null : sharedLength;
}

function recordPresentedDecision(
  state: RoomState,
  event: RoomEvent,
  decisionKey: string,
  previousFrames: readonly ProgramPlaybackFrame[]
) {
  const presentation = state.presentationTurn;
  if (!presentation || !state.resolution || presentation.turnNumber !== state.resolution.turnNumber) {
    return;
  }
  presentation.timeline.push({
    kind: 'decision',
    eventId: event.id,
    decisionKey,
    actorUid: event.actorUid
  });
  presentation.segment += 1;
  const nextFrames = state.resolution.playback.frames;
  const changedFrame = firstChangedFrameIndex(previousFrames, nextFrames);
  presentation.frameCursor = changedFrame === null
    ? Math.min(presentation.frameCursor, nextFrames.length)
    : changedFrame;
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
  const courseId = config.courseId as PlayableCourseId | undefined;
  const course = courseId
    ? PUBLISHED_COURSES_BY_ID.get(
        courseId === 'risky-exchange-a' ? 'risky-exchange' : courseId
      )
    : undefined;
  const completeManifests =
    config.boardManifestVersion === COMPLETE_BOARD_MANIFEST_VERSION &&
    config.courseManifestVersion === COMPLETE_COURSE_MANIFEST_VERSION;
  const legacyRiskyExchangeManifests =
    (courseId === 'risky-exchange' || courseId === 'risky-exchange-a' || courseId === 'option-lab') &&
    config.boardManifestVersion === BOARD_MANIFEST_VERSION &&
    config.courseManifestVersion === COURSE_MANIFEST_VERSION;
  return (
    config.editionId === EDITION_ID &&
    SUPPORTED_RACE_REDUCER_VERSIONS.some((version) => config.reducerVersion === version) &&
    config.prngVersion === PRNG_VERSION &&
    config.programManifestVersion === PROGRAM_MANIFEST_VERSION &&
    config.optionManifestVersion === OPTION_MANIFEST_VERSION &&
    (completeManifests || legacyRiskyExchangeManifests) &&
    !!courseId &&
    (courseId === 'risky-exchange-a' || courseId === 'option-lab' ||
      PLAYABLE_COURSE_IDS.includes(courseId as (typeof PLAYABLE_COURSE_IDS)[number])) &&
    !!course?.players.includes(playerCount) &&
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

function turnStartRobots(
  state: RoomState,
  programming: ProgrammingState
): ProgramResolution['robots'] {
  if (!state.setup) return [];
  if (
    state.resolution?.turnNumber === programming.turnNumber &&
    state.resolution.playback.initialRobots.length > 0
  ) {
    return state.resolution.playback.initialRobots.map((robot) => ({
      ...robot,
      archive: { ...robot.archive },
      options: robot.options.map((option) => ({ ...option })),
      lockedRegisters: robot.lockedRegisters.map((locked) => ({ ...locked })),
      touchedFlags: [...robot.touchedFlags]
    }));
  }
  if (programming.turnNumber === 1) return initialRaceState(state).robots;
  if (state.resolution?.turnNumber === programming.turnNumber - 1) {
    return beginNextTurnPowerDowns(state.resolution.robots);
  }
  return [];
}

export function programmingOptionCardIds(
  state: RoomState,
  programming: ProgrammingState,
  uid: string
): OptionCardId[] {
  return turnStartRobots(state, programming)
    .find((robot) => robot.uid === uid)
    ?.options.map(({ cardId }) => cardId) ?? [];
}

function initialRaceState(state: Pick<RoomState, 'setup' | 'configuration' | 'gameId'>) {
  if (!state.setup) return { robots: [], optionDeck: createOptionDeck(state.gameId) };
  const optionDeck = createOptionDeck(state.configuration?.seed ?? state.gameId);
  const robots = createRaceRobotPositions(state.setup);
  const startingOptions = scenarioResolutionRules(
    playableCourse(state.setup.courseId)
  ).startingOptions;
  for (let round = 0; round < startingOptions; round += 1) {
    for (const robot of robots) {
      const option = drawOption(optionDeck);
      if (option) robot.options.push(option);
    }
  }
  return { robots, optionDeck };
}

function isPowerDownEligible(
  robot: ProgramResolution['robots'][number]
): boolean {
  return robot.status === 'active' && (robot.poweredDown || robot.damage > 0);
}

function refreshPowerDownPending(state: RoomState) {
  if (!state.programming || !state.setup?.powerDownAllowed) {
    state.pendingPowerDownUid = null;
    return;
  }
  const activeUids = new Set(
    turnStartRobots(state, state.programming)
      .filter(isPowerDownEligible)
      .map(({ uid }) => uid)
  );
  state.pendingPowerDownUid =
    state.setup.players.find(
      ({ uid }) =>
        activeUids.has(uid) &&
        !state.powerDownResponses.some(
          (response) =>
            response.turnId === state.programming?.turnId && response.uid === uid
        )
    )?.uid ?? null;
}

function refreshOptionPending(state: RoomState, robots = state.programming
  ? turnStartRobots(state, state.programming)
  : []) {
  if (!state.programming || state.programming.phase !== 'programmed' || !state.setup) {
    state.pendingOptionUid = null;
    return;
  }
  const eligible = new Set(
    robots
      .filter(({ status, options }) => status === 'active' && options.length > 0)
      .map(({ uid }) => uid)
  );
  state.pendingOptionUid =
    state.setup.players.find(
      ({ uid }) =>
        eligible.has(uid) &&
        !state.optionPlans.some(
          (plan) => plan.uid === uid && plan.turnId === state.programming?.turnId
        )
    )?.uid ?? null;
}

function projectNextProgramming(state: RoomState) {
  if (
    !state.setup ||
    !state.configuration ||
    !state.programming ||
    !state.resolution ||
    state.resolution.phase !== 'turn-complete' ||
    state.programming.phase !== 'programmed'
  ) {
    state.nextProgramming = null;
    return;
  }
  const nextRobots = beginNextTurnPowerDowns(state.resolution.robots);
  const damageByUid = Object.fromEntries(nextRobots.map(({ uid, damage }) => [uid, damage]));
  const lockedRegistersByUid = Object.fromEntries(
    nextRobots.map((robot) => [
      robot.uid,
      Object.fromEntries(
        robot.lockedRegisters.map(({ register, cardId, pairedCardId }) => [
          register,
          { cardId, ...(pairedCardId ? { pairedCardId } : {}) }
        ])
      )
    ])
  );
  const eligibleUids = new Set(
    nextRobots
      .filter(({ status, poweredDown }) => status === 'active' && !poweredDown)
      .map(({ uid }) => uid)
  );
  const optionIdsByUid = Object.fromEntries(
    nextRobots.map(({ uid, options }) => [
      uid,
      options.map(({ cardId }) => cardId)
    ])
  );
  const storedProgramCardIdsByUid = Object.fromEntries(
    nextRobots.map(({ uid, options }) => [
      uid,
      (options.find(({ cardId }) => cardId === 'flywheel')?.storedProgramCardId as
        | ProgramCard['id']
        | null) ?? null
    ])
  );
  const nextProgramming = createProgrammingState(
    state.setup,
    state.configuration,
    damageByUid,
    lockedRegistersByUid,
    state.resolution.turnNumber + 1,
    eligibleUids,
    optionIdsByUid,
    storedProgramCardIdsByUid
  );
  if (nextProgramming.players.length === 0) {
    // With every active robot powered down there is no Program submission to
    // activate the projected turn. Open it immediately so the usual ordered
    // power decisions can resolve the empty turn and project the next one.
    state.programming = nextProgramming;
    state.nextProgramming = null;
    state.powerDownResponses = [];
    state.optionPlans = [];
    state.optionDecisions = state.optionDecisions.filter(
      ({ turnId }) => turnId === nextProgramming.turnId
    );
    state.effectDrafts = [];
    refreshPowerDownPending(state);
    return;
  }
  state.nextProgramming = nextProgramming;
}

function resolveReadyProgramming(state: RoomState) {
  if (
    !state.programming ||
    state.programming.phase !== 'programmed' ||
    !state.setup
  ) {
    return;
  }
  const robots = turnStartRobots(state, state.programming);
  const missingResponse = robots.some(
    (robot) =>
      state.setup?.powerDownAllowed &&
      isPowerDownEligible(robot) &&
      !state.powerDownResponses.some(
        (response) =>
          response.turnId === state.programming?.turnId && response.uid === robot.uid
      )
  );
  if (missingResponse) {
    refreshPowerDownPending(state);
    return;
  }
  // Execution-time Options must not be planned up
  // front. The resolver stops at each unanswered choice and resumes by
  // replaying from this immutable turn-start snapshot.
  state.pendingOptionUid = null;
  for (const robot of robots) {
    robot.powerDownNextTurn =
      state.powerDownResponses.find(
        (response) =>
          response.turnId === state.programming?.turnId && response.uid === robot.uid
      )?.powerDownNextTurn ?? false;
  }
  state.pendingPowerDownUid = null;
  const optionPlans = Object.fromEntries(
    state.optionPlans
      .filter(({ turnId }) => turnId === state.programming?.turnId)
      .map(({ uid, ...plan }) => [uid, plan])
  );
  const optionDecisions = Object.fromEntries(
    state.optionDecisions
      .filter(({ turnId }) => turnId === state.programming?.turnId)
      .map(({ decisionId, uid, choiceId }) => [decisionId, { decisionId, uid, choiceId }])
  );
  const initialOptionDeck =
    state.resolution?.turnNumber === state.programming.turnNumber
      ? state.resolution.initialOptionDeck
      : state.resolution?.optionDeck ?? initialRaceState(state).optionDeck;
  state.resolution = resolveProgrammedTurn(
    state.programming,
    state.setup,
    robots,
    initialOptionDeck ?? createOptionDeck(state.configuration?.seed ?? state.gameId),
    optionPlans,
    optionDecisions
  );
  projectNextProgramming(state);
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
    // A protocol-valid immutable event consumes its actor's sequence even when
    // its domain payload is rejected. Otherwise one stale submission would
    // permanently poison every later retry from that client.
    lastSequence.set(event.actorUid, event.clientSeq);

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
    } else if (event.type === 'game/roster-transferred') {
      const payload = event.payload as GameRosterTransferredPayload;
      const sourceRoomCode = normalizeRoomCode(payload?.sourceRoomCode ?? '');
      const transferredPlayers = Array.isArray(payload?.players) ? payload.players : [];
      const normalizedPlayers = transferredPlayers.map((player) => ({
        uid: typeof player?.uid === 'string' ? player.uid : '',
        name: normalizePlayerName(player?.name ?? ''),
        robotId: player?.robotId,
        seat: player?.seat
      }));
      const validPlayers = normalizedPlayers.every(
        (player) =>
          !!player.uid &&
          !!player.name &&
          isRobotId(player.robotId) &&
          Number.isInteger(player.seat) &&
          player.seat >= 1 &&
          player.seat <= MAX_ROOM_PLAYERS
      );
      const uniquePlayers =
        new Set(normalizedPlayers.map(({ uid }) => uid)).size === normalizedPlayers.length &&
        new Set(normalizedPlayers.map(({ name }) => name.toLowerCase())).size === normalizedPlayers.length &&
        new Set(normalizedPlayers.map(({ robotId }) => robotId)).size === normalizedPlayers.length &&
        new Set(normalizedPlayers.map(({ seat }) => seat)).size === normalizedPlayers.length;
      if (
        !state.gameId ||
        event.actorUid !== state.hostUid ||
        state.players.length > 0 ||
        sourceRoomCode.length !== 6 ||
        sourceRoomCode === state.roomCode ||
        normalizedPlayers.length < 2 ||
        normalizedPlayers.length > MAX_ROOM_PLAYERS ||
        !validPlayers ||
        !uniquePlayers
      ) {
        diagnostic(
          state,
          event,
          'invalid-rematch',
          'A tabletop host can transfer one valid finished-race roster into a fresh room.'
        );
        continue;
      }
      state.players = normalizedPlayers
        .map(({ uid, name, robotId, seat }) => ({ uid, name, robotId, seat }))
        .sort((left, right) => left.seat - right.seat);
    } else if (event.type === 'player/joined') {
      const payload = event.payload as PlayerJoinedPayload;
      const name = normalizePlayerName(payload.name);
      const requestedSeat = payload?.seat;
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
      if (
        requestedSeat !== undefined &&
        (!Number.isInteger(requestedSeat) || requestedSeat < 1 || requestedSeat > MAX_ROOM_PLAYERS)
      ) {
        diagnostic(state, event, 'invalid-event', `Event ${event.id} has an invalid seat.`);
        continue;
      }
      const seat = requestedSeat ??
        Array.from({ length: MAX_ROOM_PLAYERS }, (_, index) => index + 1).find(
          (candidate) => !state.players.some((player) => player.seat === candidate)
        );
      if (!seat || state.players.some((player) => player.seat === seat)) {
        diagnostic(state, event, 'seat-unavailable', `Position ${seat ?? requestedSeat} is unavailable.`);
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
        seat
      });
      state.players.sort((left, right) => left.seat - right.seat);
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
        const initial = initialRaceState(state);
        state.programming = createProgrammingState(
          state.setup,
          state.configuration,
          Object.fromEntries(initial.robots.map(({ uid, damage }) => [uid, damage])),
          {},
          1,
          new Set(initial.robots.map(({ uid }) => uid)),
          Object.fromEntries(
            initial.robots.map(({ uid, options }) => [
              uid,
              options.map(({ cardId }) => cardId)
            ])
          )
        );
        state.nextProgramming = null;
        if (state.raceEpoch === 0) state.raceEpoch = 1;
        state.powerDownResponses = [];
        state.optionPlans = [];
        state.optionDecisions = [];
        state.effectDrafts = [];
        state.revealedDecisionKey = null;
        state.presentationTurn = null;
        refreshPowerDownPending(state);
      }
    } else if (event.type === 'program/draft-updated') {
      const payload = event.payload as ProgramDraftUpdatedPayload;
      const eventProgramming =
        payload?.turnId === state.programming?.turnId
          ? state.programming
          : payload?.turnId === state.nextProgramming?.turnId
            ? state.nextProgramming
            : null;
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        !Array.isArray(payload.cardIds) ||
        (payload.slots !== undefined && !Array.isArray(payload.slots)) ||
        (payload.pairedSlots !== undefined && !Array.isArray(payload.pairedSlots)) ||
        !eventProgramming
      ) {
        diagnostic(state, event, 'invalid-program', 'The Program draft is malformed.');
        continue;
      }
      const next = updateProgramDraft(
        eventProgramming,
        event.actorUid,
        payload.cardIds,
        payload.slots,
        payload.pairedSlots
      );
      if (next.diagnostics.length !== eventProgramming.diagnostics.length) {
        diagnostic(state, event, 'invalid-program', 'The Program draft is not legal.');
        continue;
      }
      if (eventProgramming === state.nextProgramming) state.nextProgramming = next;
      else state.programming = next;
    } else if (event.type === 'program/submitted') {
      const payload = event.payload as ProgramSubmittedPayload;
      const eventProgramming =
        payload?.turnId === state.programming?.turnId
          ? state.programming
          : payload?.turnId === state.nextProgramming?.turnId
            ? state.nextProgramming
            : null;
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        !Array.isArray(payload.cardIds) ||
        (payload.pairedSlots !== undefined && !Array.isArray(payload.pairedSlots)) ||
        !eventProgramming
      ) {
        diagnostic(state, event, 'invalid-program', 'The Program submission is malformed.');
        continue;
      }
      const activatesNextTurn = eventProgramming === state.nextProgramming;
      const next = submitProgram(
        eventProgramming,
        event.actorUid,
        payload.cardIds,
        event.createdAt ?? 0,
        payload.pairedSlots
      );
      if (next.diagnostics.length !== eventProgramming.diagnostics.length) {
        diagnostic(state, event, 'invalid-program', 'The Program submission is not legal.');
        continue;
      }
      if (activatesNextTurn) state.powerDownResponses = [];
      if (activatesNextTurn) state.optionPlans = [];
      if (activatesNextTurn) {
        state.optionDecisions = state.optionDecisions.filter(
          ({ turnId }) => turnId === next.turnId
        );
      }
      if (activatesNextTurn) state.effectDrafts = [];
      state.programming = next;
      state.nextProgramming = null;
      if (next.phase === 'programmed') {
        resolveReadyProgramming(state);
      } else {
        refreshPowerDownPending(state);
      }
    } else if (event.type === 'program/timed-out') {
      const payload = event.payload as ProgramTimedOutPayload;
      const eventProgramming =
        payload?.turnId === state.programming?.turnId
          ? state.programming
          : payload?.turnId === state.nextProgramming?.turnId
            ? state.nextProgramming
            : null;
      if (
        !payload ||
        typeof payload.targetUid !== 'string' ||
        (payload.cardIds !== undefined && !Array.isArray(payload.cardIds)) ||
        (event.actorUid !== payload.targetUid && (payload.cardIds?.length ?? 0) > 0) ||
        !eventProgramming ||
        !state.configuration
      ) {
        diagnostic(state, event, 'invalid-timeout', 'The timeout claim is malformed.');
        continue;
      }
      const activatesNextTurn = eventProgramming === state.nextProgramming;
      const next = timeOutProgram(
        eventProgramming,
        payload.targetUid,
        event.createdAt ?? 0,
        state.configuration.seed,
        payload.cardIds ?? []
      );
      if (next.diagnostics.length !== eventProgramming.diagnostics.length) {
        diagnostic(state, event, 'invalid-timeout', 'The timeout claim is not yet legal.');
        continue;
      }
      if (activatesNextTurn) state.powerDownResponses = [];
      if (activatesNextTurn) state.optionPlans = [];
      if (activatesNextTurn) {
        state.optionDecisions = state.optionDecisions.filter(
          ({ turnId }) => turnId === next.turnId
        );
      }
      if (activatesNextTurn) state.effectDrafts = [];
      state.programming = next;
      state.nextProgramming = null;
      if (next.phase === 'programmed') {
        resolveReadyProgramming(state);
      } else {
        refreshPowerDownPending(state);
      }
    } else if (event.type === 'effect/draft-updated') {
      const payload = event.payload as EffectDraftUpdatedPayload;
      const validTurn =
        payload?.draft?.kind === 'option-plan'
          ? payload.turnId === state.programming?.turnId
          : payload?.turnId ===
            `turn-${String(state.resolution?.turnNumber ?? 0).padStart(3, '0')}`;
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        !validTurn ||
        !payload.draft ||
        (payload.draft.kind === 'option-plan' &&
          (!Array.isArray(payload.draft.activations) ||
            payload.draft.activations.length !== 0)) ||
        (payload.draft.kind === 'reentry' &&
          (typeof payload.draft.poweredDown !== 'boolean' ||
            (payload.draft.facing !== null &&
              !['north', 'east', 'south', 'west'].includes(payload.draft.facing)) ||
            (payload.draft.x !== null && !Number.isInteger(payload.draft.x)) ||
            (payload.draft.y !== null && !Number.isInteger(payload.draft.y))))
      ) {
        diagnostic(state, event, 'invalid-effect', 'The effect draft is malformed.');
        continue;
      }
      state.effectDrafts = state.effectDrafts.filter(
        ({ uid, turnId }) => uid !== payload.uid || turnId !== payload.turnId
      );
      state.effectDrafts.push(payload);
    } else if (event.type === 'power-down/responded') {
      const payload = event.payload as PowerDownRespondedPayload;
      const eventProgramming =
        payload?.turnId === state.programming?.turnId
          ? state.programming
          : payload?.turnId === state.nextProgramming?.turnId
            ? state.nextProgramming
            : null;
      if (!payload || payload.uid !== event.actorUid || !eventProgramming) {
        diagnostic(
          state,
          event,
          'invalid-power-down',
          'The power-down response is malformed or stale.'
        );
        continue;
      }
      const activatesNextTurn = eventProgramming === state.nextProgramming;
      if (activatesNextTurn) {
        const activeUids = new Set(
          turnStartRobots(state, eventProgramming)
            .filter(isPowerDownEligible)
            .map(({ uid }) => uid)
        );
        const expectedUid = state.setup?.players.find(({ uid }) => activeUids.has(uid))?.uid;
        if (expectedUid !== event.actorUid) {
          diagnostic(
            state,
            event,
            'invalid-power-down',
            'Power-down responses must begin with the next turn’s first original Dock.'
          );
          continue;
        }
      }
      if (activatesNextTurn) {
        state.programming = eventProgramming;
        state.nextProgramming = null;
        state.powerDownResponses = [];
        state.optionPlans = [];
        state.optionDecisions = state.optionDecisions.filter(
          ({ turnId }) => turnId === eventProgramming.turnId
        );
        state.effectDrafts = [];
        refreshPowerDownPending(state);
      }
      if (
        state.pendingPowerDownUid !== event.actorUid ||
        state.powerDownResponses.some(
          (response) =>
            response.turnId === payload.turnId && response.uid === payload.uid
        )
      ) {
        diagnostic(
          state,
          event,
          'invalid-power-down',
          'Power-down responses must follow original Dock order exactly once.'
        );
        continue;
      }
      state.powerDownResponses.push(payload);
      refreshPowerDownPending(state);
      if (state.programming?.phase === 'programmed') {
        resolveReadyProgramming(state);
      }
    } else if (event.type === 'presentation/turn-started') {
      const payload = event.payload as PresentationTurnStartedPayload;
      const turnId = resolutionTurnId(state);
      if (
        !payload ||
        !state.resolution ||
        payload.turnId !== turnId ||
        payload.turnNumber !== state.resolution.turnNumber
      ) {
        diagnostic(
          state,
          event,
          'invalid-presentation',
          'A tabletop can only start presentation for the current resolved turn.'
        );
        continue;
      }
      if (!state.presentationTurn || state.presentationTurn.turnNumber !== payload.turnNumber) {
        state.presentationTurn = {
          turnId: payload.turnId,
          turnNumber: payload.turnNumber,
          segment: 0,
          frameCursor: 0,
          timeline: []
        };
      }
      state.revealedDecisionKey = null;
    } else if (event.type === 'presentation/step-completed') {
      const payload = event.payload as PresentationStepCompletedPayload;
      const presentation = state.presentationTurn;
      const duplicate = presentation?.timeline.some(
        (entry) =>
          entry.kind === 'frame' &&
          presentation.turnId === payload?.turnId &&
          presentation.turnNumber === payload?.turnNumber &&
          entry.segment === payload?.segment &&
          entry.frameIndex === payload?.frameIndex
      );
      if (!duplicate) {
        const frame = state.resolution?.playback.frames[payload?.frameIndex];
        if (
          !payload ||
          !presentation ||
          !state.resolution ||
          payload.turnId !== presentation.turnId ||
          payload.turnNumber !== presentation.turnNumber ||
          payload.turnNumber !== state.resolution.turnNumber ||
          payload.segment !== presentation.segment ||
          payload.frameIndex !== presentation.frameCursor ||
          !frame
        ) {
          diagnostic(
            state,
            event,
            'invalid-presentation',
            'A tabletop can only complete the next deterministic animation frame.'
          );
          continue;
        }
        presentation.timeline.push({
          kind: 'frame',
          eventId: event.id,
          segment: payload.segment,
          frameIndex: payload.frameIndex,
          frame: JSON.parse(JSON.stringify(frame)) as ProgramPlaybackFrame
        });
        presentation.frameCursor += 1;
      }
    } else if (event.type === 'presentation/decision-revealed') {
      const payload = event.payload as PresentationDecisionRevealedPayload;
      const expectedDecisionKey = presentationDecisionKey(state);
      // A tabletop may be reopened after browser storage is cleared, and two
      // displays may reach the same checkpoint together. These display-only
      // events therefore accept any actor and are idempotent for the current key.
      if (
        !payload ||
        typeof payload.decisionKey !== 'string' ||
        payload.decisionKey !== expectedDecisionKey
      ) {
        diagnostic(
          state,
          event,
          'invalid-presentation',
          'A tabletop can only reveal the current resolution decision.'
        );
        continue;
      }
      state.revealedDecisionKey = payload.decisionKey;
    } else if (event.type === 'effect/chosen') {
      const payload = event.payload as EffectChosenPayload;
      const eventProgramming =
        payload?.turnId === state.programming?.turnId
          ? state.programming
          : payload?.turnId === state.nextProgramming?.turnId
            ? state.nextProgramming
            : null;
      const recompileChoice =
        payload?.choice?.kind === 'option-decision' ? payload.choice : null;
      const isRecompileDecision =
        !!recompileChoice &&
        !!eventProgramming &&
        recompileChoice.decisionId ===
          recompileDecisionId(eventProgramming.turnNumber, event.actorUid);
      if (isRecompileDecision && recompileChoice) {
        const player = eventProgramming.players.find(({ uid }) => uid === event.actorUid);
        const optionCardIds = programmingOptionCardIds(
          state,
          eventProgramming,
          event.actorUid
        );
        const choiceId = recompileChoice.choiceId;
        const legalChoice =
          choiceId === 'take-damage' ||
          (choiceId.startsWith('discard:') &&
            optionCardIds.includes(choiceId.slice('discard:'.length) as OptionCardId));
        if (
          payload.uid !== event.actorUid ||
          recompileChoice.uid !== event.actorUid ||
          !player ||
          player.submitted ||
          !optionCardIds.includes('recompile') ||
          !legalChoice ||
          state.optionDecisions.some(
            ({ turnId, decisionId }) =>
              turnId === payload.turnId && decisionId === recompileChoice.decisionId
          ) ||
          !state.configuration
        ) {
          diagnostic(
            state,
            event,
            'invalid-effect',
            'Recompile may redeal an unsubmitted hand once per turn with a legal damage choice.'
          );
          continue;
        }
        const next = recompileProgramHand(
          eventProgramming,
          event.actorUid,
          state.configuration.seed
        );
        state.optionDecisions.push({
          decisionId: recompileChoice.decisionId,
          uid: event.actorUid,
          choiceId,
          turnId: payload.turnId
        });
        if (eventProgramming === state.nextProgramming) state.nextProgramming = next;
        else state.programming = next;
        state.acceptedEventIds.push(event.id);
        continue;
      }
      const executionChoice =
        payload?.choice?.kind === 'option-plan' ||
        payload?.choice?.kind === 'option-decision';
      if (
        !payload ||
        payload.uid !== event.actorUid ||
        (executionChoice
          ? payload.turnId !== state.programming?.turnId
          : payload.turnId !==
            `turn-${String(state.resolution?.turnNumber ?? 0).padStart(3, '0')}`) ||
        !state.resolution
      ) {
        diagnostic(state, event, 'invalid-effect', 'The effect choice is malformed.');
        continue;
      }
      const expectedPresentationDecision = presentationDecisionKey(state);
      const chosenPresentationDecision =
        payload.choice.kind === 'option-decision'
          ? `option-decision:${payload.choice.decisionId}`
          : payload.choice.kind === 'option-loss'
            ? `option-loss:${state.resolution.turnNumber}:${event.actorUid}`
            : payload.choice.kind === 'reentry'
              ? `reentry:${state.resolution.turnNumber}:${event.actorUid}`
              : null;
      if (
        presentationUsesEventStream(state) &&
        chosenPresentationDecision === expectedPresentationDecision &&
        !presentationPlaybackComplete(state)
      ) {
        diagnostic(
          state,
          event,
          'invalid-effect',
          'A private decision cannot be answered before its animation checkpoint.'
        );
        continue;
      }
      const previousPlaybackFrames = state.resolution.playback.frames;
      if (payload.choice.kind === 'option-decision') {
        const pendingDecision = state.resolution.pendingOptionDecision;
        const decisionId = payload.choice.decisionId;
        const choiceId = payload.choice.choiceId;
        if (
          !pendingDecision ||
          state.resolution.phase !== 'awaiting-option-decision' ||
          pendingDecision.uid !== event.actorUid ||
          pendingDecision.decisionId !== decisionId ||
          payload.choice.uid !== event.actorUid ||
          !pendingDecision.choices.some(({ id }) => id === choiceId) ||
          state.optionDecisions.some(
            ({ turnId, decisionId: storedDecisionId }) =>
              turnId === payload.turnId && storedDecisionId === decisionId
          )
        ) {
          diagnostic(
            state,
            event,
            'invalid-effect',
            'Option decisions must answer the current Dock-ordered prompt with a legal choice.'
          );
          continue;
        }
        state.optionDecisions.push({
          decisionId,
          uid: event.actorUid,
          choiceId,
          turnId: payload.turnId
        });
        state.revealedDecisionKey = null;
        resolveReadyProgramming(state);
        projectNextProgramming(state);
        if (expectedPresentationDecision) {
          recordPresentedDecision(
            state,
            event,
            expectedPresentationDecision,
            previousPlaybackFrames
          );
        }
        state.acceptedEventIds.push(event.id);
        continue;
      }
      const next =
        payload.choice?.kind === 'reentry' &&
        (payload.choice.poweredDown === undefined ||
          typeof payload.choice.poweredDown === 'boolean')
          ? applyReentryChoice(state.resolution, event.actorUid, payload.choice)
          : payload.choice?.kind === 'option-loss' &&
              typeof payload.choice.cardId === 'string'
            ? applyOptionLossChoice(
                state.resolution,
                event.actorUid,
                payload.choice.cardId
              )
            : payload.choice?.kind === 'option-plan' &&
                payload.turnId === state.programming?.turnId &&
                state.programming.phase === 'programmed' &&
                state.pendingOptionUid === event.actorUid
              ? (() => {
                  const robot = turnStartRobots(state, state.programming!).find(
                    ({ uid }) => uid === event.actorUid
                  );
                  if (
                    !robot ||
                    validateOptionPlan(robot.options, payload.choice).length > 0
                  ) {
                    return state.resolution!;
                  }
                  state.optionPlans.push({
                    ...payload.choice,
                    uid: event.actorUid,
                    turnId: payload.turnId
                  });
                  refreshOptionPending(state);
                  resolveReadyProgramming(state);
                  return state.resolution!;
                })()
            : state.resolution;
      if (payload.choice?.kind === 'option-plan') {
        if (
          !state.optionPlans.some(
            ({ uid, turnId }) => uid === event.actorUid && turnId === payload.turnId
          )
        ) {
          diagnostic(
            state,
            event,
            'invalid-effect',
            'Option plans must follow original Dock order and name owned cards.'
          );
          continue;
        }
      } else if (next === state.resolution) {
        diagnostic(
          state,
          event,
          'invalid-effect',
          'The re-entry cell or facing is not currently legal.'
        );
        continue;
      }
      state.resolution = next;
      state.revealedDecisionKey = null;
      if (expectedPresentationDecision && payload.choice?.kind !== 'option-plan') {
        recordPresentedDecision(
          state,
          event,
          expectedPresentationDecision,
          previousPlaybackFrames
        );
      }
      state.effectDrafts = state.effectDrafts.filter(
        ({ uid, turnId }) => uid !== event.actorUid || turnId !== payload.turnId
      );
      projectNextProgramming(state);
    } else if (event.type === 'game/rematched') {
      const payload = event.payload as GameRematchedPayload;
      if (
        !payload ||
        event.actorUid !== state.hostUid ||
        payload.epoch !== state.raceEpoch + 1 ||
        typeof payload.seed !== 'string' ||
        payload.seed.length < 1 ||
        payload.seed.length > 64 ||
        state.resolution?.phase !== 'race-finished' ||
        !state.resolution.summary ||
        !state.configuration
      ) {
        diagnostic(
          state,
          event,
          'invalid-rematch',
          'Only the host can begin the next immutable race epoch after a finish.'
        );
        continue;
      }
      state.raceSummaries.push({
        epoch: state.raceEpoch,
        summary: state.resolution.summary
      });
      state.raceEpoch = payload.epoch;
      state.configuration = null;
      state.configurationEventId = '';
      state.readyPlayerUids = [];
      state.setup = null;
      state.programming = null;
      state.nextProgramming = null;
      state.resolution = null;
      state.powerDownResponses = [];
      state.optionPlans = [];
      state.optionDecisions = [];
      state.effectDrafts = [];
      state.revealedDecisionKey = null;
      state.presentationTurn = null;
      refreshPowerDownPending(state);
    } else if (event.type === 'game/rematch-redirected') {
      const payload = event.payload as GameRematchRedirectedPayload;
      const nextRoomCode = normalizeRoomCode(payload?.roomCode ?? '');
      if (
        state.resolution?.phase !== 'race-finished' ||
        !state.resolution.summary ||
        state.rematchRoomCode ||
        nextRoomCode.length !== 6 ||
        nextRoomCode === state.roomCode
      ) {
        diagnostic(
          state,
          event,
          'invalid-rematch',
          'A finished race can redirect its retained racers to one fresh rematch room.'
        );
        continue;
      }
      state.rematchRoomCode = nextRoomCode;
    } else {
      diagnostic(state, event, 'invalid-event', `Event ${event.id} has an unknown type.`);
      continue;
    }

    state.acceptedEventIds.push(event.id);
  }

  return state;
}
