<script lang="ts">
  import AddComputer from "$lib/components/AddComputer.svelte";
  import ComputerController from "$lib/components/ComputerController.svelte";
  import CaptureDeployment from "$lib/components/CaptureDeployment.svelte";
  import { raceRoster } from "$lib/room-model";
  import ScenarioTeams from "$lib/components/ScenarioTeams.svelte";
  import { scenarioTeamAssignments, validateScenarioTeams } from "$lib/game/setup";
  import StartingOptionDraft from "$lib/components/StartingOptionDraft.svelte";
  import "@fontsource/atkinson-hyperlegible/400.css";
  import "@fontsource/atkinson-hyperlegible/700.css";
  import "@fontsource/space-mono/400.css";
  import "@fontsource/space-mono/700.css";
  import { base } from "$app/paths";
  import { onDestroy, onMount } from "svelte";
  import QRCode from "qrcode";
  import CourseBoard from "$lib/components/CourseBoard.svelte";
  import TabletopGutterLog from "$lib/components/TabletopGutterLog.svelte";
  import RobotMarker from "$lib/components/RobotMarker.svelte";
  import PlayerStatusCard from "$lib/components/PlayerStatusCard.svelte";
  import { initializeFirebase, type FirebaseServices } from "$lib/firebase";
  import {
    MAX_ROOM_PLAYERS,
    ROBOTS,
    emptyRoomState,
    normalizeRoomCode,
    presentationDecisionAvailable,
    presentationDecisionKey,
    presentationPlaybackComplete,
    presentationUsesEventStream,
    programmingOptionCardIds,
    type RoomState,
  } from "$lib/room-model";
  import * as RoomService from "$lib/room-service";
  import { PUBLISHED_COURSES_BY_ID } from "$lib/game/course-catalog";
  import { compilePlayableCourse } from "$lib/game/playable-courses";
  import {
    PLAYABLE_COURSE_IDS,
    raceConfig,
    type PlayableCourseId,
  } from "$lib/game/setup";
  import { PROGRAM_CARDS, type ProgramCard } from "$lib/game/program-manifest";
  import type { TurnId } from "$lib/game/programming";
  import {
    type OptionCardId,
  } from "$lib/game/option-manifest";
  import type { ProgramPlayback, RaceRobotPosition } from "$lib/game/movement";
  import type { Unsubscribe } from "firebase/firestore";
  import { tabletopLayoutForCourse } from "$lib/tabletop-layout";
  import {
    clearPlaybackTimer,
    schedulePlaybackTimer,
    type PlaybackTimer,
  } from "$lib/playback-clock";
  import { persistPresentationEventWithRetry } from "$lib/presentation-reveal";
  import {
    playbackFrameDurationMs,
    robotsForPlaybackPresentation,
  } from "$lib/playback-presentation";

  type SeatQr = { seat: number; url: string; image: string };
  type PlaybackPhase = "idle" | "countdown" | "register" | "waiting" | "complete";


  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = "";
  let status = "Preparing a new tabletop…";
  let error = "";
  let pending = false;
  let seatQrs: SeatQr[] = [];
  let seatRotations: Record<number, number> = {};

  function defaultSeatRotation(seat: number, layout: ReturnType<typeof tabletopLayoutForCourse>): number {
    if (layout === "side-seats") {
      if (seat === 1 || seat === 8) return 180;
      if (seat === 4 || seat === 5) return 0;
      return seat < 5 ? 90 : 270;
    }
    if (seat === 1 || seat === 4) return 180;
    if (seat === 5 || seat === 8) return 0;
    return seat === 2 || seat === 7 ? 90 : 270;
  }

  function rotateSeat(seat: number) {
    seatRotations = {
      ...seatRotations,
      [seat]: ((seatRotations[seat] ?? defaultSeatRotation(seat, state.setup ? "side-seats" : tabletopLayout)) + 90),
    };
  }
  let teamAssignments: Record<string, string> = {};
  let selectedCourseId: PlayableCourseId = "risky-exchange";
  let setupSeed = "";
  let setupLives: 3 | 4 = 3;
  let e2eRematchRoomCode = "";
  let unsubscribe: Unsubscribe | undefined;
  let playbackPhase: PlaybackPhase = "idle";
  let playbackCountdown = 3;
  let playbackRegister: number | null = null;
  // Reveal a whole register together, retaining past cards but never future ones.
  $: revealedRegisterCount = playbackPhase === "idle" ? 0
    : playbackPhase === "countdown" ? 1
    : playbackPhase === "complete" ? 5
    : playbackRegister ?? 0;
  let playbackStage: ProgramPlayback["frames"][number]["stage"] | null = null;
  let playbackActorUid: string | null = null;
  let playbackCardId: ProgramCard["id"] | null = null;
  let playbackScenario: ProgramPlayback['frames'][number]['scenario'];
  let playbackRobots: RaceRobotPosition[] | undefined;
  let playbackHistory: ProgramPlayback["frames"][number]["trace"] = [];
  let playbackLaserBeams: ProgramPlayback["frames"][number]["laserBeams"] = [];
  let playbackFrameIndex = 0;
  let playbackFrameCount = 0;
  let playbackProductionDurationMs = 2_000;
  let playbackKey = "";
  let serverAtHead = false;
  let presentationTimelineIndex = 0;
  let presentationBusy = false;
  let presentationCountdownComplete = false;
  let attemptedPresentationStart = "";
  let awaitingCompletedStep = "";
  let tabletopMounted = false;
  let playbackTimers: PlaybackTimer[] = [];
  let manualReplayActive = false;
  const PRODUCTION_PROGRAM_CARD_MS = 2_000;
  const PRODUCTION_COUNTDOWN_STEP_MS = 1_000;
  const playbackTimeScale =
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? 0.1 : 1;
  const reviewPlaybackTimeScale =
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? 0.02 : 0.2;

  $: selectedCourse = PUBLISHED_COURSES_BY_ID.get(selectedCourseId)!;
  $: selectedCourseSupportsRoom = selectedCourse.players.includes(
    state.players.length,
  );
  $: layoutCourse = compilePlayableCourse(
    state.setup?.courseId ?? state.configuration?.courseId ?? selectedCourseId,
  );
  $: tabletopLayout = tabletopLayoutForCourse(
    layoutCourse.width,
    layoutCourse.height,
  );
  $: playbackIsActive =
    playbackPhase === "countdown" || playbackPhase === "register";
  $: playbackTransitionMs = Math.round(
    playbackProductionDurationMs *
      (manualReplayActive ? reviewPlaybackTimeScale : playbackTimeScale),
  );
  $: actorIsExecuting = playbackPhase === "register" && playbackStage === "program-card" && !waitingPlayer;
  $: robotCueMs = actorIsExecuting ? Math.min(350, Math.round(playbackTransitionMs * 0.3)) : 0;
  $: countdownStepMs = Math.round(
    PRODUCTION_COUNTDOWN_STEP_MS * playbackTimeScale,
  );
  $: playbackCard = PROGRAM_CARDS.find(({ id }) => id === playbackCardId);
  $: playbackStageLabel =
    playbackStage === "program-card"
      ? `${raceRoster(state).find(({ uid }) => uid === playbackActorUid)?.name ?? "Robot"} · ${playbackCard?.action.replaceAll("-", " ") ?? "Program card"} · priority ${playbackCard?.priority ?? "—"}`
      : playbackStage === "express-conveyors"
        ? "Express conveyors"
        : playbackStage === "conveyors"
          ? "All conveyors"
          : playbackStage === "pushers"
            ? "Pushers"
            : playbackStage === "checkpoints" ? "Flags" : playbackStage === "gears"
              ? "Gears"
              : playbackStage === "lasers"
                ? "Robot and board lasers"
                : playbackStage === "laser-damage"
                  ? "Damage decision"
                  : "";
  $: resolutionPlaybackKey = state.resolution
    ? `${state.raceEpoch}:${state.resolution.turnNumber}`
    : "";
  $: presentationSettled =
    presentationPlaybackComplete(state) &&
    !state.resolution?.pendingOptionDecision &&
    !state.resolution?.nextOptionChoiceUid &&
    !state.resolution?.nextReentryUid;
  $: presentedRobots = robotsForPlaybackPresentation(
    state.resolution,
    presentationSettled && !manualReplayActive && !playbackIsActive ? undefined : playbackRobots,
    resolutionPlaybackKey,
    playbackKey,
  );
  $: manualReplayAvailable =
    presentationSettled &&
    !manualReplayActive &&
    playbackPhase === "complete" &&
    !!state.resolution?.playback.frames.length;
  $: pendingPresentationDecisionKey = presentationDecisionKey(state);
  $: presentationDecisionVisible =
    serverAtHead &&
    !!pendingPresentationDecisionKey &&
    presentationDecisionAvailable(state);
  $: pendingOptionDecision =
    presentationDecisionVisible
      ? (state.resolution?.pendingOptionDecision ?? null)
      : null;
  $: pendingOptionRobot = state.resolution?.robots.find(
    ({ uid }) => uid === pendingOptionDecision?.uid,
  );
  $: waitingPowerDownUid = serverAtHead && !manualReplayActive &&
    (!state.resolution || presentationSettled) &&
    !state.programming?.players.some(({ uid, submitted }) =>
      uid === state.pendingPowerDownUid && !submitted)
      ? state.pendingPowerDownUid
      : null;
  $: waitingPlayerUid = presentationDecisionVisible
    ? (pendingOptionDecision?.uid ??
      state.resolution?.nextOptionChoiceUid ??
      state.resolution?.nextReentryUid ??
      null)
    : waitingPowerDownUid;
  $: waitingPlayer = raceRoster(state).find(({ uid }) => uid === waitingPlayerUid);
  $: waitingPrompt = pendingOptionDecision?.tabletopPrompt ??
    (state.resolution?.nextOptionChoiceUid
      ? "Choose an Option to discard"
      : state.resolution?.nextReentryUid
        ? "Choose a re-entry position and facing"
        : waitingPowerDownUid
          ? "Choose your power state for next turn"
          : "");
  $: gutterTrace = presentationSettled && !manualReplayActive && !playbackIsActive
    ? state.resolution?.trace ?? [] : playbackHistory;
  $: gutterHeading = waitingPlayer ? `Waiting for ${waitingPlayer.name}`
    : playbackPhase === "countdown" ? `Moving in ${playbackCountdown}`
    : playbackPhase === "register" ? `Register ${playbackRegister ?? 1}`
    : `Turn ${state.programming?.turnNumber ?? state.resolution?.turnNumber ?? 1}`;
  $: gutterDetail = waitingPlayer ? `${waitingPrompt}. Check your phone.`
    : playbackPhase === "countdown" ? "All Programs locked. Watch the board."
    : playbackPhase === "register" ? playbackStageLabel
    : playbackPhase === "complete" ? "Turn complete. Choose your next action on your phone."
    : "Choose your Program on your phone.";
  $: finishWinners = (state.resolution?.summary?.winnerUids ?? [])
    .map((uid) => raceRoster(state).find((player) => player.uid === uid))
    .filter((player) => player !== undefined);
  $: finishOverlayVisible =
    !manualReplayActive &&
    state.resolution?.phase === "race-finished" &&
    !!state.resolution.summary &&
    (presentationUsesEventStream(state)
      ? presentationSettled
      : !playbackIsActive && playbackPhase === "complete");

  onMount(async () => {
    tabletopMounted = true;
    try {
      services = await initializeFirebase();
      const params = new URLSearchParams(location.search);
      const requestedRoom = normalizeRoomCode(params.get("room") ?? "");
      const e2eRoom =
        import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
          ? normalizeRoomCode(params.get("e2eRoomCode") ?? "")
          : "";
      e2eRematchRoomCode =
        import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
          ? normalizeRoomCode(params.get("e2eRematchRoomCode") ?? "")
          : "";
      const requestedCourse = params.get("course");
      if (
        requestedCourse &&
        (PLAYABLE_COURSE_IDS.includes(
          requestedCourse as (typeof PLAYABLE_COURSE_IDS)[number],
        ) ||
          (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" &&
            ["option-lab", "risky-exchange-a"].includes(requestedCourse)))
      ) {
        selectedCourseId = requestedCourse as PlayableCourseId;
      }
      roomCode = requestedRoom || e2eRoom || RoomService.createRoomCode();
      if (params.get("lives") === "4") setupLives = 4;
      // A room code is already random and stable, which makes it a useful
      // default seed: separate tabletops get separate deals without giving up
      // deterministic replay or an explicitly supplied setup seed.
      setupSeed = (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? params.get("e2eSeed")?.slice(0, 64) : null) || params.get("seed")?.slice(0, 64) || roomCode;

      const joinBase = `${location.origin}${base}/hand/`;
      seatQrs = await Promise.all(
        Array.from({ length: MAX_ROOM_PLAYERS }, async (_, index) => {
          const seat = index + 1;
          const url = `${joinBase}?room=${roomCode}&seat=${seat}`;
          return {
            seat,
            url,
            image: await QRCode.toDataURL(url, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 320,
              color: { dark: "#11191a", light: "#eef4ee" },
            }),
          };
        }),
      );

      if (!requestedRoom) {
        status = "Reserving a fresh tabletop room…";
        await RoomService.createTabletopRoom(
          services.db,
          services.user,
          roomCode,
        );
      }
      unsubscribe = RoomService.subscribeRoom(
        services.db,
        roomCode,
        (next) => {
          state = next;
          if (
            next.rematchRoomCode &&
            next.rematchRoomCode !== roomCode &&
            !pending
          ) {
            location.replace(`${base}/tt/?room=${next.rematchRoomCode}`);
            return;
          }
          status = next.resolution
            ? `Turn ${next.resolution.turnNumber} · ${next.resolution.phase.replaceAll("-", " ")}`
            : next.configuration
              ? "Race configured · waiting for racers"
              : "Waiting for race configuration";
        },
        (error) => {
          console.error(error);
          status = "Connection interrupted. Reconnecting…";
        },
        (sync) => {
          if (sync.source === "server" && !sync.hasPendingWrites) serverAtHead = true;
        },
      );
    } catch (nextError) {
      console.error(nextError);
      error = "Unable to connect to the race. Please try again.";
      status = error;
    }
  });
  onDestroy(() => {
    tabletopMounted = false;
    unsubscribe?.();
    clearPlaybackTimers();
  });

  function clearPlaybackTimers() {
    for (const timer of playbackTimers) clearPlaybackTimer(timer);
    playbackTimers = [];
  }

  function optionCardIdsForPlayer(
    uid: string,
    raceRobot: RaceRobotPosition | undefined,
  ): OptionCardId[] {
    if (raceRobot) return raceRobot.options.map(({ cardId }) => cardId);
    const programming = state.programming ?? state.nextProgramming;
    return programming ? programmingOptionCardIds(state, programming, uid) : [];
  }

  function resetProgramPlayback() {
    clearPlaybackTimers();
    playbackPhase = "idle";
    playbackCountdown = 3;
    playbackRegister = null;
    playbackStage = null;
    playbackActorUid = null;
    playbackCardId = null;
    playbackRobots = undefined;
    playbackScenario = undefined;
    playbackHistory = [];
    playbackLaserBeams = [];
    playbackFrameIndex = 0;
    playbackFrameCount = 0;
    playbackProductionDurationMs = PRODUCTION_PROGRAM_CARD_MS;
    presentationTimelineIndex = 0;
    presentationBusy = false;
    presentationCountdownComplete = false;
    attemptedPresentationStart = "";
    awaitingCompletedStep = "";
    manualReplayActive = false;
  }

  function schedulePlayback(callback: () => void, delay: number) {
    playbackTimers.push(schedulePlaybackTimer(callback, delay));
  }


  function prepareProgramPlayback(key: string, playback: ProgramPlayback) {
    resetProgramPlayback();
    playbackKey = key;
    playbackRobots = playback.initialRobots;
    playbackScenario = state.resolution?.initialScenario;
  }

  function startPlaybackCountdown() {
    if (presentationBusy || presentationCountdownComplete) return;
    presentationBusy = true;
    playbackPhase = "countdown";
    playbackCountdown = 3;
    schedulePlayback(() => (playbackCountdown = 2), countdownStepMs);
    schedulePlayback(() => (playbackCountdown = 1), countdownStepMs * 2);
    schedulePlayback(() => {
      presentationCountdownComplete = true;
      presentationBusy = false;
      queueMicrotask(() => void driveEventPresentation());
    }, countdownStepMs * 3);
  }

  function showPlaybackFrame(
    frame: ProgramPlayback["frames"][number],
    frameIndex: number,
    frameCount: number,
  ) {
    playbackPhase = "register";
    playbackRegister = frame.register;
    playbackStage = frame.stage;
    playbackActorUid = frame.actorUid;
    playbackCardId = frame.cardId;
    playbackRobots = frame.robots;
    playbackScenario = frame.scenario;
    playbackHistory = state.resolution?.playback.frames
      .slice(0, frameIndex + 1).flatMap(({ trace }) => trace) ?? frame.trace;
    playbackLaserBeams = frame.laserBeams ?? [];
    playbackFrameIndex = frameIndex + 1;
    playbackFrameCount = Math.max(frameCount, frameIndex + 1);
    playbackProductionDurationMs = playbackFrameDurationMs(frame);
  }

  function replayCompletedRound() {
    const playback = state.resolution?.playback;
    if (!playback || !manualReplayAvailable) return;

    clearPlaybackTimers();
    manualReplayActive = true;
    playbackPhase = "idle";
    playbackCountdown = 3;
    playbackRegister = null;
    playbackStage = null;
    playbackActorUid = null;
    playbackCardId = null;
    playbackRobots = playback.initialRobots;
    playbackScenario = state.resolution?.initialScenario;
    playbackHistory = [];
    playbackLaserBeams = [];
    playbackFrameIndex = 0;
    playbackFrameCount = playback.frames.length;

    const revealStepMs = PRODUCTION_COUNTDOWN_STEP_MS * reviewPlaybackTimeScale;
    schedulePlayback(() => { playbackPhase = "countdown"; }, 0);
    schedulePlayback(() => { playbackCountdown = 2; }, revealStepMs);
    schedulePlayback(() => { playbackCountdown = 1; }, revealStepMs * 2);
    let frameStart = revealStepMs * 3;
    for (const [frameIndex, frame] of playback.frames.entries()) {
      schedulePlayback(
        () => showPlaybackFrame(frame, frameIndex, playback.frames.length),
        frameStart,
      );
      frameStart += Math.max(
        50,
        Math.round(playbackFrameDurationMs(frame) * reviewPlaybackTimeScale),
      );
    }
    schedulePlayback(() => {
      playbackPhase = "complete";
      playbackRegister = null;
      playbackStage = null;
      playbackActorUid = null;
      playbackCardId = null;
      playbackRobots = undefined;
    playbackScenario = undefined;
      playbackLaserBeams = [];
      manualReplayActive = false;
    }, frameStart);
  }

  async function writePresentationEvent(write: () => Promise<void>) {
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
      window.__roborallyE2ePresentationRevealAttempts =
        (window.__roborallyE2ePresentationRevealAttempts ?? 0) + 1;
      if ((window.__roborallyE2ePresentationRevealFailures ?? 0) > 0) {
        window.__roborallyE2ePresentationRevealFailures! -= 1;
        throw new Error("Synthetic presentation event rejection.");
      }
    }
    await write();
  }

  $: {
    const resolution = state.resolution;
    if (resolution && resolutionPlaybackKey !== playbackKey) {
      prepareProgramPlayback(resolutionPlaybackKey, resolution.playback);
    }
    state.presentationTurn?.timeline.length;
    state.presentationTurn?.frameCursor;
    serverAtHead;
    presentationTimelineIndex;
    presentationBusy;
    presentationCountdownComplete;
    manualReplayActive;
    void driveEventPresentation();
  }

  async function driveEventPresentation() {
    if (
      !services ||
      !tabletopMounted ||
      !state.resolution ||
      presentationBusy ||
      manualReplayActive
    ) return;
    const resolution = state.resolution;
    const turnId: TurnId = state.programming?.turnNumber === resolution.turnNumber
      ? state.programming.turnId
      : `turn-${String(resolution.turnNumber).padStart(3, "0")}` as TurnId;
    const turnKey = `${state.raceEpoch}:${turnId}`;

    if (!presentationUsesEventStream(state)) {
      if (!serverAtHead || attemptedPresentationStart === turnKey) return;
      attemptedPresentationStart = turnKey;
      const synchronized = await persistPresentationEventWithRetry({
        reveal: () => writePresentationEvent(() =>
          RoomService.startPresentationTurn(
            services!.db,
            services!.user,
            roomCode,
            { turnId, turnNumber: resolution.turnNumber },
          )
        ),
        shouldContinue: () =>
          tabletopMounted &&
          serverAtHead &&
          state.resolution?.turnNumber === resolution.turnNumber &&
          !presentationUsesEventStream(state),
        onRetry: (nextError, delay) => {
          console.error(nextError);
          error = `Connection interrupted. Retrying in ${Math.ceil(delay / 1_000)} seconds…`;
        },
        onSuccess: () => { error = ""; },
      });
      if (!synchronized) {
        attemptedPresentationStart = "";
      }
      return;
    }

    const presentation = state.presentationTurn!;
    const timelineEntry = presentation.timeline[presentationTimelineIndex];
    if (timelineEntry?.kind === "decision") {
      presentationTimelineIndex += 1;
      queueMicrotask(() => void driveEventPresentation());
      return;
    }
    if (timelineEntry?.kind === "frame") {
      const stepKey = `${timelineEntry.segment}:${timelineEntry.frameIndex}`;
      if (awaitingCompletedStep === stepKey) {
        awaitingCompletedStep = "";
        presentationTimelineIndex += 1;
        queueMicrotask(() => void driveEventPresentation());
        return;
      }
      if (!presentationCountdownComplete) {
        startPlaybackCountdown();
        return;
      }
      presentationBusy = true;
      showPlaybackFrame(
        timelineEntry.frame,
        timelineEntry.frameIndex,
        Math.max(resolution.playback.frames.length, timelineEntry.frameIndex + 1),
      );
      schedulePlayback(() => {
        presentationTimelineIndex += 1;
        presentationBusy = false;
        queueMicrotask(() => void driveEventPresentation());
      }, Math.round(playbackFrameDurationMs(timelineEntry.frame) * playbackTimeScale));
      return;
    }

    if (!serverAtHead) return;
    if (awaitingCompletedStep) return;
    if (presentation.frameCursor < resolution.playback.frames.length) {
      if (!presentationCountdownComplete) {
        startPlaybackCountdown();
        return;
      }
      const frameIndex = presentation.frameCursor;
      const frame = resolution.playback.frames[frameIndex];
      const stepKey = `${presentation.segment}:${frameIndex}`;
      presentationBusy = true;
      showPlaybackFrame(frame, frameIndex, resolution.playback.frames.length);
      schedulePlayback(() => {
        awaitingCompletedStep = stepKey;
        void persistPresentationEventWithRetry({
          reveal: () => writePresentationEvent(() =>
            RoomService.completePresentationStep(
              services!.db,
              services!.user,
              roomCode,
              {
                turnId: presentation.turnId,
                turnNumber: presentation.turnNumber,
                segment: presentation.segment,
                frameIndex,
              },
            )
          ),
          shouldContinue: () =>
            tabletopMounted &&
            serverAtHead &&
            state.presentationTurn?.turnNumber === presentation.turnNumber &&
            state.presentationTurn.segment === presentation.segment &&
            state.presentationTurn.frameCursor === frameIndex,
          onRetry: (nextError, delay) => {
            console.error(nextError);
            error = `Connection interrupted. Retrying in ${Math.ceil(delay / 1_000)} seconds…`;
          },
          onSuccess: () => { error = ""; },
        }).finally(() => {
          presentationBusy = false;
          queueMicrotask(() => void driveEventPresentation());
        });
      }, Math.round(playbackFrameDurationMs(frame) * playbackTimeScale));
      return;
    }

    const waitingForPlayer = !!(
      resolution.pendingOptionDecision ||
      resolution.nextOptionChoiceUid ||
      resolution.nextReentryUid
    );
    playbackPhase = waitingForPlayer ? "waiting" : "complete";
    playbackStage = null;
    playbackActorUid = null;
    playbackCardId = null;
    if (waitingForPlayer) {
      // Before-register Options can pause before the first frame of this cycle.
      playbackRegister = resolution.pendingOptionDecision?.register ?? playbackRegister;
    } else {
      playbackRegister = null;
      playbackRobots = undefined;
    playbackScenario = undefined;
      playbackLaserBeams = [];
    }
  }

  async function configureCourse() {
    if (
      !services ||
      services.user.uid !== state.hostUid ||
      state.players.length < 2 ||
      !selectedCourseSupportsRoom
    )
      return;
    pending = true;
    error = "";
    try {
      await RoomService.configureRace(services.db, services.user, roomCode, {
        config: raceConfig(
          selectedCourseId,
          setupSeed.trim() || roomCode,
          setupLives,
          scenarioTeamAssignments(selectedCourseId, state.players, teamAssignments),
        ),
      });
    } catch (nextError) {
      console.error(nextError);
      error = "Unable to save the race settings. Please try again.";
    } finally {
      pending = false;
    }
  }

  async function rematchRace() {
    if (!services || state.resolution?.phase !== "race-finished" || pending)
      return;
    const priorConfiguration = state.configuration;
    if (
      priorConfiguration &&
      PLAYABLE_COURSE_IDS.includes(
        priorConfiguration.courseId as (typeof PLAYABLE_COURSE_IDS)[number],
      )
    ) {
      selectedCourseId = priorConfiguration.courseId;
    }
    setupLives = priorConfiguration?.lives ?? 3;
    setupSeed = `${priorConfiguration?.seed ?? "RALLY-2005"}:rematch`;
    const nextRoomCode = e2eRematchRoomCode || RoomService.createRoomCode();
    pending = true;
    error = "";
    try {
      await RoomService.createTabletopRematch(
        services.db,
        services.user,
        roomCode,
        nextRoomCode,
        state.players,
      );
      const destination = new URL(`${location.origin}${base}/tt/`);
      destination.searchParams.set("room", nextRoomCode);
      destination.searchParams.set("course", selectedCourseId);
      destination.searchParams.set("lives", String(setupLives));
      destination.searchParams.set("seed", setupSeed);
      location.replace(destination.toString());
    } catch (nextError) {
      console.error(nextError);
      error = "The tabletop could not create and connect the rematch room.";
      pending = false;
    }
  }

  function startNewGame() {
    location.assign(`${base}/tt/`);
  }
