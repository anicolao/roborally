<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { replaceState } from '$app/navigation';
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Unsubscribe } from 'firebase/firestore';
  import type { FirebaseServices } from '$lib/firebase';
  import CourseBoard from '$lib/components/CourseBoard.svelte';
  import CourseCatalog from '$lib/components/CourseCatalog.svelte';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import {
    OPTION_CARDS,
    OPTION_CARDS_BY_ID,
    type OptionCardId
  } from '$lib/game/option-manifest';
  import {
    beginNextTurnPowerDowns,
    legalReentryChoices,
    type ProgramPlayback,
    type RaceRobotPosition
  } from '$lib/game/movement';
  import {
    previewProgram,
    programCardZones,
    type ProgrammingPlayer
  } from '$lib/game/programming';
  import {
    PLAYABLE_COURSE_IDS,
    raceConfig,
    type PlayableCourseId
  } from '$lib/game/setup';
  import { PUBLISHED_COURSES_BY_ID } from '$lib/game/course-catalog';
  import {
    MAX_ROOM_PLAYERS,
    ROBOTS,
    emptyRoomState,
    normalizePlayerName,
    normalizeRoomCode,
    type RobotId
  } from '$lib/room-model';
  import type * as RoomService from '$lib/room-service';

  type ConnectionState = 'connecting' | 'synced' | 'offline' | 'error';
  type ViewMode = 'landing' | 'create' | 'join' | 'room';
  type PlaybackPhase = 'idle' | 'countdown' | 'register' | 'complete';

  let connectionState: ConnectionState = 'connecting';
  let connectionMessage = 'Connecting to the factory network';
  let browserOnline = true;
  let cacheHydrated = false;
  let roomWatchGeneration = 0;
  let synchronizedEventCount = 0;
  let synchronizedCursor = '';
  let mode: ViewMode = 'landing';
  let services: FirebaseServices | undefined;
  let roomService: typeof RoomService | undefined;
  let unsubscribe: Unsubscribe | undefined;
  let roomState = emptyRoomState();
  let roomCode = '';
  let joinCode = '';
  let playerName = '';
  let selectedRobot: RobotId = 'axle';
  let identityLabel = 'CONNECTING';
  let formError = '';
  let pending = false;
  let copied = false;
  let selectedCourseId: PlayableCourseId = 'risky-exchange';
  let setupSeed = 'RALLY-2005';
  let setupLives: 3 | 4 = 3;
  let selectedProgramCardIds: ProgramCard['id'][] = [];
  let programDraftDirty = false;
  let editingRegisterIndex = 0;
  let programHeadingElement: HTMLHeadingElement | undefined;
  let clockNow = Date.now();
  let clockInterval: ReturnType<typeof setInterval> | undefined;
  let showProgramming = false;
  let requestedTurnNumber = 1;
  let selectedReentryChoice = '';
  let reentryPoweredDown = false;
  let effectDraftDirty = false;
  let selectedOptionPreventionIds: OptionCardId[] = [];
  let playbackPhase: PlaybackPhase = 'idle';
  let playbackCountdown = 3;
  let playbackRegister: number | null = null;
  let playbackStage: ProgramPlayback['frames'][number]['stage'] | null = null;
  let playbackActorUid: string | null = null;
  let playbackCardId: ProgramCard['id'] | null = null;
  let playbackRobots: RaceRobotPosition[] | undefined;
  let playbackTrace: ProgramPlayback['frames'][number]['trace'] = [];
  let playbackFrameIndex = 0;
  let playbackFrameCount = 0;
  let playbackProductionDurationMs = 2_000;
  let playbackKey = '';
  // Keep emulator playback quick, but long enough for Playwright and the browser
  // to observe each independently rendered movement stage.
  let playbackTimeScale = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' ? 0.1 : 1;
  let playbackTimers: ReturnType<typeof setTimeout>[] = [];
  const PRODUCTION_PROGRAM_CARD_MS = 2_000;
  const PRODUCTION_FACTORY_STAGE_MS = 1_000;
  const PRODUCTION_COUNTDOWN_STEP_MS = 1_000;
  const buildHash = (import.meta.env.VITE_GIT_HASH ?? 'local-development').slice(0, 8);

  $: currentPlayer = services
    ? roomState.players.find((player) => player.uid === services?.user.uid)
    : undefined;
  $: unavailableRobots = new Set(roomState.players.map((player) => player.robotId));
  $: roomIsFull = roomState.players.length >= MAX_ROOM_PLAYERS;
  $: currentPlayerReady = currentPlayer
    ? roomState.readyPlayerUids.includes(currentPlayer.uid)
    : false;
  $: isHost = currentPlayer?.uid === roomState.hostUid;
  $: currentRobot = currentPlayer
    ? ROBOTS.find(({ id }) => id === currentPlayer.robotId)
    : undefined;
  $: selectedCourse = PUBLISHED_COURSES_BY_ID.get(selectedCourseId)!;
  $: configuredCourse = roomState.configuration
    ? PUBLISHED_COURSES_BY_ID.get(roomState.configuration.courseId)
    : undefined;
  $: selectedCourseSupportsRoom = selectedCourse.players.includes(roomState.players.length);
  $: activeProgramming =
    roomState.nextProgramming?.turnNumber === requestedTurnNumber
      ? roomState.nextProgramming
      : roomState.programming;
  $: projectedRobot = currentPlayer
    ? roomState.resolution?.robots.find(({ uid }) => uid === currentPlayer.uid)
    : undefined;
  $: currentPlayerPoweredDown =
    !!projectedRobot &&
    !!activeProgramming &&
    ((roomState.resolution?.turnNumber === activeProgramming.turnNumber - 1 &&
      projectedRobot.powerDownNextTurn) ||
      (roomState.resolution?.turnNumber === activeProgramming.turnNumber &&
        projectedRobot.poweredDown));
  $: programmingPlayer = currentPlayer && activeProgramming
    ? activeProgramming.players.find((player) => player.uid === currentPlayer.uid) ??
      (currentPlayerPoweredDown || activeProgramming.phase === 'programmed'
        ? ({
            uid: currentPlayer.uid,
            damage: 0,
            hand: [],
            registers: Array.from({ length: 5 }, () => ({ cardId: null, locked: false })),
            draftCardIds: [],
            submitted: true,
            timedOut: false
          } satisfies ProgrammingPlayer)
        : undefined)
    : undefined;
  $: openRegisterCount =
    currentPlayerPoweredDown
      ? 0
      : programmingPlayer?.registers.filter(({ locked }) => !locked).length ?? 0;
  $: powerResponse = currentPlayer && activeProgramming
    ? roomState.powerDownResponses.find(
        ({ uid, turnId }) => uid === currentPlayer.uid && turnId === activeProgramming?.turnId
      )
    : undefined;
  $: firstNextPowerUid =
    activeProgramming === roomState.nextProgramming
      ? roomState.setup?.players.find((player) =>
          beginNextTurnPowerDowns(roomState.resolution?.robots ?? []).some(
            ({ uid, status, damage, poweredDown }) =>
              uid === player.uid &&
              status === 'active' &&
              (poweredDown || damage > 0)
          )
        )?.uid
      : null;
  $: canRespondPowerDown =
    !!currentPlayer &&
    !powerResponse &&
    (roomState.pendingPowerDownUid === currentPlayer.uid ||
      firstNextPowerUid === currentPlayer.uid);
  $: programPreview = programmingPlayer
    ? previewProgram(programmingPlayer, selectedProgramCardIds)
    : [];
  $: openRegisterSlots =
    programmingPlayer?.registers.flatMap((register, index) => (register.locked ? [] : [index])) ?? [];
  $: playbackIsActive = playbackPhase === 'countdown' || playbackPhase === 'register';
  $: playbackTransitionMs = Math.round(playbackProductionDurationMs * playbackTimeScale);
  $: countdownStepMs = Math.round(PRODUCTION_COUNTDOWN_STEP_MS * playbackTimeScale);
  $: playbackCard = PROGRAM_CARDS.find(({ id }) => id === playbackCardId);
  $: playbackStageLabel = playbackStage === 'program-card'
    ? `${roomState.players.find(({ uid }) => uid === playbackActorUid)?.name ?? 'Robot'} · ${playbackCard?.action.replaceAll('-', ' ') ?? 'Program card'} · priority ${playbackCard?.priority ?? '—'}`
    : playbackStage === 'express-conveyors'
      ? 'Express conveyors'
    : playbackStage === 'conveyors'
        ? 'All conveyors'
        : playbackStage === 'pushers'
          ? 'Pushers'
          : playbackStage === 'gears'
            ? 'Gears · lasers · flags'
            : '';
  $: presentedResolutionRobots = playbackRobots ?? roomState.resolution?.robots;
  $: visibleResolutionTrace = playbackIsActive
    ? playbackTrace
    : (roomState.resolution?.trace ?? []);
  $: latestResolutionEntry = visibleResolutionTrace.at(-1);
  $: resolutionAnnouncement = playbackPhase === 'countdown'
    ? `Programs locked. Movement begins in ${playbackCountdown}`
    : playbackPhase === 'register' && playbackRegister
      ? `Turn ${roomState.resolution?.turnNumber}, register ${playbackRegister}, ${playbackStageLabel}: ${latestResolutionEntry?.text ?? 'executing'}`
      : latestResolutionEntry
        ? `Turn ${roomState.resolution?.turnNumber}, ${
            latestResolutionEntry.register <= 5
              ? `register ${latestResolutionEntry.register}`
              : 'cleanup'
          }: ${latestResolutionEntry.text}`
        : roomState.resolution
          ? `Turn ${roomState.resolution.turnNumber} ${roomState.resolution.phase.replaceAll('-', ' ')}`
          : '';
  $: deadlineSeconds = activeProgramming?.deadline
    ? Math.max(0, Math.ceil((activeProgramming.deadline - clockNow) / 1000))
    : null;
  $: reentryChoices =
    currentPlayer && roomState.resolution
      ? legalReentryChoices(roomState.resolution, currentPlayer.uid)
      : [];
  $: reentryRobot = roomState.resolution?.robots.find(
    ({ uid }) => uid === roomState.resolution?.nextReentryUid
  );
  $: optionLossRobot = roomState.resolution?.robots.find(
    ({ uid }) => uid === roomState.resolution?.nextOptionChoiceUid
  );
  $: optionPlanRobot =
    currentPlayer && activeProgramming
      ? (roomState.resolution?.robots.find(({ uid }) => uid === currentPlayer.uid) ??
        undefined)
      : undefined;
  $: normalizedName = normalizePlayerName(playerName);
  $: canSubmit =
    !!normalizedName &&
    !pending &&
    !unavailableRobots.has(selectedRobot) &&
    (mode !== 'join' || (!!roomState.gameId && !roomIsFull));

  function clearPlaybackTimers() {
    for (const timer of playbackTimers) clearTimeout(timer);
    playbackTimers = [];
  }

  function resetProgramPlayback() {
    clearPlaybackTimers();
    playbackPhase = 'idle';
    playbackCountdown = 3;
    playbackRegister = null;
    playbackStage = null;
    playbackActorUid = null;
    playbackCardId = null;
    playbackRobots = undefined;
    playbackTrace = [];
    playbackFrameIndex = 0;
    playbackFrameCount = 0;
    playbackProductionDurationMs = PRODUCTION_PROGRAM_CARD_MS;
  }

  function schedulePlayback(callback: () => void, delay: number) {
    playbackTimers.push(setTimeout(callback, delay));
  }

  function productionDurationForFrame(frame: ProgramPlayback['frames'][number]) {
    if (frame.stage === 'program-card') return PRODUCTION_PROGRAM_CARD_MS;
    return PRODUCTION_FACTORY_STAGE_MS;
  }

  function startProgramPlayback(key: string, playback: ProgramPlayback) {
    resetProgramPlayback();
    playbackKey = key;
    playbackPhase = 'countdown';
    playbackCountdown = 3;
    playbackRobots = playback.initialRobots;
    playbackFrameCount = playback.frames.length;

    schedulePlayback(() => (playbackCountdown = 2), countdownStepMs);
    schedulePlayback(() => (playbackCountdown = 1), countdownStepMs * 2);

    const countdownDuration = countdownStepMs * 3;
    let frameStart = countdownDuration;
    for (const [index, frame] of playback.frames.entries()) {
      const productionDuration = productionDurationForFrame(frame);
      schedulePlayback(() => {
        playbackPhase = 'register';
        playbackRegister = frame.register;
        playbackStage = frame.stage;
        playbackActorUid = frame.actorUid;
        playbackCardId = frame.cardId;
        playbackRobots = frame.robots;
        playbackTrace = frame.trace;
        playbackFrameIndex = index + 1;
        playbackProductionDurationMs = productionDuration;
      }, frameStart);
      frameStart += Math.round(productionDuration * playbackTimeScale);
    }
    schedulePlayback(() => {
      playbackPhase = 'complete';
      playbackRegister = null;
      playbackStage = null;
      playbackActorUid = null;
      playbackCardId = null;
      playbackRobots = undefined;
      playbackTrace = [];
    }, frameStart);
  }

  $: {
    const resolution = roomState.resolution;
    const nextPlaybackKey = resolution
      ? `${roomState.raceEpoch}:${resolution.turnNumber}`
      : '';
    if (
      resolution?.playback.frames.length &&
      nextPlaybackKey &&
      nextPlaybackKey !== playbackKey
    ) {
      startProgramPlayback(nextPlaybackKey, resolution.playback);
    }
  }

  function deterministicIdentity(userId: string) {
    const requested = new URLSearchParams(window.location.search).get('e2eIdentity');
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && requested) {
      return requested.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    }
    return userId.slice(0, 8).toUpperCase();
  }

  function inviteUrl(code = roomCode) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', code);
    return url.toString();
  }

  function updateRoomUrl(code: string) {
    const url = new URL(window.location.href);
    const identity = url.searchParams.get('e2eIdentity');
    url.search = '';
    url.searchParams.set('room', code);
    if (identity) url.searchParams.set('e2eIdentity', identity);
    replaceState(url, {});
  }

  function watchRoom(code: string) {
    if (!services || !roomService) return;
    const generation = ++roomWatchGeneration;
    unsubscribe?.();
    roomCode = normalizeRoomCode(code);
    playbackKey = '';
    resetProgramPlayback();
    joinCode = roomCode;
    roomState = emptyRoomState();
    cacheHydrated = false;
    synchronizedEventCount = 0;
    synchronizedCursor = '';
    formError = '';
    requestedTurnNumber = 1;
    selectedProgramCardIds = [];
    programDraftDirty = false;
    selectedOptionPreventionIds = [];
    selectedReentryChoice = '';
    reentryPoweredDown = false;
    effectDraftDirty = false;
    unsubscribe = roomService.subscribeRoom(
      services.db,
      roomCode,
      (nextState) => {
        if (generation !== roomWatchGeneration) return;
        roomState = nextState;
        const draftProgramming =
          nextState.nextProgramming?.turnNumber === requestedTurnNumber
            ? nextState.nextProgramming
            : nextState.programming;
        const currentDraft =
          draftProgramming?.players.find((player) => player.uid === services?.user.uid)?.draftCardIds ??
          [];
        if (!programDraftDirty || JSON.stringify(currentDraft) === JSON.stringify(selectedProgramCardIds)) {
          selectedProgramCardIds = [...currentDraft];
          programDraftDirty = false;
        }
        const effectDraft = nextState.effectDrafts.find(
          ({ uid, turnId }) =>
            uid === services?.user.uid &&
            (turnId === nextState.programming?.turnId ||
              turnId === `turn-${String(nextState.resolution?.turnNumber ?? 0).padStart(3, '0')}`)
        );
        if (effectDraft && (!effectDraftDirty ||
          (effectDraft.draft.kind === 'option-plan' &&
            JSON.stringify(effectDraft.draft.preventDamageWith) === JSON.stringify(selectedOptionPreventionIds)) ||
          (effectDraft.draft.kind === 'reentry' &&
            ((effectDraft.draft.x === null && selectedReentryChoice === '') ||
              selectedReentryChoice === `${effectDraft.draft.x},${effectDraft.draft.y},${effectDraft.draft.facing}`) &&
            effectDraft.draft.poweredDown === reentryPoweredDown))) {
          if (effectDraft.draft.kind === 'option-plan') {
            selectedOptionPreventionIds = [...effectDraft.draft.preventDamageWith];
          } else if (effectDraft.draft.kind === 'reentry') {
            selectedReentryChoice =
              effectDraft.draft.x !== null &&
              effectDraft.draft.y !== null &&
              effectDraft.draft.facing
                ? `${effectDraft.draft.x},${effectDraft.draft.y},${effectDraft.draft.facing}`
                : '';
            reentryPoweredDown = effectDraft.draft.poweredDown;
          }
          effectDraftDirty = false;
        }
        if (mode === 'join' && !nextState.gameId) {
          formError = `Room ${roomCode} was not found.`;
        } else {
          formError = '';
        }
        if (nextState.players.some((player) => player.uid === services?.user.uid)) {
          mode = 'room';
          connectionMessage = `Room ${roomCode} synced`;
        }
      },
      (error) => {
        if (generation !== roomWatchGeneration) return;
        console.error(error);
        if (!navigator.onLine) {
          connectionState = 'offline';
          connectionMessage = `Room ${roomCode} cached · ${synchronizedEventCount} events`;
        } else {
          connectionState = 'error';
          formError = 'The immutable room stream could not be read.';
        }
      },
      (status) => {
        if (generation !== roomWatchGeneration) return;
        synchronizedEventCount = status.eventCount;
        synchronizedCursor = status.cursor
          ? `${status.cursor.createdAt}:${status.cursor.id}`
          : '';
        if (status.source === 'room-cache') cacheHydrated = true;
        if (status.source === 'server') {
          connectionState = 'synced';
          connectionMessage = `Room ${roomCode} synced`;
        } else if (!navigator.onLine) {
          connectionState = 'offline';
          connectionMessage = `Room ${roomCode} cached · ${status.eventCount} events`;
        } else {
          connectionState = 'connecting';
          connectionMessage = `Room ${roomCode} replaying cache`;
        }
      }
    );
  }

  function handleOffline() {
    browserOnline = false;
    if (mode !== 'room') return;
    connectionState = 'offline';
    connectionMessage = `Room ${roomCode} cached · ${synchronizedEventCount} events`;
  }

  function handleOnline() {
    browserOnline = true;
    if (mode !== 'room') return;
    connectionState = 'connecting';
    connectionMessage = `Room ${roomCode} reconnecting`;
  }

  function retryRoomFromServer() {
    if (!roomService || !navigator.onLine || !roomCode) return;
    roomService.clearRoomEventCache(roomCode);
    connectionState = 'connecting';
    connectionMessage = `Room ${roomCode} replaying from server`;
    watchRoom(roomCode);
  }

  onMount(async () => {
    try {
      if (
        import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
        new URLSearchParams(window.location.search).get('e2ePlayback') === 'slow'
      ) {
        playbackTimeScale = 0.5;
      }
      const { initializeFirebase } = await import('$lib/firebase');
      services = await initializeFirebase();
      browserOnline = navigator.onLine;
      roomService = await import('$lib/room-service');
      identityLabel = deterministicIdentity(services.user.uid);
      connectionState = 'synced';
      connectionMessage =
        import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
          ? 'Firebase emulator ready'
          : 'Factory network ready';
      const requestedRoom = normalizeRoomCode(
        new URLSearchParams(window.location.search).get('room') ?? ''
      );
      if (requestedRoom) {
        mode = 'join';
        watchRoom(requestedRoom);
      }
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      clockInterval = setInterval(() => (clockNow = Date.now()), 250);
    } catch (error) {
      console.error(error);
      connectionState = 'error';
      connectionMessage = 'Firebase configuration required';
    }
  });

  onDestroy(() => {
    unsubscribe?.();
    clearPlaybackTimers();
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('online', handleOnline);
    if (clockInterval) clearInterval(clockInterval);
  });

  function showCreate() {
    mode = 'create';
    playerName = '';
    selectedRobot = 'axle';
    formError = '';
  }

  function showJoin() {
    mode = 'join';
    roomCode = '';
    joinCode = '';
    roomState = emptyRoomState();
    formError = '';
  }

  function findRoom() {
    const code = normalizeRoomCode(joinCode);
    if (code.length !== 6) {
      formError = 'Enter the six-character room code.';
      return;
    }
    updateRoomUrl(code);
    watchRoom(code);
  }

  async function submitSeat() {
    if (!services || !roomService || !canSubmit) return;
    pending = true;
    formError = '';
    try {
      if (mode === 'create') {
        const requestedCode =
          import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
            ? new URLSearchParams(window.location.search).get('e2eRoomCode')
            : null;
        const code =
          normalizeRoomCode(requestedCode ?? '') || roomService.createRoomCode();
        if (code.length !== 6) throw new Error('A room code must contain six characters.');
        updateRoomUrl(code);
        watchRoom(code);
        await roomService.createRoom(services.db, services.user, code, {
          name: normalizedName,
          robotId: selectedRobot
        });
      } else {
        await roomService.joinRoom(services.db, services.user, roomCode, {
          name: normalizedName,
          robotId: selectedRobot
        });
      }
    } catch (error) {
      console.error(error);
      formError =
        mode === 'create'
          ? 'That room code is already in use. Try creating another race.'
          : 'Your seat could not be claimed. Replay the room and try again.';
    } finally {
      pending = false;
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl());
    copied = true;
  }

  async function configureCourse() {
    if (!services || !roomService || !isHost || roomState.players.length < 2) return;
    pending = true;
    formError = '';
    try {
      await roomService.configureRace(services.db, services.user, roomCode, {
        config: raceConfig(selectedCourseId, setupSeed.trim() || 'RALLY-2005', setupLives)
      });
    } catch (error) {
      console.error(error);
      formError = 'The race configuration event could not be written.';
    } finally {
      pending = false;
    }
  }

  async function becomeReady() {
    if (!services || !roomService || !roomState.configurationEventId || currentPlayerReady) return;
    pending = true;
    formError = '';
    try {
      await roomService.markReady(
        services.db,
        services.user,
        roomCode,
        roomState.configurationEventId
      );
    } catch (error) {
      console.error(error);
      formError = 'The readiness event could not be written.';
    } finally {
      pending = false;
    }
  }

  function toggleProgramCard(cardId: ProgramCard['id']) {
    if (programmingPlayer?.submitted) return;
    const selectedIndex = selectedProgramCardIds.indexOf(cardId);
    if (selectedIndex >= 0) {
      selectedProgramCardIds = selectedProgramCardIds.filter((selected) => selected !== cardId);
      editingRegisterIndex = Math.max(
        0,
        Math.min(selectedIndex, selectedProgramCardIds.length - 1)
      );
    } else if (selectedProgramCardIds.length < openRegisterCount) {
      selectedProgramCardIds = [...selectedProgramCardIds, cardId];
      editingRegisterIndex = selectedProgramCardIds.length - 1;
    }
    programDraftDirty = true;
    void persistProgramDraft();
  }

  function moveSelectedProgramCard(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= selectedProgramCardIds.length) return;
    const reordered = [...selectedProgramCardIds];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    selectedProgramCardIds = reordered;
    editingRegisterIndex = destination;
    programDraftDirty = true;
    void persistProgramDraft();
  }

  function removeSelectedProgramCard(index: number) {
    if (index < 0 || index >= selectedProgramCardIds.length) return;
    selectedProgramCardIds = selectedProgramCardIds.filter((_, candidate) => candidate !== index);
    editingRegisterIndex = Math.max(0, Math.min(index, selectedProgramCardIds.length - 1));
    programDraftDirty = true;
    void persistProgramDraft();
  }

  function handleProgramCardKeydown(event: KeyboardEvent, cardId: ProgramCard['id']) {
    const index = selectedProgramCardIds.indexOf(cardId);
    if (index < 0) return;
    if (event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelectedProgramCard(index, -1);
    } else if (event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelectedProgramCard(index, 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelectedProgramCard(index);
    }
  }

  async function openProgrammingConsole() {
    showProgramming = true;
    await tick();
    programHeadingElement?.focus();
  }

  async function persistProgramDraft() {
    if (!services || !roomService || !activeProgramming || programmingPlayer?.submitted) return;
    try {
      await roomService.updateProgramDraft(
        services.db,
        services.user,
        roomCode,
        selectedProgramCardIds,
        activeProgramming.turnId
      );
    } catch (error) {
      console.error(error);
      formError = 'The Program draft could not be written.';
    }
  }

  async function submitProgramCards() {
    if (
      !services ||
      !roomService ||
      selectedProgramCardIds.length !== openRegisterCount ||
      programmingPlayer?.submitted
    ) return;
    pending = true;
    try {
      await roomService.submitProgram(
        services.db,
        services.user,
        roomCode,
        selectedProgramCardIds,
        activeProgramming?.turnId
      );
      selectedProgramCardIds = [];
      programDraftDirty = false;
      editingRegisterIndex = 0;
    } catch (error) {
      console.error(error);
      formError = 'The immutable Program submission could not be written.';
    } finally {
      pending = false;
    }
  }

  async function claimTimeout() {
    const targetUid = activeProgramming?.deadlinePlayerUid;
    if (!services || !roomService || !targetUid || deadlineSeconds !== 0) return;
    pending = true;
    try {
      await roomService.claimProgramTimeout(
        services.db,
        services.user,
        roomCode,
        targetUid,
        activeProgramming?.turnId,
        selectedProgramCardIds
      );
      selectedProgramCardIds = [];
      programDraftDirty = false;
      editingRegisterIndex = 0;
    } catch (error) {
      console.error(error);
      formError = 'The timeout claim could not be written.';
    } finally {
      pending = false;
    }
  }

  async function submitReentryChoice() {
    if (!services || !roomService || !selectedReentryChoice) return;
    const [x, y, facing] = selectedReentryChoice.split(',');
    if (!x || !y || !['north', 'east', 'south', 'west'].includes(facing)) return;
    pending = true;
    try {
      await roomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        {
          kind: 'reentry',
          x: Number(x),
          y: Number(y),
          facing: facing as 'north' | 'east' | 'south' | 'west',
          ...(reentryRobot?.powerDownNextTurn
            ? { poweredDown: reentryPoweredDown }
            : {})
        },
        `turn-${String(roomState.resolution?.turnNumber ?? 1).padStart(3, '0')}`
      );
      selectedReentryChoice = '';
      reentryPoweredDown = false;
      effectDraftDirty = false;
    } catch (error) {
      console.error(error);
      formError = 'The re-entry choice could not be written.';
    } finally {
      pending = false;
    }
  }

  async function discardDestroyedOption(cardId: OptionCardId) {
    if (!services || !roomService || !activeProgramming) return;
    pending = true;
    try {
      await roomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        { kind: 'option-loss', cardId },
        activeProgramming.turnId
      );
    } catch (error) {
      console.error(error);
      formError = 'The Option loss choice could not be written.';
    } finally {
      pending = false;
    }
  }

  function toggleOptionPrevention(cardId: OptionCardId) {
    selectedOptionPreventionIds = selectedOptionPreventionIds.includes(cardId)
      ? selectedOptionPreventionIds.filter((id) => id !== cardId)
      : [...selectedOptionPreventionIds, cardId];
    effectDraftDirty = true;
    void persistOptionDraft();
  }

  async function persistOptionDraft() {
    if (!services || !roomService || !activeProgramming) return;
    try {
      await roomService.updateEffectDraft(
        services.db,
        services.user,
        roomCode,
        activeProgramming.turnId,
        { kind: 'option-plan', preventDamageWith: selectedOptionPreventionIds, activations: [] }
      );
    } catch (error) {
      console.error(error);
      formError = 'The Option draft could not be written.';
    }
  }

  async function persistReentryDraft() {
    if (!services || !roomService || !roomState.resolution) return;
    const [x, y, facing] = selectedReentryChoice.split(',');
    const validFacing = ['north', 'east', 'south', 'west'].includes(facing)
      ? (facing as 'north' | 'east' | 'south' | 'west')
      : null;
    effectDraftDirty = true;
    try {
      await roomService.updateEffectDraft(
        services.db,
        services.user,
        roomCode,
        `turn-${String(roomState.resolution.turnNumber).padStart(3, '0')}`,
        {
          kind: 'reentry',
          x: x ? Number(x) : null,
          y: y ? Number(y) : null,
          facing: validFacing,
          poweredDown: reentryPoweredDown
        }
      );
    } catch (error) {
      console.error(error);
      formError = 'The re-entry draft could not be written.';
    }
  }

  async function submitOptionPlan() {
    if (!services || !roomService || !activeProgramming) return;
    pending = true;
    try {
      await roomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        {
          kind: 'option-plan',
          preventDamageWith: selectedOptionPreventionIds,
          activations: []
        },
        activeProgramming.turnId
      );
      selectedOptionPreventionIds = [];
      effectDraftDirty = false;
    } catch (error) {
      console.error(error);
      formError = 'The ordered Option plan could not be written.';
    } finally {
      pending = false;
    }
  }

  async function rematchRace() {
    if (!services || !roomService || !isHost || roomState.resolution?.phase !== 'race-finished') {
      return;
    }
    pending = true;
    try {
      await roomService.rematchGame(services.db, services.user, roomCode, {
        epoch: roomState.raceEpoch + 1,
        seed: `${roomState.configuration?.seed ?? 'RALLY-2005'}:rematch-${
          roomState.raceEpoch + 1
        }`
      });
      requestedTurnNumber = 1;
      selectedProgramCardIds = [];
      programDraftDirty = false;
      editingRegisterIndex = 0;
    } catch (error) {
      console.error(error);
      formError = 'The immutable rematch event could not be written.';
    } finally {
      pending = false;
    }
  }

  async function respondPowerDown(powerDownNextTurn: boolean) {
    if (!services || !roomService || !activeProgramming || !canRespondPowerDown) return;
    pending = true;
    try {
      await roomService.respondPowerDown(services.db, services.user, roomCode, {
        turnId: activeProgramming.turnId,
        powerDownNextTurn
      });
    } catch (error) {
      console.error(error);
      formError = 'The ordered power-down response could not be written.';
    } finally {
      pending = false;
    }
  }

  function cardForId(cardId: ProgramCard['id'] | null) {
    return PROGRAM_CARDS.find((card) => card.id === cardId);
  }

  const cards = [
    { label: 'Move 3', priority: '840', mark: '↑↑↑' },
    { label: 'Rotate left', priority: '390', mark: '↶' },
    { label: 'Move 1', priority: '610', mark: '↑' },
    { label: 'Back up', priority: '470', mark: '↓' },
    { label: 'Rotate right', priority: '120', mark: '↷' }
  ];