</script>

<svelte:head><title>Robo Rally · Tabletop</title></svelte:head>

<ComputerController {state} {services} {roomCode} synced={serverAtHead} />
<main
  class="tabletop"
  data-e2e-tabletop
  data-room-code={roomCode}
  data-presentation-cursor={state.presentationTurn?.frameCursor ?? -1}
  data-presentation-frame-count={state.resolution?.playback.frames.length ?? 0}
  data-presentation-timeline-index={presentationTimelineIndex}
  data-presentation-timeline-count={state.presentationTurn?.timeline.length ?? 0}
  data-presentation-server-head={serverAtHead}
  data-presentation-busy={presentationBusy}
>
  {#if services && state.setup && !state.programming}<div class="scenario-setup"><StartingOptionDraft {state} {services} {roomCode} /><CaptureDeployment state={state} {services} {roomCode} /></div>{/if}
  <p
    class="sr-only"
    role="status"
    aria-live="polite"
    data-status={error
      ? "error"
      : roomCode && state.gameId
        ? "synced"
        : "connecting"}
  >
    {roomCode ? `${roomCode}. ${status}` : status}
  </p>
  {#if error}<p class="table-error" role="alert">{error}</p>{/if}

  {#if finishOverlayVisible}
    <div
      class="race-finish-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Race finished"
    >
      <div>
        <span>RACE COMPLETE</span>
        <h1>
          {finishWinners.length === 1
            ? `${finishWinners[0].name} WINS!`
            : `${finishWinners.map(({ name }) => name).join(" + ")} TIE!`}
        </h1>
        <p>
          {finishWinners.length === 1
            ? `${finishWinners[0].name} touched every flag in order.`
            : "The final flag was touched simultaneously. The victory is shared."}
        </p>
        <div class="finish-actions">
          {#if manualReplayAvailable}
            <button type="button" class="finish-replay" onclick={replayCompletedRound}>
              FAST REPLAY · TURN {state.resolution?.turnNumber}
            </button>
          {/if}
          <button type="button" onclick={rematchRace} disabled={pending}>
            {pending ? "CONNECTING REMATCH…" : "REMATCH · CHOOSE COURSE"}
          </button>
          <button type="button" class="new-game" onclick={startNewGame}
            >NEW GAME</button
          >
        </div>
      </div>
    </div>
  {/if}

  <section
    class:side-seats={tabletopLayout === "side-seats"}
    class:top-bottom-seats={tabletopLayout === "top-bottom-seats"}
    class="table"
    class:playing={!!state.setup}
    style={`--course-aspect:${layoutCourse.width / layoutCourse.height}`}
    aria-label="Shared tabletop"
    data-course-layout={tabletopLayout}
  >
    {#each Array(MAX_ROOM_PLAYERS) as _, index}
      {@const seat = index + 1}
      {@const player = raceRoster(state).find(
        (candidate) => candidate.seat === seat,
      )}
      {@const robot = player
        ? ROBOTS.find((entry) => entry.id === player.robotId)
        : undefined}
      {@const qr = seatQrs.find((candidate) => candidate.seat === seat)}
      {#if player || !state.setup}
        <div class={`seat-slot seat-${seat}`}>
        <article
          style:transform={`rotate(${seatRotations[seat] ?? defaultSeatRotation(seat, state.setup ? "side-seats" : tabletopLayout)}deg)`}
          class:executing={actorIsExecuting && player?.uid === playbackActorUid}
          class:open={!player}
          class:awaiting-decision={!!player && player.uid === waitingPlayerUid}
          class="seat"
          data-seat={seat}
          data-player-uid={player?.uid ?? ""}
          data-awaiting-decision={player?.uid === waitingPlayerUid ? "true" : undefined}
        >
          <div class="seat-head">
            <b>D{String(seat).padStart(2, "0")}</b>
            {#if player?.uid === waitingPlayerUid}<span>YOUR DECISION</span>{/if}
            <span class="seat-robot">{#if player}<RobotMarker robotId={player.robotId} />{:else}OPEN{/if}</span>
            {#if player}<button class="rotate-seat" type="button"
              aria-label={`Rotate ${player?.name ?? `position ${seat}`} card clockwise`}
              title="Rotate card clockwise" onclick={() => rotateSeat(seat)}>↻</button>{/if}
          </div>
          {#if player}
            {@const raceRobot = presentedRobots?.find(
              (candidate) => candidate.uid === player.uid,
            )}
            {@const startingLives =
              state.setup?.players.find(
                (candidate) => candidate.uid === player.uid,
              )?.lives ??
              state.configuration?.lives ??
              3}
            {@const lives = raceRobot?.lives ?? startingLives}
            {@const damage = Math.max(
              0,
              Math.min(10, raceRobot?.damage ?? state.setup?.startingDamage ?? 0),
            )}
            {@const powerMode = raceRobot?.poweredDown
              ? "down"
              : raceRobot?.powerDownNextTurn
                ? "announced"
                : "active"}
            {@const touchedFlags = raceRobot?.touchedFlags ?? []}
            {@const optionCardIds = optionCardIdsForPlayer(player.uid, raceRobot)}
            <PlayerStatusCard scenarioLabel={[raceRobot?.teamId?.replace('team-', 'Team ') ?? state.setup?.players.find(({ uid }) => uid === player.uid)?.teamId?.replace('team-', 'Team '), (raceRobot?.isSuperbot ?? state.setup?.players.find(({ uid }) => uid === player.uid)?.isSuperbot) ? 'SuperBot' : '', raceRobot?.carriedFlag ? 'Carrying enemy flag' : '', raceRobot?.reentryWaitTurns ? 'Sitting out next turn' : ''].filter(Boolean).join(' · ')} uid={player.uid} playerName={player.name} robotName={robot?.name} showRobotName={false}
              {startingLives} {lives} {damage} {powerMode} {touchedFlags}
              flags={layoutCourse.course.flags} {optionCardIds}
              registers={state.programming?.players.find(({ uid }) => uid === player.uid)?.registers ?? []}
              playbackFrames={state.resolution?.turnNumber === state.programming?.turnNumber ? state.resolution?.playback.frames ?? [] : []}
              revealedRegisters={state.resolution?.turnNumber === state.programming?.turnNumber && playbackPhase !== 'idle'
                ? [1, 2, 3, 4, 5].filter((register) => register <= revealedRegisterCount) : []}
              activeRegister={actorIsExecuting && player.uid === playbackActorUid ? playbackRegister : null} />
          {:else if qr}
            <a
              class="seat-join"
              href={qr.url}
              aria-label={`Join tabletop ${roomCode} at position ${seat}`}
            >
              <img src={qr.image} alt={`QR code to join position ${seat}`} />
              <span
                ><strong>SCAN TO JOIN</strong><small>Position {seat}</small></span
              >
            </a>
          {:else}
            <span class="qr-placeholder">Generating join code…</span>
          {/if}
        </article>
        </div>
      {/if}
    {/each}

    {#if state.setup}
      {#each raceRoster(state) as player, index (player.uid)}
        {@const seat = player.seat ?? 1}
        <div class="gutter" data-log-seat={seat}
          data-testid={index === 0 ? (waitingPlayer ? 'tabletop-damage-prompt' : playbackPhase === 'countdown' ? 'tabletop-program-countdown' : playbackPhase === 'register' ? 'tabletop-register-playback' : undefined) : undefined}
          data-register={playbackRegister} data-stage={playbackStage} data-frame={playbackFrameIndex}
          data-production-duration-ms={playbackProductionDurationMs}
          style={`grid-column:${seat <= 4 ? 2 : 4};grid-row:${seat <= 4 ? seat : 9 - seat}`}>
          <TabletopGutterLog playerName={player.name} announce={index === 0}
            rotation={seatRotations[seat] ?? defaultSeatRotation(seat, 'side-seats')}
            trace={gutterTrace} heading={gutterHeading} detail={gutterDetail} waiting={!!waitingPlayer} />
        </div>
      {/each}
    {/if}

    <div
      class:playback-active={playbackPhase === "register" && !!playbackRegister}
      class:decision-active={!!waitingPlayer}
      class="course-wrap"
      data-review-replay={manualReplayActive}
    >
      {#if state.setup}
        <CourseBoard
          setup={state.setup}
          scenario={playbackScenario ?? (resolutionPlaybackKey !== playbackKey ? state.resolution?.initialScenario : state.resolution?.scenario)}
          robots={presentedRobots}
          animateRobots={playbackIsActive}
          transitionDurationMs={Math.max(0, playbackTransitionMs - robotCueMs)}
          movementDelayMs={robotCueMs}
          activeRobotUid={actorIsExecuting ? playbackActorUid ?? undefined : undefined}
          laserBeams={presentationSettled && !manualReplayActive ? [] : playbackLaserBeams}
          presentationOnly
        />
        {#if manualReplayAvailable && !finishOverlayVisible}
          <button class="round-replay" type="button" onclick={replayCompletedRound}>
            Fast replay · Turn {state.resolution?.turnNumber}
          </button>
        {/if}
      {:else}
        <div class="course-control" aria-label="Tabletop race configuration">
          <AddComputer {state} {services} {roomCode} />
          <div>
            <span>COURSE CONTROL</span>
            <strong
              >{state.configuration
                ? selectedCourse.name
                : "Configure the race"}</strong
            >
            <small>
              {state.players.length < 2
                ? "Add computers or invite racers to fill at least two positions."
                : state.configuration
                  ? `${state.readyPlayerUids.length}/${state.players.length} racers ready.`
                  : "Choose the shared course and settings here on the table."}
            </small>
          </div>
          <form
            onsubmit={(event) => {
              event.preventDefault();
              void configureCourse();
            }}
          >
            <label>
              Course
              <select bind:value={selectedCourseId} aria-label="Course">
                {#each PLAYABLE_COURSE_IDS as courseId}
                  {@const course = PUBLISHED_COURSES_BY_ID.get(courseId)!}
                  <option
                    value={courseId}
                    disabled={!course.players.includes(state.players.length)}
                  >
                    {course.name} ({course.players[0]}–{course.players.at(-1)} players)
                  </option>
                {/each}
                {#if import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"}
                  <option value="risky-exchange-a"
                    >Risky Exchange test Dock A (2–8 players)</option
                  >
                  <option value="option-lab">Option Lab (2–8 players)</option>
                {/if}
              </select>
            </label>
              <ScenarioTeams courseId={selectedCourseId} players={state.players} bind:assignments={teamAssignments} />
            <label>
              Starting lives
              <select bind:value={setupLives} aria-label="Starting Lives">
                <option value={3}>3 Lives</option>
                <option value={4} disabled={state.players.length < 5}
                  >4 Lives (5+ racers)</option
                >
              </select>
            </label>
            <button
              type="submit"
              disabled={pending ||
                state.players.length < 2 ||
                (!selectedCourseSupportsRoom || !validateScenarioTeams(selectedCourseId, scenarioTeamAssignments(selectedCourseId, state.players, teamAssignments)))}
            >
              {pending
                ? "CONFIGURING…"
                : state.configuration
                  ? "REPLACE CONFIGURATION"
                  : "CONFIGURE RACE"}
            </button>
          </form>
          {#if state.configuration}
            <p class="configured">
              {PUBLISHED_COURSES_BY_ID.get(state.configuration.courseId)?.name} ·
              {state.configuration.lives} lives
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</main>

<style>
  .scenario-setup { position: absolute; right: 1rem; top: 35%; max-width: 20vw; z-index: 5; }
  :global(*) {
    box-sizing: border-box;
  }
  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #111718;
    color: #eef4ee;
    font-family: "Atkinson Hyperlegible", sans-serif;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .tabletop {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    /* Rotating edge cards must not create a focus-scrollable viewport. */
    overflow: clip;
    padding: 4px;
    background: radial-gradient(circle at center, #263637, #0c1112 72%);
  }
  .table-error {
    position: fixed;
    z-index: 60;
    top: 8px;
    left: 50%;
    width: min(90vw, 900px);
    margin: 0;
    padding: 10px;
    border: 1px solid #ffbf69;
    border-radius: 6px;
    color: #ffbf69;
    background: #16100fee;
    font-size: 18px;
    text-align: center;
    transform: translateX(-50%);
  }
  .round-replay {
    position: absolute;
    z-index: 18;
    left: 50%;
    bottom: clamp(8px, 1.2vw, 22px);
    min-height: 44px;
    padding: 8px 16px;
    border: 2px solid #d2ff37;
    border-radius: 6px;
    color: #101718;
    background: #d2ff37;
    font: 700 clamp(12px, 1.2vw, 20px) "Space Mono", monospace;
    text-transform: uppercase;
    transform: translateX(-50%);
    box-shadow: 0 4px 18px #000b;
  }
  .race-finish-overlay {
    position: fixed;
    z-index: 55;
    inset: 0;
    display: grid;
    padding: clamp(16px, 5vw, 70px);
    place-items: center;
    background: #050909e8;
  }
  .race-finish-overlay > div {
    display: grid;
    width: min(92vw, 1000px);
    gap: clamp(12px, 2vh, 28px);
    justify-items: center;
    padding: clamp(24px, 5vw, 70px);
    border: 4px solid #d2ff37;
    border-radius: 18px;
    background: radial-gradient(circle at top, #243739, #0c1213 72%);
    box-shadow: 0 0 80px #d2ff3744;
    text-align: center;
  }
  .race-finish-overlay span {
    color: #ffcf4b;
    font:
      700 clamp(20px, 3vw, 42px) "Space Mono",
      monospace;
    letter-spacing: 0.14em;
  }
  .race-finish-overlay h1 {
    margin: 0;
    color: #d2ff37;
    font:
      700 clamp(48px, 10vw, 150px) / 0.95 "Space Mono",
      monospace;
    text-shadow: 0 0 32px #d2ff3766;
    text-transform: uppercase;
  }
  .race-finish-overlay p {
    margin: 0;
    color: #eef4ee;
    font-size: clamp(18px, 2.4vw, 34px);
  }
  .finish-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 14px;
  }
  .finish-actions button {
    min-height: 58px;
    padding: 10px 24px;
    border: 2px solid #d2ff37;
    border-radius: 6px;
    color: #101718;
    background: #d2ff37;
    font:
      700 clamp(15px, 1.8vw, 24px) "Space Mono",
      monospace;
  }
  .finish-actions button.new-game {
    border-color: #eef4ee;
    color: #eef4ee;
    background: transparent;
  }
  .finish-actions button:disabled {
    opacity: 0.55;
  }
  .table {
    position: relative;
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    gap: clamp(4px, 0.75vw, 24px);
    margin: 0;
  }
  .table.top-bottom-seats {
    grid-template-columns: repeat(4, minmax(78px, 1fr));
    grid-template-rows: clamp(120px, 22vh, 520px) minmax(0, 1fr) clamp(
        120px,
        22vh,
        520px
      );
  }
  .table.side-seats {
    grid-template-columns: clamp(78px, 20vw, 720px) minmax(0, 1fr) clamp(
        78px,
        20vw,
        720px
      );
    grid-template-rows: repeat(4, minmax(0, 1fr));
  }
  .table.playing {
    grid-template-columns: repeat(2, minmax(0, 1fr))
      min(40vw, calc(98vh * var(--course-aspect))) repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: clamp(4px, 0.45vw, 14px);
  }
  .table.playing .course-wrap { grid-column: 3; grid-row: 1 / -1; }
  .table.playing .seat-1 { grid-column: 1; grid-row: 1; }
  .table.playing .seat-2 { grid-column: 1; grid-row: 2; }
  .table.playing .seat-3 { grid-column: 1; grid-row: 3; }
  .table.playing .seat-4 { grid-column: 1; grid-row: 4; }
  .table.playing .seat-5 { grid-column: 5; grid-row: 4; }
  .table.playing .seat-6 { grid-column: 5; grid-row: 3; }
  .table.playing .seat-7 { grid-column: 5; grid-row: 2; }
  .table.playing .seat-8 { grid-column: 5; grid-row: 1; }
  .seat-slot:nth-child(-n+4) { justify-items: start; }
  .seat-slot:nth-child(n+5) { justify-items: end; }
  .table.playing .seat-slot { justify-items: start; }
  .table.playing :is(.seat-5, .seat-6, .seat-7, .seat-8) { justify-items: end; }
  .gutter { min-width: 0; min-height: 0; display: grid; align-items: center; container-type: size; }
  /* Recover the unused width beside a mat when its row limits its square size. */
  .gutter:is([data-log-seat="1"], [data-log-seat="2"], [data-log-seat="3"], [data-log-seat="4"]) :global(.log-slot) {
    margin-left: calc(-1 * max(0px, 100cqw - 100cqh));
  }
  .course-wrap {
    container-type: size;
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 4px;
    border: 2px solid #6f7e7f;
    border-radius: 16px;
    background: #090d0e;
    box-shadow: 0 16px 50px #050707aa;
  }
  .top-bottom-seats .course-wrap {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .side-seats .course-wrap {
    grid-column: 2;
    grid-row: 1 / -1;
  }
  .course-wrap :global(.course-panel),
  .course-wrap :global(.board-viewport) {
    height: 100%;
  }
  .seat-slot {
    container-type: size;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
  }
  .seat {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    box-sizing: border-box;
    container-type: size;
    z-index: 2;
    display: grid;
    gap: clamp(3px, 1cqh, 10px);
    align-content: start;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: clamp(4px, 0.65vw, 24px);
    border: clamp(1px, 0.12vw, 3px) solid #4b5a5c;
    border-radius: clamp(7px, 0.6vw, 16px);
    background: #11191aee;
    box-shadow: 0 7px 18px #05070799;
  }
  .seat { transition: transform 350ms ease-in-out; }
  @media (prefers-reduced-motion: reduce) { .seat { transition: none; } }
  .seat.open {
    width: 100%;
    height: 100%;
    transform: none !important;
    border-color: #7e9130;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .seat.executing {
    border-color: #ffe493;
    box-shadow: inset 0 0 26px #ffcb4055, 0 0 18px 3px #ffc43ba6;
  }
  .seat.awaiting-decision {
    border-color: #ffcf4b;
    box-shadow: inset 0 0 20px #ffcf4b55, 0 0 18px #ffcf4b99;
  }
  .seat.awaiting-decision .seat-head span {
    padding: 2px 4px;
    color: #11191a;
    background: #ffcf4b;
    font-size: clamp(7px, 4cqw, 13px);
    font-weight: 700;
  }
  .top-bottom-seats .seat-1 {
    grid-column: 1;
    grid-row: 1;
  }
  .top-bottom-seats .seat-2 {
    grid-column: 2;
    grid-row: 1;
  }
  .top-bottom-seats .seat-3 {
    grid-column: 3;
    grid-row: 1;
  }
  .top-bottom-seats .seat-4 {
    grid-column: 4;
    grid-row: 1;
  }
  .top-bottom-seats .seat-5 {
    grid-column: 4;
    grid-row: 3;
  }
  .top-bottom-seats .seat-6 {
    grid-column: 3;
    grid-row: 3;
  }
  .top-bottom-seats .seat-7 {
    grid-column: 2;
    grid-row: 3;
  }
  .top-bottom-seats .seat-8 {
    grid-column: 1;
    grid-row: 3;
  }
  .side-seats .seat-1 {
    grid-column: 1;
    grid-row: 1;
  }
  .side-seats .seat-2 {
    grid-column: 1;
    grid-row: 2;
  }
  .side-seats .seat-3 {
    grid-column: 1;
    grid-row: 3;
  }
  .side-seats .seat-4 {
    grid-column: 1;
    grid-row: 4;
  }
  .side-seats .seat-5 {
    grid-column: 3;
    grid-row: 4;
  }
  .side-seats .seat-6 {
    grid-column: 3;
    grid-row: 3;
  }
  .side-seats .seat-7 {
    grid-column: 3;
    grid-row: 2;
  }
  .side-seats .seat-8 {
    grid-column: 3;
    grid-row: 1;
  }
  .seat-head {
    display: flex;
    justify-content: space-between;
    color: #d2ff37;
    font:
      clamp(10px, 4cqh, 24px) "Space Mono",
      monospace;
  }
  .seat-robot { padding-top: 5px; }
  .seat-head span {
    color: #ffcf4b;
    margin-left: auto;
  }
  .seat-head { align-items: center; gap: 6px; }
  .rotate-seat {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: clamp(24px, 9cqw, 44px);
    height: clamp(24px, 9cqw, 44px);
    padding: 0;
    border: 1px solid #657577;
    border-radius: 50%;
    color: #d2ff37;
    background: #202b2d;
    font-size: clamp(18px, 6cqw, 32px);
    line-height: 1;
    cursor: pointer;
  }
  .rotate-seat:hover { background: #344245; }
  .rotate-seat:focus-visible { outline: 2px solid #d2ff37; outline-offset: 2px; }
  .seat-join {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    gap: clamp(4px, 1cqh, 10px);
    color: #eef4ee;
    text-decoration: none;
  }
  .seat-join img {
    display: block;
    width: min(100%, calc(100cqh - 52px));
    max-height: 100%;
    aspect-ratio: 1;
    border: 3px solid #eef4ee;
    border-radius: 5px;
    background: #eef4ee;
    image-rendering: pixelated;
    object-fit: contain;
  }
  .seat-join span {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    text-align: center;
  }
  .seat-join strong {
    color: #d2ff37;
    font:
      700 clamp(12px, 1.1vw, 18px) "Space Mono",
      monospace;
  }
  .seat-join small,
  .qr-placeholder {
    color: #aebbb9;
    font-size: 14px;
  }
  @container (width < 130px) {
    .seat-join {
      gap: 2px;
    }
    .seat-join img {
      width: min(100%, calc(100cqh - 24px));
      border-width: 2px;
    }
    .seat-join span {
      display: none;
    }
  }
  .course-control {
    display: grid;
    height: 100%;
    max-width: 920px;
    margin: auto;
    place-content: center;
    gap: 24px;
    padding: 30px;
  }
  .course-control > div {
    display: grid;
    gap: 8px;
    text-align: center;
  }
  .course-control > div span {
    color: #d2ff37;
    font:
      700 20px "Space Mono",
      monospace;
  }
  .course-control > div strong {
    font:
      700 clamp(32px, 5vw, 66px) "Space Mono",
      monospace;
    text-transform: uppercase;
  }
  .course-control > div small {
    color: #aebbb9;
    font-size: 20px;
  }
  .course-control form {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: end;
    gap: 12px;
  }
  .course-control label {
    display: grid;
    min-width: 0;
    gap: 6px;
    color: #d2ff37;
    font:
      700 14px "Space Mono",
      monospace;
    text-transform: uppercase;
  }
  .course-control :is(select, button) {
    width: 100%;
    min-width: 0;
    min-height: 52px;
    border: 1px solid #657577;
    padding: 8px 12px;
    color: #eef4ee;
    background: #101718;
    font:
      700 16px "Atkinson Hyperlegible",
      sans-serif;
  }
  .course-control button {
    border-color: #d2ff37;
    color: #101718;
    background: #d2ff37;
    font-family: "Space Mono", monospace;
  }
  .course-control button:disabled {
    opacity: 0.45;
  }
  .configured {
    margin: 0;
    color: #ffcf4b;
    font:
      700 15px "Space Mono",
      monospace;
    text-align: center;
    text-transform: uppercase;
  }
  @media (max-width: 1100px) {
    .course-control form {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 700px) {
    .course-control {
      gap: 10px;
      padding: 6px;
    }
    .course-control > div strong {
      font-size: 24px;
    }
    .course-control > div small {
      font-size: 14px;
    }
    .course-control form {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .course-control :is(select, button) {
      min-height: 38px;
      padding: 4px;
      font-size: 12px;
    }
    .seat-join {
      display: block;
    }
    .seat-join img {
      width: min(100%, 72px);
      margin: auto;
    }
    .seat-join span {
      display: none;
    }
  }
</style>