</script>

<svelte:head>
  <title>{mode === 'room' ? `Room ${roomCode} — Robo Rally` : 'Robo Rally — Program the factory'}</title>
</svelte:head>

<main class="shell" data-e2e-layout>
  <header class="masthead">
    <a class="brand" href="/" aria-label="Robo Rally home">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span><strong>ROBO</strong> RALLY <small>2005</small></span>
    </a>

    <div class="network">
      <span class:online={connectionState === 'synced'} class="signal" aria-hidden="true"></span>
      <span
        role="status"
        data-status={connectionState}
        data-cache-hydrated={cacheHydrated}
        data-event-count={synchronizedEventCount}
        data-cursor={synchronizedCursor}
      >
        {connectionMessage}
      </span>
      {#if connectionState === 'offline'}
        <button type="button" onclick={retryRoomFromServer} disabled={!browserOnline}>
          Replay from server
        </button>
      {/if}
    </div>
  </header>
  <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="resolution-live">
    {resolutionAnnouncement}
  </div>

  {#if playbackPhase === 'countdown'}
    <div
      class="program-countdown"
      role="timer"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="program-countdown"
    >
      <small>ALL PROGRAMS LOCKED</small>
      {#key playbackCountdown}
        <strong>{playbackCountdown}</strong>
      {/key}
      <span>Movement incoming</span>
    </div>
  {:else if playbackPhase === 'register' && playbackRegister}
    <div
      class="register-playback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="register-playback"
      data-register={playbackRegister}
      data-stage={playbackStage}
      data-card-id={playbackCardId}
      data-frame={playbackFrameIndex}
      data-production-duration-ms={playbackProductionDurationMs}
    >
      <strong>REGISTER {playbackRegister} / {playbackStageLabel}</strong>
      <span>{latestResolutionEntry?.text ?? `${playbackStageLabel} resolved with no movement`}</span>
      <i style={`--playback-progress:${playbackFrameIndex / playbackFrameCount}`}></i>
    </div>
  {/if}

  {#if mode === 'room' && currentPlayer && roomState.setup && roomState.configuration}
    <section class="configured-race" aria-labelledby="race-heading">
      <CourseBoard
        setup={roomState.setup}
        robots={presentedResolutionRobots}
        currentPlayerUid={currentPlayer.uid}
        animateRobots={playbackIsActive}
        transitionDurationMs={playbackTransitionMs}
      />
      <aside
        class:resolution-active={!!roomState.resolution}
        class:next-turn-programming={!!roomState.resolution &&
          !!activeProgramming &&
          activeProgramming.turnNumber > roomState.resolution.turnNumber}
        class:many-robots={roomState.setup.players.length >= 3}
        class:program-editing={selectedProgramCardIds.length > 0 && !programmingPlayer?.submitted}
        class="setup-summary"
      >
        <p class="eyebrow">
          <span>{roomState.resolution ? '05' : showProgramming ? '04' : '03'}</span>
          {roomState.resolution
            ? 'PRIORITY RESOLUTION'
            : showProgramming
              ? `SHARED DECK / TURN ${activeProgramming?.turnNumber ?? 1}`
              : 'SEEDED RACE SETUP'}
        </p>
        <h1 id="race-heading">
          {showProgramming ? 'Program.' : 'Ready.'}<br />
          <em>{showProgramming ? 'Secret.' : 'Race.'}</em>
        </h1>
        <div class="your-robot" aria-label={`Your robot is ${currentRobot?.name ?? 'unknown'}`}>
          <span>YOUR ROBOT</span>
          <strong>{currentRobot?.name ?? 'Unknown'}</strong>
          <small>{currentPlayer.name} · {currentRobot?.mark ?? '—'} · BRIGHT YELLOW ON BOARD</small>
        </div>
        <p class="lede">
          {#if showProgramming}
            Seed <strong>{roomState.configuration.seed}</strong> deals one shared 84-card deck in
            original Dock order. Opponent programs stay masked until the barrier closes.
          {:else}
            The readiness barrier is closed. This exact setup is derived from seed
            <strong>{roomState.configuration.seed}</strong> and immutable manifest versions.
          {/if}
        </p>
        <dl class="setup-facts">
          <div><dt>{roomState.configuration.lives}</dt><dd>Lives each</dd></div>
          <div><dt>{roomState.setup.players.length}</dt><dd>robots</dd></div>
          <div><dt>{configuredCourse?.flags.length ?? 0}</dt><dd>flags</dd></div>
        </dl>
        <p class="epoch-state">
          Race epoch {roomState.raceEpoch} · {roomState.raceSummaries.length} retained
          {roomState.raceSummaries.length === 1 ? 'summary' : 'summaries'}
        </p>
        {#if cacheHydrated}
          <p class="reconnect-state">
            <span aria-label={`Cache + cursor replay verified · ${synchronizedEventCount} immutable events`}>
              Cache + cursor · {synchronizedEventCount} events
            </span>
            <button type="button" aria-label="Replay from server" onclick={retryRoomFromServer}>
              Replay
            </button>
          </p>
        {/if}
        <ol class="setup-order compact" aria-label="Original Dock order">
          {#each roomState.setup.players as player}
            {@const robot = ROBOTS.find((entry) => entry.id === player.robotId)}
            <li>
              <span>D{player.dock}</span>
              <strong>{player.name}</strong>
              <small>{robot?.name} · row {player.position.y}, column {player.position.x} · facing north</small>
              {#if player.uid === roomState.setup.firstPlayerUid}<em>first player</em>{/if}
            </li>
          {/each}
        </ol>
        {#if showProgramming && programmingPlayer && activeProgramming}
          <section class="program-console" aria-labelledby="hand-heading">
            <div class="program-head">
              <h2 id="hand-heading" tabindex="-1" bind:this={programHeadingElement}>
                Your hand · {programmingPlayer.hand.length || 'submitted'}
              </h2>
              <span>{selectedProgramCardIds.length}/{openRegisterCount} open</span>
            </div>
            <p class="conservation" data-testid="program-conservation">
              {programCardZones(activeProgramming).size}/84 cards accounted ·
              {activeProgramming.drawPile.length} undealt ·
              {activeProgramming.currentTurnDiscard.length} turn discard
            </p>
            <details class="option-catalog" aria-label="2005 Option catalog">
              <summary>26-card Option catalog · executable rules</summary>
              <ol>
                {#each OPTION_CARDS as option}
                  <li data-option-id={option.id}>
                    <strong>{option.name}</strong>
                    <span>{option.kind} · {option.timing.join(' / ')}</span>
                    <small>{option.summary}</small>
                  </li>
                {/each}
              </ol>
            </details>
            {#if roomState.setup.powerDownAllowed}
              <div
                class="power-control"
                aria-label="Ordered power-down control"
                data-turn-id={activeProgramming.turnId}
                data-can-respond={canRespondPowerDown}
                data-pending-uid={roomState.pendingPowerDownUid ?? firstNextPowerUid ?? ''}
              >
              {#if powerResponse}
                <span>
                  {powerResponse.powerDownNextTurn
                    ? 'Power down committed for next turn'
                    : 'Active next turn'}
                </span>
              {:else if canRespondPowerDown}
                <span>
                  {currentPlayerPoweredDown
                    ? 'Continue shutdown after this turn?'
                    : 'Announce shutdown for next turn?'}
                </span>
                <div>
                  <button type="button" onclick={() => respondPowerDown(true)} disabled={pending}>
                    {currentPlayerPoweredDown
                      ? 'Continue power down next turn'
                      : 'Power down next turn'}
                  </button>
                  <button type="button" onclick={() => respondPowerDown(false)} disabled={pending}>
                    {currentPlayerPoweredDown ? 'Power up next turn' : 'Stay active next turn'}
                  </button>
                </div>
              {:else}
                {@const pendingPowerPlayer = roomState.players.find(
                  ({ uid }) => uid === (roomState.pendingPowerDownUid ?? firstNextPowerUid)
                )}
                <span>
                  {pendingPowerPlayer
                    ? `Waiting for ${pendingPowerPlayer.name} in original Dock order`
                    : 'No power-down decision required'}
                </span>
              {/if}
              </div>
            {:else}
              <p class="power-control" data-power-down-disabled>
                Factory Rejects rule · power down unavailable
              </p>
            {/if}
            {#if programmingPlayer.submitted}
              <p class="submission-state">Program committed. It cannot be inspected or changed.</p>
            {:else}
              <p class="sr-only" id="register-order-help">
                Select cards in register order. On a selected card, use Shift plus Left or Right
                Arrow to reorder it, or Delete to remove it. Touch users can use the register
                ordering controls below.
              </p>
              <div class="program-hand" aria-label="Your Program hand">
                {#each programmingPlayer.hand as cardId}
                  {@const card = cardForId(cardId)}
                  {@const selectedIndex = selectedProgramCardIds.indexOf(cardId)}
                  <button
                    type="button"
                    class:selected={selectedIndex >= 0}
                    aria-pressed={selectedIndex >= 0}
                    aria-label={`${card?.action} priority ${card?.priority}`}
                    aria-describedby="register-order-help"
                    data-register-index={selectedIndex >= 0 ? selectedIndex + 1 : ''}
                    onclick={() => toggleProgramCard(cardId)}
                    onkeydown={(event) => handleProgramCardKeydown(event, cardId)}
                  >
                    <small>{selectedIndex >= 0 ? `R${selectedIndex + 1}` : card?.priority}</small>
                    <strong>{card?.action.replaceAll('-', ' ')}</strong>
                  </button>
                {/each}
              </div>
              <ol class="chosen-registers" aria-label="Chosen registers">
                {#each Array(5) as _, index}
                  {@const register = programmingPlayer.registers[index]}
                  {@const openIndex = programmingPlayer.registers
                    .slice(0, index)
                    .filter(({ locked }) => !locked).length}
                  {@const card = cardForId(
                    register.locked ? register.cardId : (selectedProgramCardIds[openIndex] ?? null)
                  )}
                  <li>
                    <span>R{index + 1}</span>
                    {card ? `${card.action} ${card.priority}${register.locked ? ' · locked' : ''}` : 'empty'}
                  </li>
                {/each}
              </ol>
              {#if selectedProgramCardIds.length > 0}
                <div class="register-order-controls" aria-label="Register ordering controls">
                  <label>
                    <span>Edit register</span>
                    <select bind:value={editingRegisterIndex} aria-label="Register to reorder">
                      {#each selectedProgramCardIds as cardId, index}
                        {@const selectedCard = cardForId(cardId)}
                        <option value={index}>
                          R{openRegisterSlots[index] + 1}: {selectedCard?.action} {selectedCard?.priority}
                        </option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label="Move selected register earlier"
                    title="Move selected register earlier"
                    onclick={() => moveSelectedProgramCard(editingRegisterIndex, -1)}
                    disabled={editingRegisterIndex === 0}
                  >←</button>
                  <button
                    type="button"
                    aria-label="Move selected register later"
                    title="Move selected register later"
                    onclick={() => moveSelectedProgramCard(editingRegisterIndex, 1)}
                    disabled={editingRegisterIndex >= selectedProgramCardIds.length - 1}
                  >→</button>
                  <button
                    type="button"
                    aria-label="Remove selected register card"
                    title="Remove selected register card"
                    onclick={() => removeSelectedProgramCard(editingRegisterIndex)}
                  >×</button>
                </div>
              {/if}
              <p class="preview-note">
                Preview excludes robots and unrevealed board outcomes.
                {programPreview.join(' · ')}
              </p>
              <button
                type="button"
                onclick={submitProgramCards}
                disabled={pending || selectedProgramCardIds.length !== openRegisterCount}
              >Submit immutable program</button>
              {#if selectedProgramCardIds.length > 0}
                <button
                  type="button"
                  class="clear-program"
                  onclick={() => {
                    selectedProgramCardIds = [];
                    editingRegisterIndex = 0;
                    programDraftDirty = true;
                    void persistProgramDraft();
                  }}
                >Clear register choices</button>
              {/if}
            {/if}

            <ul class="opponent-programs" aria-label="Program submission status">
              {#each activeProgramming.players as player}
                {#if player.uid !== currentPlayer.uid}
                  {@const roomPlayer = roomState.players.find(({ uid }) => uid === player.uid)}
                  <li>
                    <strong>{roomPlayer?.name}</strong>
                    {#if activeProgramming.phase === 'programmed'}
                      <span>
                        {player.registers.map(({ cardId }) => cardForId(cardId)?.priority).join(' · ')}
                      </span>
                    {:else if player.submitted}
                      <span aria-label="Five face-down registers">▰ ▰ ▰ ▰ ▰</span>
                    {:else}
                      <span>programming</span>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
            {#if roomState.pendingOptionUid}
              <section class="option-plan" aria-label="Ordered Option decision window">
                {#if roomState.pendingOptionUid === currentPlayer.uid && optionPlanRobot}
                  <strong>Commit Option choices in original Dock order</strong>
                  <p>
                    Select cards in the order they should be discarded to prevent one damage each.
                    Unselected cards are retained.
                  </p>
                  <div>
                    {#each optionPlanRobot.options as option}
                      <button
                        type="button"
                        class:selected={selectedOptionPreventionIds.includes(option.cardId)}
                        aria-pressed={selectedOptionPreventionIds.includes(option.cardId)}
                        onclick={() => toggleOptionPrevention(option.cardId)}
                      >
                        {OPTION_CARDS_BY_ID.get(option.cardId)?.name ?? option.cardId}
                      </button>
                    {/each}
                  </div>
                  <button type="button" disabled={pending} onclick={submitOptionPlan}>
                    Commit finite Option plan
                  </button>
                {:else}
                  {@const pendingOptionPlayer = roomState.players.find(
                    ({ uid }) => uid === roomState.pendingOptionUid
                  )}
                  <span>Waiting for {pendingOptionPlayer?.name} in original Dock order</span>
                {/if}
              </section>
            {/if}
            {#if activeProgramming.deadlinePlayerUid}
              {@const timedPlayer = roomState.players.find(({ uid }) => uid === activeProgramming.deadlinePlayerUid)}
              <div class="deadline" role="timer">
                <span>{timedPlayer?.name} has {deadlineSeconds} seconds</span>
                <button type="button" onclick={claimTimeout} disabled={deadlineSeconds !== 0 || pending}>
                  Fill timed-out program
                </button>
              </div>
            {/if}
            {#if roomState.resolution}
              <section class="resolution-console" aria-labelledby="resolution-heading">
                <h2 id="resolution-heading">
                  Turn {roomState.resolution.turnNumber}
                  {playbackPhase === 'countdown'
                    ? 'programs locked'
                    : playbackPhase === 'register'
                      ? `register ${playbackRegister} · ${playbackStageLabel}`
                      : roomState.resolution.phase === 'turn-complete'
                        ? 'complete'
                        : roomState.resolution.phase === 'race-finished'
                          ? 'finished'
                          : 'awaiting re-entry'}
                  · {visibleResolutionTrace.length} microsteps
                </h2>
                <ul class="robot-state" aria-label="Robot Life and damage state">
                  {#each presentedResolutionRobots ?? [] as robot}
                    <li>
                      <strong>{robot.name}</strong>
                      <span class="robot-vitals">
                        {robot.status} · {robot.lives} Lives · {robot.damage} Damage
                        {robot.poweredDown
                          ? ' · Powered down'
                          : robot.powerDownNextTurn
                            ? ' · Shutdown announced'
                            : ''}
                        {robot.lockedRegisters.length
                          ? ` · Locked ${robot.lockedRegisters.map(({ register }) => `R${register}`).join('/')}`
                          : ''}
                      </span>
                      <span class="robot-progress">
                        Flags {robot.touchedFlags.length ? robot.touchedFlags.join('→') : 'none'} ·
                        Archive ({robot.archive.x},{robot.archive.y})
                      </span>
                      {#if robot.options.length > 0}
                        <span class="robot-options-owned">
                          Options {robot.options
                            .map(({ cardId }) => OPTION_CARDS_BY_ID.get(cardId)?.name ?? cardId)
                            .join(' · ')}
                        </span>
                      {/if}
                    </li>
                  {/each}
                </ul>
                <p class="reentry-policy">
                  Shared archive safety: later destructions choose an empty adjacent cell and a
                  facing with no robot in line of sight within three spaces.
                </p>
                <p class="board-phase">
                  Board phase: express conveyors → all conveyors → register pushers → gears →
                  one laser snapshot.
                  {roomState.configuration?.courseId === 'risky-exchange'
                    ? 'Exchange prints no pushers; fixtures cover that stage.'
                    : 'The configured board manifest supplies every active element.'}
                  Damage 9 repeats all five locked registers.
                </p>
                {#if !playbackIsActive && optionLossRobot}
                  {#if optionLossRobot.uid === currentPlayer?.uid}
                    <div class="option-loss-choice" aria-label="Destroyed robot Option loss">
                      <strong>Discard one Option before re-entry</strong>
                      {#each optionLossRobot.options as option}
                        <button
                          type="button"
                          disabled={pending}
                          onclick={() => discardDestroyedOption(option.cardId)}
                        >
                          Discard {OPTION_CARDS_BY_ID.get(option.cardId)?.name ?? option.cardId}
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="reentry-wait">
                      Waiting for {optionLossRobot.name} to discard one Option in destruction order.
                    </p>
                  {/if}
                {/if}
                {#if !playbackIsActive && reentryChoices.length > 0}
                  <div class="reentry-choice">
                    <label>
                      Re-entry cell and facing
                      <select
                        bind:value={selectedReentryChoice}
                        aria-label="Re-entry cell and facing"
                        onchange={persistReentryDraft}
                      >
                        <option value="">Choose a legal placement</option>
                        {#each reentryChoices as choice}
                          <option value={`${choice.x},${choice.y},${choice.facing}`}>
                            ({choice.x},{choice.y}) facing {choice.facing}
                          </option>
                        {/each}
                      </select>
                    </label>
                    {#if reentryRobot?.powerDownNextTurn}
                      <label class="reentry-power">
                        <input
                          type="checkbox"
                          bind:checked={reentryPoweredDown}
                          onchange={persistReentryDraft}
                        />
                        Re-enter powered down
                      </label>
                    {/if}
                    <button
                      type="button"
                      onclick={submitReentryChoice}
                      disabled={pending || !selectedReentryChoice}
                    >Confirm re-entry</button>
                  </div>
                {:else if !playbackIsActive && roomState.resolution.nextReentryUid}
                  {@const nextReentryPlayer = roomState.players.find(({ uid }) => uid === roomState.resolution?.nextReentryUid)}
                  <p class="reentry-wait">Waiting for {nextReentryPlayer?.name} to choose re-entry.</p>
                {/if}
                {#if !playbackIsActive && roomState.nextProgramming && requestedTurnNumber < roomState.nextProgramming.turnNumber}
                  <button
                    type="button"
                    onclick={() => {
                      requestedTurnNumber = roomState.nextProgramming?.turnNumber ?? requestedTurnNumber;
                      const nextDraft = roomState.nextProgramming?.players.find(
                        ({ uid }) => uid === currentPlayer.uid
                      )?.draftCardIds ?? [];
                      selectedProgramCardIds = [...nextDraft];
                      programDraftDirty = false;
                      editingRegisterIndex = 0;
                    }}
                  >
                    Begin Turn {roomState.nextProgramming.turnNumber}
                  </button>
                {/if}
                {#if !playbackIsActive && roomState.resolution.summary}
                  {@const winner = roomState.players.find(
                    ({ uid }) => uid === roomState.resolution?.summary?.winnerUid
                  )}
                  <section class="race-summary" aria-label="Immutable race summary">
                    <strong>{winner?.name} wins {configuredCourse?.name ?? 'the race'}</strong>
                    <span>
                      Epoch {roomState.raceEpoch} ·
                      {roomState.resolution.summary.standings.length} final standings retained
                    </span>
                    {#if isHost}
                      <button type="button" onclick={rematchRace} disabled={pending}>
                        Start rematch epoch {roomState.raceEpoch + 1}
                      </button>
                    {/if}
                  </section>
                {/if}
                <ol aria-label="Resolution feed" aria-live="polite">
                  {#each visibleResolutionTrace.slice(-5) as entry, index}
                    <li style={`--trace-index:${index}`}>
                      <span>{entry.register <= 5 ? `R${entry.register}` : 'CLEANUP'} · {entry.priority ?? 'SYS'}</span>
                      {entry.text}
                    </li>
                  {/each}
                </ol>
                <details class="full-resolution">
                  <summary>Full resolution text</summary>
                  <ol aria-label="Full resolution feed">
                    {#each visibleResolutionTrace as entry}
                      <li><span>{entry.register <= 5 ? `R${entry.register}` : 'CLEANUP'} · {entry.priority ?? 'SYS'}</span>{entry.text}</li>
                    {/each}
                  </ol>
                </details>
              </section>
            {/if}
          </section>
        {/if}
        {#if showProgramming}
          <p class="archive-note">Archives remain on the original Dock cells. Trusted-client secrecy masks, but cannot cryptographically hide, readable events.</p>
        {:else}
          <p class="archive-note">
            Every robot’s archive begins on its Dock cell.
            {#if roomState.setup.startingDamage > 0}
              Factory Rejects begins each robot at {roomState.setup.startingDamage} damage.
            {:else}
              Option cards remain disabled until their complete 2005 manifest is reviewed.
            {/if}
            {#if !roomState.setup.powerDownAllowed} Power down is unavailable for this race.{/if}
          </p>
          <button class="open-programming" type="button" onclick={openProgrammingConsole}>
            Open programming console
          </button>
        {/if}
      </aside>
    </section>
  {:else if mode === 'room' && currentPlayer}
    <section class="lobby" aria-labelledby="room-heading">
      <div class="room-console">
        <p class="eyebrow"><span>02</span> IMMUTABLE RACE CONTROL</p>
        <h1 id="room-heading">Room<br /><em>{roomCode}</em></h1>
        <p class="lede">
          Every seat is rebuilt from one ordered, append-only event stream. Share the invite;
          reloads replay the same room.
        </p>
        <div class="room-actions">
          <button type="button" onclick={copyInvite}>{copied ? 'Invite copied' : 'Copy invite link'}</button>
          <a class="text-link" href={inviteUrl()}>Open join link</a>
        </div>
        <dl class="room-facts">
          <div><dt>{roomState.players.length}/{MAX_ROOM_PLAYERS}</dt><dd>seats claimed</dd></div>
          <div><dt>{roomState.acceptedEventIds.length}</dt><dd>immutable events</dd></div>
          <div><dt>{roomState.diagnostics.length}</dt><dd>replay diagnostics</dd></div>
        </dl>
        <p class="identity">Identity <strong>{identityLabel}</strong> · Seat {currentPlayer.seat}</p>
        <CourseCatalog />
        {#if roomState.players.length >= 2}
          <div class="race-config" aria-label="Race configuration">
            {#if isHost}
              <label>
                Course
                <select bind:value={selectedCourseId} aria-label="Course">
                  {#each PLAYABLE_COURSE_IDS as courseId}
                    {@const course = PUBLISHED_COURSES_BY_ID.get(courseId)!}
                    <option value={courseId} disabled={!course.players.includes(roomState.players.length)}>
                      {course.name} ({course.players[0]}–{course.players.at(-1)} players)
                    </option>
                  {/each}
                </select>
              </label>
              <label>
                Setup seed
                <input bind:value={setupSeed} maxlength="64" aria-label="Setup seed" />
              </label>
              <label>
                Lives
                <select bind:value={setupLives} aria-label="Starting Lives">
                  <option value={3}>3 Lives</option>
                  <option value={4} disabled={roomState.players.length < 5}>4 Lives (5+ players)</option>
                </select>
              </label>
              <button
                type="button"
                onclick={configureCourse}
                disabled={pending || !selectedCourseSupportsRoom}
              >
                {roomState.configuration ? 'Replace configuration' : `Configure ${selectedCourse.name}`}
              </button>
            {:else if !roomState.configuration}
              <p>Host is choosing a reviewed course.</p>
            {/if}
            {#if roomState.configuration}
              <p class="configuration-lock">
                {configuredCourse?.name} · seed {roomState.configuration.seed} ·
                {roomState.configuration.lives} Lives ·
                {configuredCourse?.specialRules.length
                  ? configuredCourse.specialRules.map(({ kind }) => kind.replaceAll('-', ' ')).join(' · ')
                  : 'standard rules'}
              </p>
              <button type="button" onclick={becomeReady} disabled={pending || currentPlayerReady}>
                {currentPlayerReady ? 'Ready event written' : 'Ready for race'}
              </button>
            {/if}
          </div>
        {/if}
        {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
      </div>

      <div class="seat-console">
        <div class="telemetry-head">
          <span>SEATING / ORIGINAL DOCK ORDER</span>
          <span class="live"><i></i> REPLAY CLEAN</span>
        </div>
        <ol class="seats" aria-label="Race room players">
          {#each Array(MAX_ROOM_PLAYERS) as _, index}
            {@const player = roomState.players[index]}
            <li class:claimed={!!player}>
              <span class="seat-number">{String(index + 1).padStart(2, '0')}</span>
              {#if player}
                {@const robot = ROBOTS.find((option) => option.id === player.robotId)}
                <span class="robot-token" aria-hidden="true">{robot?.mark}</span>
                <span class="seat-name">
                  <strong>{player.name}</strong>
                  <small>{robot?.name} {player.uid === roomState.hostUid ? '· host' : ''}</small>
                </span>
                <span class="seat-state">
                  {roomState.readyPlayerUids.includes(player.uid) ? 'ready' : 'linked'}
                </span>
              {:else}
                <span class="robot-token empty" aria-hidden="true">--</span>
                <span class="seat-name"><strong>Open dock</strong><small>Waiting for racer</small></span>
                <span class="seat-state">open</span>
              {/if}
            </li>
          {/each}
        </ol>
        <p class="room-ready" class:full={roomState.readyPlayerUids.length === roomState.players.length && roomState.players.length >= 2}>
          {#if roomState.configuration}
            {roomState.readyPlayerUids.length}/{roomState.players.length} racers ready for the immutable setup barrier.
          {:else if roomState.players.length >= 2}
            Host may configure a reviewed playable course.
          {:else}
            Waiting for at least two racers.
          {/if}
        </p>
      </div>
    </section>
  {:else}
    <section class="hero">
      <div class="copy">
        <p class="eyebrow"><span>01</span> CLASSIC FACTORY CONTROL</p>
        <h1>Program.<br /><em>Collide.</em><br />Survive.</h1>
        <p class="lede">
          Secretly load five registers. Watch every robot execute. Reach the flags while the
          factory—and your rivals—rewrite the route.
        </p>

        {#if mode === 'landing'}
          <div class="actions" aria-label="Race actions">
            <button type="button" onclick={showCreate} disabled={!services}>Create race</button>
            <button type="button" class="secondary" onclick={showJoin} disabled={!services}>Join with code</button>
            <p>Identity {identityLabel}. Rooms replay from immutable events.</p>
          </div>
        {:else}
          <form
            class="join-panel"
            aria-label={mode === 'create' ? 'Create race' : 'Join race'}
            onsubmit={(event) => {
              event.preventDefault();
              if (mode === 'join' && !roomCode) findRoom();
              else submitSeat();
            }}
          >
            <div class="form-head">
              <strong>{mode === 'create' ? 'Create race room' : roomCode ? `Join room ${roomCode}` : 'Find race room'}</strong>
              <button type="button" class="close" aria-label="Return to home" onclick={() => (mode = 'landing')}>×</button>
            </div>

            {#if mode === 'join' && !roomCode}
              <label>
                Room code
                <input
                  name="roomCode"
                  bind:value={joinCode}
                  maxlength="6"
                  autocomplete="off"
                  placeholder="ABC234"
                />
              </label>
              <button type="submit">Find room</button>
            {:else if mode === 'join' && !roomState.gameId}
              <p class="stream-note">Replaying room {roomCode}…</p>
            {:else}
              <label>
                Racer name
                <input
                  name="playerName"
                  bind:value={playerName}
                  maxlength="24"
                  autocomplete="nickname"
                  placeholder="Your name"
                />
              </label>
              <fieldset>
                <legend>Choose an available robot</legend>
                <div class="robot-options">
                  {#each ROBOTS as robot}
                    <button
                      type="button"
                      class:selected={selectedRobot === robot.id}
                      aria-pressed={selectedRobot === robot.id}
                      disabled={unavailableRobots.has(robot.id)}
                      onclick={() => (selectedRobot = robot.id)}
                    >
                      <span>{robot.mark}</span>{robot.name}
                    </button>
                  {/each}
                </div>
              </fieldset>
              {#if roomIsFull}
                <p class="form-error" role="alert">Room full — all eight robot docks are claimed.</p>
              {/if}
              <button type="submit" disabled={!canSubmit}>
                {pending ? 'Writing event…' : mode === 'create' ? 'Create and claim seat' : 'Claim seat'}
              </button>
            {/if}
            {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
          </form>
        {/if}

        <dl class="facts">
          <div><dt>2–8</dt><dd>robots</dd></div>
          <div><dt>84</dt><dd>program cards</dd></div>
          <div><dt>5</dt><dd>registers</dd></div>
          <div><dt>34</dt><dd>courses</dd></div>
        </dl>
      </div>

      <div class="telemetry" role="img" aria-label="Factory course and five programmed registers">
        <div class="telemetry-head">
          <span>EXCHANGE / PRE-RACE</span>
          <span class="live"><i></i> LINKED</span>
        </div>

        <div class="factory">
          <div class="grid-lines"></div>
          <span class="conveyor belt-a">▶ ▶ ▶</span>
          <span class="conveyor belt-b">▲ ▲ ▲</span>
          <span class="pit pit-a"></span>
          <span class="pit pit-b"></span>
          <span class="flag">1</span>
          <span class="robot" aria-hidden="true">
            <i class="antenna"></i><i class="eye left"></i><i class="eye right"></i>
          </span>
          <span class="route route-a"></span>
          <span class="route route-b"></span>
          <span class="coordinate">X:04 / Y:09 / N</span>
        </div>

        <ol class="registers" aria-label="Example register program">
          {#each cards as card, index}
            <li>
              <span class="register-number">R{index + 1}</span>
              <strong>{card.mark}</strong>
              <span>{card.label}</span>
              <small>{card.priority}</small>
            </li>
          {/each}
        </ol>
      </div>
    </section>
  {/if}

  <footer>
    <span>Deterministic multiplayer / Avalon Hill 2005 rules target</span>
    <span data-testid="build-marker">Build {buildHash}</span>
    <span>GPL-3.0-only</span>
  </footer>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { height: 100%; background: #0b0f10; }
  :global(body) {
    min-width: 320px;
    height: 100%;
    margin: 0;
    overflow: hidden;
    color: #e9eee9;
    background:
      radial-gradient(circle at 78% 20%, rgba(210, 255, 55, 0.08), transparent 25%),
      linear-gradient(135deg, #12191b 0%, #090c0d 64%);
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }
  :global(button), :global(input), :global(select) { font: inherit; }
  :global(:focus-visible) {
    outline: 3px solid #ffcf4b;
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .program-countdown {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-content: center;
    place-items: center;
    gap: 8px;
    pointer-events: none;
    color: #eef4ee;
    background:
      radial-gradient(circle, rgba(210, 255, 55, 0.16), transparent 38%),
      rgba(4, 8, 9, 0.88);
    text-align: center;
  }
  .program-countdown small,
  .program-countdown span {
    font: 700 clamp(20px, 3vw, 32px) 'Space Mono', monospace;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .program-countdown small { color: #ffcf4b; }
  .program-countdown span { color: #aebbb9; }
  .program-countdown strong {
    color: #d2ff37;
    font: 700 clamp(240px, 60vmin, 560px)/0.82 'Space Mono', monospace;
    text-shadow: 0 0 42px rgba(210, 255, 55, 0.28);
    animation: countdown-pulse 900ms ease-out both;
  }
  .register-playback {
    position: fixed;
    z-index: 90;
    top: max(76px, calc(env(safe-area-inset-top) + 68px));
    left: 50%;
    display: grid;
    width: min(520px, calc(100vw - 32px));
    gap: 3px;
    padding: 9px 12px;
    pointer-events: none;
    border: 1px solid #d2ff37;
    color: #eef4ee;
    background: rgba(8, 14, 15, 0.94);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.48);
    font-family: 'Space Mono', monospace;
    transform: translateX(-50%);
  }
  .register-playback strong {
    color: #d2ff37;
    font-size: 26px;
    letter-spacing: 0.16em;
  }
  .register-playback span {
    overflow: hidden;
    color: #aebbb9;
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .register-playback i {
    width: 100%;
    height: 2px;
    margin-top: 3px;
    background: linear-gradient(
      90deg,
      #d2ff37 0 calc(var(--playback-progress) * 100%),
      #344043 calc(var(--playback-progress) * 100%) 100%
    );
  }
  @keyframes countdown-pulse {
    from { opacity: 0; transform: scale(1.28); }
    to { opacity: 1; transform: scale(1); }
  }

  .shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 68px minmax(0, 1fr) 46px;
    width: min(100%, 1228px);
    height: 100dvh;
    margin: 0 auto;
    overflow: hidden;
    padding:
      env(safe-area-inset-top)
      max(24px, env(safe-area-inset-right))
      env(safe-area-inset-bottom)
      max(24px, env(safe-area-inset-left));
  }

  .masthead, footer {
    display: flex;
    min-width: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
  }
  .masthead { border-bottom: 1px solid #344043; }
  .brand {
    display: flex;
    flex: none;
    gap: 12px;
    align-items: center;
    color: #eef4ee;
    font-family: 'Space Mono', monospace;
    font-size: 32px;
    letter-spacing: 0.12em;
    text-decoration: none;
    white-space: nowrap;
  }
  .brand strong { color: #d2ff37; }
  .brand small {
    margin-left: 6px;
    padding: 2px 5px;
    border: 1px solid #5a696c;
    color: #9caaac;
    font-size: 16px;
    letter-spacing: 0.08em;
    vertical-align: 2px;
  }
  .brand-mark {
    display: grid;
    grid-template-columns: repeat(3, 6px);
    gap: 3px;
    padding: 9px;
    border: 1px solid #566265;
    transform: rotate(45deg);
  }
  .brand-mark i { width: 6px; height: 6px; background: #d2ff37; }
  .brand-mark i:nth-child(2) { opacity: 0.45; }

  .network {
    display: flex;
    min-width: 0;
    gap: 8px;
    align-items: center;
    color: #8e9a9c;
    font-family: 'Space Mono', monospace;
    font-size: 20px;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .network span:last-child { min-width: 0; overflow-wrap: anywhere; }
  .signal {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffb84d;
    box-shadow: 0 0 9px rgba(255, 184, 77, 0.55);
  }
  .signal.online { background: #d2ff37; box-shadow: 0 0 10px rgba(210, 255, 55, 0.6); }
  .network button {
    min-height: 24px;
    padding: 0 7px;
    border: 1px solid #ffb84d;
    color: #ffcf75;
    background: #151b1c;
    font: 700 16px 'Space Mono', monospace;
    text-transform: uppercase;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(360px, 0.82fr) minmax(500px, 1.18fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: start;
    min-height: 0;
    overflow: auto;
    padding: 32px 0;
  }
  .eyebrow {
    margin: 0 0 18px;
    color: #899597;
    font-family: 'Space Mono', monospace;
    font-size: 20px;
    letter-spacing: 0.13em;
  }
  .eyebrow span { margin-right: 9px; color: #d2ff37; }
  h1 {
    margin: 0;
    color: #f1f5f0;
    font-family: 'Space Mono', monospace;
    font-size: clamp(96px, 10.6vw, 152px);
    line-height: 0.91;
    letter-spacing: -0.075em;
    text-transform: uppercase;
  }
  h1 em { color: transparent; font-style: normal; -webkit-text-stroke: 1px #aebbba; }
  .lede {
    max-width: 470px;
    margin: 22px 0 0;
    color: #a9b4b2;
    font-size: 32px;
    line-height: 1.25;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: center;
    margin-top: 24px;
  }
  button {
    min-height: 44px;
    padding: 0 19px;
    border: 1px solid #d2ff37;
    color: #101510;
    background: #d2ff37;
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  button.secondary { color: #a5b0ae; border-color: #4e5a5c; background: transparent; }
  button:disabled { cursor: not-allowed; opacity: 0.54; }
  .actions p { display: none; }
  .facts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 28px 0 0;
    border-top: 1px solid #344043;
    border-bottom: 1px solid #344043;
  }
  .facts div { padding: 12px 8px 12px 0; }
  .facts dt {
    color: #d2ff37;
    font-family: 'Space Mono', monospace;
    font-size: 36px;
    font-weight: 700;
  }
  .facts dd { margin: 2px 0 0; color: #718083; font-size: 20px; text-transform: uppercase; }

  .telemetry {
    position: relative;
    padding: 14px;
    border: 1px solid #435052;
    background: rgba(16, 23, 25, 0.88);
    box-shadow: 20px 24px 0 rgba(0, 0, 0, 0.18);
  }
  .telemetry::before, .telemetry::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: #d2ff37;
  }
  .telemetry::before { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
  .telemetry::after { right: -1px; bottom: -1px; border-right: 2px solid; border-bottom: 2px solid; }
  .telemetry-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    color: #829093;
    font-family: 'Space Mono', monospace;
    font-size: 18px;
    letter-spacing: 0.08em;
  }
  .live { color: #d2ff37; }
  .live i { display: inline-block; width: 5px; height: 5px; margin-right: 5px; background: #d2ff37; }
  .factory {
    position: relative;
    height: min(32vh, 310px);
    min-height: 220px;
    overflow: hidden;
    border: 1px solid #354245;
    background:
      linear-gradient(45deg, rgba(255,255,255,.025) 25%, transparent 25% 75%, rgba(255,255,255,.025) 75%),
      #182123;
    background-size: 28px 28px;
  }
  .grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(110, 130, 133, 0.14) 1px, transparent 1px),
      linear-gradient(90deg, rgba(110, 130, 133, 0.14) 1px, transparent 1px);
    background-size: 42px 42px;
  }
  .conveyor {
    position: absolute;
    padding: 5px 8px;
    overflow: hidden;
    color: #7dffea;
    border: 1px solid #337c76;
    background: repeating-linear-gradient(90deg, #173c3b 0 15px, #102928 15px 30px);
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    letter-spacing: 7px;
    white-space: nowrap;
  }
  .belt-a { top: 28%; right: 8%; width: 48%; }
  .belt-b { bottom: 12%; left: 19%; width: 34%; transform: rotate(-90deg); transform-origin: left center; }
  .pit { position: absolute; width: 42px; height: 42px; background: #050708; box-shadow: inset 0 0 0 5px #242e30; }
  .pit-a { top: 12%; left: 14%; }
  .pit-b { right: 20%; bottom: 12%; }
  .flag {
    position: absolute;
    top: 13%;
    right: 12%;
    display: grid;
    width: 35px;
    height: 35px;
    place-items: center;
    border-radius: 50%;
    color: #111;
    background: #ffcf4b;
    box-shadow: 0 0 0 5px rgba(255, 207, 75, 0.15);
    font: 700 30px 'Space Mono', monospace;
  }
  .robot {
    position: absolute;
    bottom: 22%;
    left: 42%;
    width: 54px;
    height: 48px;
    border: 4px solid #101617;
    border-radius: 8px 8px 13px 13px;
    background: #d2ff37;
    box-shadow: 0 0 0 2px #839d2b, 0 8px 20px rgba(210, 255, 55, 0.18);
  }
  .robot::before, .robot::after {
    content: '';
    position: absolute;
    top: 10px;
    width: 8px;
    height: 25px;
    background: #647328;
  }
  .robot::before { left: -10px; }
  .robot::after { right: -10px; }
  .antenna { position: absolute; left: 21px; top: -18px; width: 5px; height: 16px; background: #d2ff37; }
  .eye { position: absolute; top: 12px; width: 8px; height: 6px; background: #111; }
  .eye.left { left: 11px; }
  .eye.right { right: 11px; }
  .route { position: absolute; height: 2px; background: #d2ff37; opacity: 0.55; }
  .route-a { left: 10%; bottom: 28%; width: 29%; }
  .route-b { left: 52%; bottom: 40%; width: 30%; transform: rotate(-32deg); transform-origin: left; }
  .coordinate {
    position: absolute;
    right: 8px;
    bottom: 6px;
    color: #687679;
    font: 16px 'Space Mono', monospace;
  }
  .registers {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 7px;
    margin: 9px 0 0;
    padding: 0;
    list-style: none;
  }
  .registers li {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 96px;
    grid-template-rows: auto 1fr auto;
    padding: 8px;
    border: 1px solid #3b484b;
    color: #a4b0ae;
    background: #111719;
    text-align: center;
  }
  .registers li:first-child { border-color: #7e982b; background: #182014; }
  .register-number { color: #657275; font: 16px 'Space Mono', monospace; text-align: left; }
  .registers strong {
    align-self: center;
    color: #d2ff37;
    font: 700 48px 'Space Mono', monospace;
  }
  .registers li > span:nth-of-type(2) {
    overflow: hidden;
    font-size: 18px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .registers small { position: absolute; top: 7px; right: 7px; color: #f2d372; font: 16px 'Space Mono', monospace; }

  .join-panel {
    display: grid;
    gap: 12px;
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #465356;
    background: rgba(13, 19, 20, 0.94);
  }
  .form-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #d2ff37;
    font: 700 22px 'Space Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  button.close {
    width: 30px;
    min-height: 30px;
    padding: 0;
    border-color: #465356;
    color: #9da9a8;
    background: transparent;
    font-size: 40px;
  }
  .join-panel label, .join-panel legend {
    color: #899597;
    font: 18px 'Space Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .join-panel label { display: grid; gap: 6px; }
  .join-panel input {
    width: 100%;
    min-height: 40px;
    padding: 0 11px;
    border: 1px solid #465356;
    border-radius: 0;
    color: #edf3ed;
    outline: none;
    background: #101718;
    font: 700 28px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .join-panel input:focus { border-color: #d2ff37; box-shadow: 0 0 0 1px #d2ff37; }
  .join-panel fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .join-panel legend { margin-bottom: 7px; }
  .robot-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .robot-options button {
    display: grid;
    min-width: 0;
    min-height: 47px;
    grid-template-columns: auto 1fr;
    gap: 5px;
    align-items: center;
    padding: 5px 6px;
    border-color: #465356;
    color: #899597;
    background: #111819;
    font-size: 16px;
    text-align: left;
  }
  .robot-options button span { color: #d2ff37; font-size: 18px; }
  .robot-options button.selected {
    border-color: #d2ff37;
    color: #edf3ed;
    background: #1a2418;
  }
  .stream-note, .form-error {
    margin: 0;
    color: #93a09f;
    font-size: 22px;
  }
  .form-error { color: #ffbf69; }

  .lobby {
    display: grid;
    grid-template-columns: minmax(310px, 0.72fr) minmax(520px, 1.28fr);
    gap: clamp(32px, 6vw, 84px);
    align-items: start;
    min-height: 0;
    overflow: auto;
    padding: 32px 0;
  }
  .room-console h1 { font-size: clamp(96px, 10vw, 140px); }
  .room-console h1 em {
    color: #d2ff37;
    font-size: 0.8em;
    letter-spacing: 0.04em;
    -webkit-text-stroke: 0;
  }
  .room-actions { display: flex; gap: 14px; align-items: center; margin-top: 23px; }
  .text-link {
    color: #a9b4b2;
    font: 18px 'Space Mono', monospace;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .room-facts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 24px 0 0;
    border-top: 1px solid #344043;
    border-bottom: 1px solid #344043;
  }
  .room-facts div { padding: 12px 8px 12px 0; }
  .room-facts dt { color: #d2ff37; font: 700 36px 'Space Mono', monospace; }
  .room-facts dd {
    margin: 3px 0 0;
    color: #718083;
    font-size: 16px;
    text-transform: uppercase;
  }
  .identity {
    margin: 13px 0 0;
    color: #718083;
    font: 16px 'Space Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .identity strong { color: #edf3ed; }
  .seat-console {
    position: relative;
    padding: 15px;
    border: 1px solid #435052;
    background: rgba(16, 23, 25, 0.92);
    box-shadow: 20px 24px 0 rgba(0, 0, 0, 0.18);
  }
  .seat-console::before, .seat-console::after {
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: #d2ff37;
    content: '';
  }
  .seat-console::before { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
  .seat-console::after { right: -1px; bottom: -1px; border-right: 2px solid; border-bottom: 2px solid; }
  .seats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .seats li {
    display: grid;
    min-width: 0;
    min-height: 66px;
    grid-template-columns: 25px 42px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border: 1px solid #303b3e;
    color: #687578;
    background: #0d1213;
  }
  .seats li.claimed { border-color: #4c5a46; color: #aeb8b6; background: #121a17; }
  .seat-number { color: #5f6d70; font: 16px 'Space Mono', monospace; }
  .robot-token {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 1px solid #839d2b;
    color: #101510;
    background: #d2ff37;
    font: 700 20px 'Space Mono', monospace;
  }
  .robot-token.empty { border-color: #303b3e; color: #4f5b5e; background: transparent; }
  .seat-name { display: grid; min-width: 0; gap: 3px; }
  .seat-name strong {
    overflow: hidden;
    color: #e7ede8;
    font-size: 24px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seat-name small { color: #718083; font: 14px 'Space Mono', monospace; text-transform: uppercase; }
  .seat-state { color: #637174; font: 14px 'Space Mono', monospace; text-transform: uppercase; }
  .claimed .seat-state { color: #d2ff37; }
  .room-ready {
    margin: 10px 0 0;
    padding: 9px 10px;
    border: 1px solid #354245;
    color: #829093;
    background: #101617;
    font: 16px 'Space Mono', monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .room-ready.full { border-color: #72892c; color: #d2ff37; }
  .race-config {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid #3d494b;
    background: #0e1415;
  }
  .race-config label {
    display: grid;
    gap: 4px;
    color: #819093;
    font: 16px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .race-config input, .race-config select {
    min-width: 0;
    height: 34px;
    padding: 0 7px;
    border: 1px solid #465356;
    border-radius: 0;
    color: #edf3ed;
    background: #101718;
    font: 18px 'Space Mono', monospace;
  }
  .race-config button, .race-config p { grid-column: 1 / -1; }
  .race-config p {
    margin: 0;
    color: #839194;
    font: 16px/1.4 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .race-config .configuration-lock { color: #d2ff37; }
  .configured-race {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(320px, .7fr) minmax(600px, 1.3fr);
    gap: clamp(20px, 4vw, 54px);
    overflow: hidden;
    padding: 20px 0;
  }
  .setup-summary {
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .setup-summary h1 { font-size: clamp(84px, 9.2vw, 128px); }
  .setup-summary h1 em { color: #d2ff37; -webkit-text-stroke: 0; }
  .setup-summary .lede strong { color: #eef4ee; font-family: 'Space Mono', monospace; }
  .your-robot {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    align-items: baseline;
    margin-top: 12px;
    padding: 8px 10px;
    border: 2px solid #d2ff37;
    color: #101510;
    background: #d2ff37;
    box-shadow: 6px 6px 0 rgba(210, 255, 55, .2);
  }
  .your-robot span { grid-column: 1 / -1; font: 700 13px 'Space Mono', monospace; letter-spacing: .12em; }
  .your-robot strong { font: 700 27px 'Space Mono', monospace; text-transform: uppercase; }
  .your-robot small { font: 700 13px 'Space Mono', monospace; text-transform: uppercase; }
  .setup-summary.resolution-active .setup-order.compact { display: none; }
  .setup-summary.next-turn-programming .lede,
  .setup-summary.next-turn-programming .setup-facts,
  .setup-summary.next-turn-programming .reentry-policy,
  .setup-summary.next-turn-programming .board-phase {
    display: none;
  }
  .epoch-state {
    margin: 5px 0 0;
    color: #718083;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .reconnect-state {
    position: relative;
    margin: 5px 0 0;
    padding: 5px 48px 5px 7px;
    border-left: 2px solid #d2ff37;
    color: #a9b6b3;
    background: #17201a;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .reconnect-state button {
    position: absolute;
    top: 3px;
    right: 3px;
    bottom: 3px;
    min-height: 0;
    padding: 0 4px;
    border-color: #8b9d53;
    font-size: 12px;
  }
  .setup-facts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 17px 0 0;
    border-top: 1px solid #344043;
    border-bottom: 1px solid #344043;
  }
  .setup-facts div { padding: 9px 4px; }
  .setup-facts dt { color: #d2ff37; font: 700 32px 'Space Mono', monospace; }
  .setup-facts dd { margin: 2px 0 0; color: #718083; font-size: 16px; text-transform: uppercase; }
  .setup-order {
    display: grid;
    gap: 4px;
    max-height: 210px;
    margin: 12px 0 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }
  .setup-order li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 3px 7px;
    padding: 7px;
    border: 1px solid #354245;
    background: #101617;
  }
  .setup-order li > span { grid-row: 1 / 3; color: #d2ff37; font: 700 20px 'Space Mono', monospace; }
  .setup-order strong { color: #e7ede8; font-size: 22px; }
  .setup-order small { grid-column: 2 / 4; color: #778487; font: 14px 'Space Mono', monospace; text-transform: uppercase; }
  .setup-order em { color: #ffcf4b; font: 14px 'Space Mono', monospace; font-style: normal; text-transform: uppercase; }
  .archive-note {
    margin: 10px 0 0;
    color: #778487;
    font-size: 20px;
    line-height: 1.4;
  }
  .setup-order.compact { max-height: 105px; }
  .setup-order.compact li { padding: 5px 7px; }
  .program-console {
    position: relative;
    display: grid;
    gap: 6px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid #344043;
  }
  .setup-summary:has(.program-console) .lede,
  .setup-summary:has(.program-console) .setup-facts,
  .setup-summary:has(.program-console) > .archive-note {
    display: none;
  }
  .setup-summary:has(.program-console) > .eyebrow,
  .setup-summary:has(.program-console) > h1 {
    display: none;
  }
  .program-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .program-head h2 {
    margin: 0;
    color: #eef4ee;
    font: 700 20px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .program-head span { color: #d2ff37; font: 16px 'Space Mono', monospace; text-transform: uppercase; }
  .program-hand {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }
  .program-hand button {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 44px;
    place-items: center;
    padding: 12px 3px 3px;
    border-color: #465356;
    color: #a8b3b1;
    background: #111819;
  }
  .program-hand button.selected {
    border-color: #d2ff37;
    color: #eef4ee;
    background: #1a2418;
  }
  .program-hand small {
    position: absolute;
    top: 3px;
    right: 4px;
    color: #ffcf4b;
    font: 14px 'Space Mono', monospace;
  }
  .program-hand strong {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    font: 700 14px 'Space Mono', monospace;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .chosen-registers {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chosen-registers li {
    display: grid;
    min-width: 0;
    min-height: 29px;
    place-items: center;
    overflow: hidden;
    border: 1px solid #354245;
    color: #788588;
    font: 12px 'Space Mono', monospace;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .chosen-registers span { color: #d2ff37; }
  .register-order-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    gap: 3px;
    align-items: end;
    padding: 4px;
    border: 1px solid #536164;
    background: #0d1314;
  }
  .register-order-controls label {
    display: grid;
    gap: 2px;
    color: #ffcf4b;
    font: 12px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .register-order-controls select {
    min-width: 0;
    min-height: 26px;
    border: 1px solid #536164;
    color: #eef4ee;
    background: #11191a;
    font: 14px 'Space Mono', monospace;
  }
  .register-order-controls button {
    min-height: 26px;
    padding: 0 4px;
    font-size: 12px;
  }
  .preview-note, .submission-state {
    margin: 0;
    color: #778487;
    font-size: 16px;
    line-height: 1.35;
  }
  .conservation {
    margin: 0;
    color: #ffcf4b;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .option-catalog {
    position: static;
    width: 100%;
    border: 1px solid #465356;
    color: #91a09f;
    font: 14px 'Space Mono', monospace;
  }
  .option-catalog summary { padding: 5px; color: #d2ff37; cursor: pointer; text-transform: uppercase; }
  .option-catalog ol {
    position: absolute;
    z-index: 5;
    top: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
    max-height: 190px;
    margin: 0;
    padding: 5px;
    overflow: auto;
    border: 1px solid #465356;
    background: #0d1314;
    list-style: none;
  }
  .option-catalog:not([open]) ol { display: none; }
  .option-catalog li { display: grid; gap: 1px; padding: 4px; border: 1px solid #293437; }
  .option-catalog strong { color: #eef4ee; }
  .option-catalog small { color: #778487; line-height: 1.25; }
  .power-control {
    display: grid;
    gap: 3px;
    padding: 4px 5px;
    border: 1px solid #465356;
    color: #91a09f;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .power-control > div { display: flex; gap: 3px; }
  .power-control button { flex: 1; min-height: 25px; padding: 0 4px; font-size: 12px; }
  .submission-state {
    padding: 9px;
    border: 1px solid #53613b;
    color: #d2ff37;
    background: #151d13;
  }
  .opponent-programs {
    display: grid;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .opponent-programs li, .deadline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    padding: 4px 6px;
    border: 1px solid #354245;
    color: #7f8d8f;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .opponent-programs strong { color: #eef4ee; }
  .deadline { gap: 7px; border-color: #8b7130; color: #ffcf4b; }
  .deadline button { min-height: 28px; padding: 0 6px; font-size: 14px; }
  .resolution-console {
    display: grid;
    gap: 5px;
    min-height: 0;
    padding-top: 6px;
    border-top: 1px solid #344043;
  }
  .resolution-console h2 {
    margin: 0;
    color: #d2ff37;
    font: 700 16px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .robot-state {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .robot-state li {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 3px 5px;
    border: 1px solid #354245;
    color: #91a09f;
    font: 14px 'Space Mono', monospace;
    animation: none;
  }
  .robot-state strong { color: #eef4ee; }
  .reentry-choice {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
    align-items: end;
    padding: 5px;
    border: 1px solid #8b7130;
  }
  .reentry-policy { margin: 0; color: #778487; font-size: 14px; line-height: 1.3; }
  .board-phase { margin: 0; color: #6e9691; font-size: 14px; line-height: 1.3; }
  .reentry-choice label {
    display: grid;
    gap: 2px;
    color: #ffcf4b;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .reentry-choice .reentry-power {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
  }
  .reentry-choice select {
    min-width: 0;
    min-height: 28px;
    border: 1px solid #536164;
    color: #eef4ee;
    background: #11191a;
    font: 16px 'Space Mono', monospace;
  }
  .reentry-choice button { min-height: 28px; padding: 0 6px; font-size: 14px; }
  .reentry-wait { margin: 0; color: #ffcf4b; font-size: 16px; }
  .race-summary {
    display: grid;
    gap: 4px;
    padding: 5px;
    border: 1px solid #d2ff37;
    color: #91a09f;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .race-summary strong { color: #d2ff37; font-size: 18px; }
  .race-summary button { min-height: 28px; padding: 0 6px; font-size: 14px; }
  .resolution-console ol {
    display: grid;
    gap: 2px;
    max-height: 100px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }
  .resolution-console li {
    padding: 3px 5px;
    border-left: 2px solid #536164;
    color: #91a09f;
    background: #0d1314;
    font-size: 16px;
    line-height: 1.25;
    animation: trace-in 180ms ease-out both;
    animation-delay: calc(var(--trace-index) * 18ms);
  }
  .resolution-console li span { color: #ffcf4b; font: 14px 'Space Mono', monospace; }
  .full-resolution summary {
    color: #91a09f;
    cursor: pointer;
    font: 14px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .full-resolution:not([open]) > ol { display: none; }
  .full-resolution[open] > ol { max-height: 160px; margin-top: 4px; }
  @keyframes trace-in {
    from { opacity: 0; transform: translateX(5px); }
    to { opacity: 1; transform: translateX(0); }
  }

  footer {
    border-top: 1px solid #344043;
    color: #647174;
    font-family: 'Space Mono', monospace;
    font-size: 16px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  footer span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer span:nth-child(2) { color: #95a3a1; }

  @media (max-width: 820px) {
    .shell {
      grid-template-rows: 58px minmax(0, 1fr) 34px;
      width: min(100%, 588px);
      padding-right: max(14px, env(safe-area-inset-right));
      padding-left: max(14px, env(safe-area-inset-left));
    }
    .masthead { align-items: center; }
    .brand { gap: 9px; font-size: 26px; }
    .brand-mark { grid-template-columns: repeat(3, 4px); gap: 2px; padding: 7px; }
    .brand-mark i { width: 4px; height: 4px; }
    .network { max-width: 125px; margin-left: auto; font-size: 16px; text-align: right; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 15px;
      padding: 15px 0 12px;
    }
    .copy { display: grid; grid-template-columns: 1fr auto; align-items: end; }
    .eyebrow { grid-column: 1 / -1; margin-bottom: 9px; font-size: 16px; }
    h1 { font-size: clamp(70px, 22vw, 96px); line-height: 0.9; }
    .lede { align-self: center; max-width: 190px; margin: 0 0 0 16px; font-size: 22px; line-height: 1.35; }
    .actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; margin-top: 13px; }
    .actions p { display: none; }
    button { min-height: 38px; padding: 0 10px; font-size: 18px; }
    .facts { grid-column: 1 / -1; margin-top: 12px; }
    .facts div { padding: 7px 3px 7px 0; }
    .facts dt { font-size: 28px; }
    .facts dd { font-size: 16px; }
    .telemetry { align-self: stretch; min-height: 0; padding: 9px; box-shadow: 10px 12px 0 rgba(0,0,0,.16); }
    .telemetry-head { margin-bottom: 6px; font-size: 14px; }
    .factory { height: calc(100% - 91px); min-height: 150px; }
    .registers { gap: 4px; margin-top: 6px; }
    .registers li { min-height: 75px; padding: 5px; }
    .registers strong { font-size: 34px; }
    .registers li > span:nth-of-type(2) { font-size: 14px; }
    .registers small, .register-number { font-size: 12px; }
    footer span:first-child { display: none; }
    footer { font-size: 14px; }

    .join-panel { grid-column: 1 / -1; gap: 8px; margin-top: 12px; padding: 10px; }
    .robot-options { grid-template-columns: repeat(4, 1fr); }
    .robot-options button { min-height: 35px; font-size: 14px; }
    .lobby {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      padding: 14px 0 10px;
    }
    .room-console {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 12px;
      align-items: end;
    }
    .room-console .eyebrow { grid-column: 1 / -1; }
    .room-console h1 { font-size: 68px; line-height: 0.88; }
    .room-console .lede { align-self: center; margin: 0; }
    .room-actions { margin-top: 10px; }
    .room-facts { margin-top: 10px; }
    .identity { align-self: center; margin: 10px 0 0; text-align: right; }
    .seat-console {
      display: grid;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-self: stretch;
      padding: 9px;
      box-shadow: 10px 12px 0 rgba(0,0,0,.16);
    }
    .configured-race {
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 10px;
      padding: 10px 0;
    }
    .setup-summary .eyebrow { margin-bottom: 7px; }
    .setup-summary h1 { font-size: 56px; }
    .your-robot { margin-top: 8px; padding: 6px 8px; }
    .your-robot strong { font-size: 22px; }
    .your-robot small { font-size: 11px; }
    .setup-summary .lede { max-width: none; margin: 8px 0 0; font-size: 18px; }
    .setup-facts { margin-top: 8px; }
    .setup-facts div { padding: 5px 2px; }
    .setup-facts dt { font-size: 24px; }
    .setup-order { max-height: 155px; margin-top: 7px; }
    .setup-order.compact { max-height: 76px; }
    .setup-order li { grid-template-columns: 24px minmax(0, 1fr); padding: 5px; }
    .setup-order em { grid-column: 2; }
    .archive-note { margin-top: 6px; font-size: 16px; }
    .program-console { margin-top: 6px; padding-top: 6px; }
    .program-head { gap: 4px; min-width: 0; }
    .program-head h2 { min-width: 0; }
    .program-head span { flex: none; white-space: nowrap; }
    .setup-summary.resolution-active .lede,
    .setup-summary.resolution-active > .archive-note { display: none; }
    .setup-summary.resolution-active .setup-order.compact { display: none; }
    .setup-summary.resolution-active .resolution-console ol { max-height: 70px; }
    .setup-summary.resolution-active:has(.robot-options-owned) .resolution-console > ol {
      display: none;
    }
    .robot-state { grid-template-columns: minmax(0, 1fr); }
    .robot-state li { align-content: flex-start; flex-wrap: wrap; overflow: hidden; }
    .robot-progress { min-width: 0; overflow-wrap: anywhere; }
    .setup-summary.resolution-active.many-robots .robot-state {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .setup-summary.resolution-active.many-robots .setup-facts,
    .setup-summary.resolution-active.many-robots .robot-progress,
    .setup-summary.resolution-active.many-robots .reentry-policy {
      display: none;
    }
    .setup-summary.resolution-active.many-robots
      .resolution-console > ol[aria-label='Resolution feed'] li:nth-child(-n + 2) {
      display: none;
    }
    .program-hand { grid-template-columns: repeat(3, 1fr); }
    .program-hand button { min-height: 37px; padding: 10px 2px 2px; }
    .chosen-registers li { min-height: 23px; }
    .register-order-controls {
      grid-template-columns: minmax(0, 1fr) repeat(3, 24px);
    }
    .register-order-controls label > span { display: none; }
    .seats { grid-template-rows: repeat(4, 1fr); gap: 4px; }
    .seats li {
      min-height: 0;
      grid-template-columns: 17px 31px minmax(0, 1fr);
      gap: 5px;
      padding: 5px;
    }
    .robot-token { width: 29px; height: 29px; font-size: 16px; }
    .seat-name strong { font-size: 20px; }
    .seat-state { display: none; }
    .room-ready { margin-top: 6px; padding: 6px 7px; font-size: 14px; }
  }

  @media (max-height: 720px) and (max-width: 820px) {
    .lede, .facts { display: none; }
    .copy { grid-template-columns: 1fr; }
    .actions { margin-top: 9px; }
  }
  @media (min-width: 561px) and (max-width: 820px) {
    .network { max-width: none; white-space: nowrap; }
  }
  @media (max-height: 560px) and (orientation: landscape) {
    .shell {
      grid-template-rows: 38px minmax(0, 1fr) 18px;
      width: 100%;
      padding-top: env(safe-area-inset-top);
      padding-right: max(10px, env(safe-area-inset-right));
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: max(10px, env(safe-area-inset-left));
    }
    .masthead { align-items: center; }
    .brand { gap: 6px; font-size: 20px; }
    .brand-mark { grid-template-columns: repeat(3, 3px); gap: 2px; padding: 4px; }
    .brand-mark i { width: 3px; height: 3px; }
    .network { max-width: 130px; margin-left: auto; font-size: 12px; text-align: right; }
    footer {
      justify-content: center;
      border-top: 0;
      font-size: 10px;
    }
    footer span:first-child,
    footer span:last-child { display: none; }

    .hero {
      grid-template-columns: 330px minmax(0, 1fr);
      gap: 8px;
      align-items: stretch;
      padding: 5px 0;
    }
    .copy {
      min-width: 0;
      min-height: 0;
    }
    .copy > .eyebrow {
      margin: 0 0 3px;
      font-size: 12px;
    }
    .copy h1 {
      font-size: 54px;
      line-height: .86;
    }
    .copy > .lede,
    .copy > .facts,
    .actions p { display: none; }
    .actions {
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin-top: 7px;
    }
    .actions button {
      min-height: 27px;
      padding: 0 5px;
      font-size: 14px;
    }
    .telemetry {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr) auto;
      padding: 5px;
      box-shadow: 5px 5px 0 rgba(0, 0, 0, .16);
    }
    .telemetry-head {
      margin-bottom: 3px;
      font-size: 12px;
    }
    .factory {
      height: auto;
      min-height: 0;
    }
    .registers {
      gap: 2px;
      margin-top: 3px;
    }
    .registers li {
      min-height: 34px;
      padding: 2px;
    }
    .registers strong { font-size: 20px; }
    .register-number,
    .registers small,
    .registers li > span:nth-of-type(2) { font-size: 8px; }
    .registers small { top: 2px; right: 2px; }
    .join-panel {
      gap: 4px;
      margin-top: 4px;
      padding: 5px;
    }
    .form-head { font-size: 14px; }
    button.close {
      width: 22px;
      min-height: 22px;
      font-size: 28px;
    }
    .join-panel label,
    .join-panel legend { gap: 2px; font-size: 12px; }
    .join-panel legend { margin-bottom: 2px; }
    .join-panel input {
      min-height: 25px;
      padding: 0 5px;
      font-size: 16px;
    }
    .robot-options { gap: 2px; }
    .robot-options button {
      min-height: 27px;
      gap: 2px;
      padding: 2px;
      font-size: 10px;
    }
    .robot-options button span { font-size: 12px; }
    .join-panel > button[type='submit'] {
      min-height: 25px;
      padding: 0 4px;
      font-size: 12px;
    }

    .lobby {
      grid-template-columns: 330px minmax(0, 1fr);
      gap: 7px;
      align-items: stretch;
      padding: 5px 0;
    }
    .room-console {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .room-console > .eyebrow,
    .room-console > .lede,
    .room-console > .room-facts,
    .room-console > .identity,
    .room-console :global(.catalog) {
      display: none;
    }
    .room-console h1 {
      font-size: 44px;
      line-height: .85;
    }
    .room-actions {
      gap: 6px;
      margin-top: 6px;
    }
    .room-actions button {
      min-height: 25px;
      padding: 0 5px;
      font-size: 12px;
    }
    .text-link { font-size: 12px; }
    .race-config {
      gap: 3px;
      margin-top: 5px;
      padding: 4px;
    }
    .race-config label,
    .race-config p { gap: 2px; font-size: 12px; }
    .race-config input,
    .race-config select {
      height: 24px;
      padding: 0 4px;
      font-size: 12px;
    }
    .race-config button {
      min-height: 24px;
      padding: 0 4px;
      font-size: 12px;
    }
    .seat-console {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr) auto;
      padding: 4px;
      box-shadow: 5px 5px 0 rgba(0, 0, 0, .16);
    }
    .seats {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: repeat(4, minmax(0, 1fr));
      gap: 2px;
    }
    .seats li {
      min-height: 0;
      grid-template-columns: 14px 22px minmax(0, 1fr);
      gap: 3px;
      padding: 2px;
    }
    .seat-number,
    .seat-name small { font-size: 10px; }
    .robot-token {
      width: 21px;
      height: 21px;
      font-size: 12px;
    }
    .seat-name strong { font-size: 14px; }
    .seat-state { display: none; }
    .room-ready {
      margin-top: 2px;
      padding: 2px 3px;
      font-size: 10px;
    }

    .configured-race {
      grid-template-columns: minmax(280px, .72fr) minmax(0, 1.28fr);
      gap: 7px;
      padding: 5px 0;
    }
    .setup-summary {
      align-self: stretch;
      min-height: 0;
      overflow: hidden;
    }
    .setup-summary > .eyebrow,
    .setup-summary > h1,
    .setup-summary > .lede,
    .setup-summary > .setup-facts,
    .setup-summary > .epoch-state,
    .setup-summary > .setup-order,
    .setup-summary > .archive-note {
      display: none;
    }
    .program-console {
      display: grid;
      max-height: 100%;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2px;
      margin: 0;
      overflow: hidden;
      padding: 0;
      border: 0;
    }
    .program-head,
    .program-hand,
    .register-order-controls,
    .submission-state,
    .opponent-programs,
    .deadline,
    .resolution-console {
      grid-column: 1 / -1;
    }
    .conservation,
    .option-catalog,
    .preview-note {
      display: none;
    }
    .program-head h2,
    .resolution-console h2 { font-size: 14px; }
    .program-head span { font-size: 12px; }
    .power-control {
      grid-column: 1 / -1;
      min-height: 24px;
      padding: 2px;
      font-size: 12px;
    }
    .power-control[data-can-respond='false'] { display: none; }
    .power-control button {
      min-height: 21px;
      font-size: 10px;
    }
    .program-hand {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 2px;
    }
    .program-hand button {
      min-height: 24px;
      padding: 8px 1px 1px;
      font-size: 12px;
    }
    .program-hand button small { top: 1px; left: 2px; font-size: 10px; }
    .chosen-registers {
      grid-column: 1 / -1;
      gap: 2px;
    }
    .chosen-registers li {
      min-height: 18px;
      font-size: 10px;
    }
    .register-order-controls {
      grid-template-columns: minmax(0, 1fr) repeat(3, 24px);
      min-height: 26px;
      padding: 1px;
    }
    .register-order-controls label > span { display: none; }
    .register-order-controls select,
    .register-order-controls button {
      min-height: 22px;
      font-size: 12px;
    }
    .program-console > button {
      min-height: 23px;
      padding: 0 4px;
      font-size: 12px;
    }
    .submission-state {
      padding: 3px;
      font-size: 12px;
    }
    .opponent-programs {
      gap: 2px;
      margin: 0;
    }
    .opponent-programs li,
    .deadline {
      min-height: 21px;
      padding: 2px 4px;
      font-size: 12px;
    }
    .deadline button {
      min-height: 20px;
      font-size: 12px;
    }

    .setup-summary.resolution-active .program-head,
    .setup-summary.resolution-active .submission-state,
    .setup-summary.resolution-active .opponent-programs,
    .setup-summary.resolution-active .deadline {
      display: none;
    }
    .resolution-console {
      align-self: stretch;
      gap: 2px;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      padding: 0;
      border: 0;
      line-height: 1;
    }
    .robot-state { gap: 2px; }
    .robot-state li {
      min-height: 19px;
      padding: 2px 3px;
      font-size: 12px;
    }
    .board-phase,
    .full-resolution {
      display: none;
    }
    .setup-summary.resolution-active .resolution-console:has(.race-summary) > ol {
      display: none;
    }
    .reentry-choice {
      gap: 2px;
      padding: 2px;
    }
    .reentry-choice select,
    .reentry-choice button,
    .race-summary button {
      min-height: 22px;
      font-size: 12px;
    }
    .race-summary {
      gap: 2px;
      padding: 3px;
      font-size: 12px;
    }
    .race-summary strong { font-size: 16px; }
  }
  @media (max-width: 560px) {
    .masthead {
      display: grid;
      width: 100%;
      max-width: 100%;
      grid-template-columns: minmax(0, 1fr) minmax(0, 125px);
    }
    .masthead > * { min-width: 0; max-width: 100%; }
    .brand {
      min-width: 0;
      overflow: hidden;
    }
    .brand > span:last-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brand small { display: none; }
    .network { width: 100%; max-width: 125px; max-height: 100%; overflow: hidden; }
    .hero:has(.join-panel) {
      grid-template-rows: minmax(0, 1fr);
    }
    .hero:has(.join-panel) .copy {
      display: block;
      min-height: 0;
    }
    .hero:has(.join-panel) .copy > .eyebrow,
    .hero:has(.join-panel) .copy > h1,
    .hero:has(.join-panel) .copy > .lede,
    .hero:has(.join-panel) .copy > .facts,
    .hero:has(.join-panel) > .telemetry {
      display: none;
    }
    .hero:has(.join-panel) .join-panel { margin-top: 0; }
    .hero:not(:has(.join-panel)) .copy {
      min-width: 0;
      grid-template-columns: minmax(0, 1fr);
      overflow: hidden;
    }
    .hero:not(:has(.join-panel)) .lede {
      max-width: none;
      margin: 12px 0 0;
    }
    .hero:not(:has(.join-panel)) .factory { display: none; }
    .hero:not(:has(.join-panel)) .telemetry {
      grid-template-rows: auto auto;
      align-self: end;
    }
    .room-console { display: block; }
    .room-console > .eyebrow,
    .room-console > .lede {
      display: none;
    }
    .room-console > h1 {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
    .preview-note {
      max-height: 4.05em;
      overflow: auto;
    }
    .configured-race {
      grid-template-columns: 145px minmax(0, 1fr);
    }
    .setup-summary h1 { font-size: 44px; }
    .setup-summary .lede { font-size: 16px; }
    .setup-order small { display: none; }
    .setup-summary.program-editing h1 {
      margin-bottom: 2px;
      font-size: 36px;
      line-height: 0.9;
    }
    .configured-race:has(.program-console) {
      grid-template-columns: minmax(0, 1fr);
    }
    .configured-race:has(.program-console) :global(.course-panel) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      transition: none !important;
      animation: none !important;
    }
  }
</style>
