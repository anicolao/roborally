<script lang="ts">
  import "@fontsource/atkinson-hyperlegible/400.css";
  import "@fontsource/atkinson-hyperlegible/700.css";
  import "@fontsource/space-mono/400.css";
  import "@fontsource/space-mono/700.css";
  import { base } from "$app/paths";
  import { onDestroy, onMount, tick } from "svelte";
  import QRCode from "qrcode";
  import CourseBoard from "$lib/components/CourseBoard.svelte";
  import OptionCardFace from "$lib/components/OptionCardFace.svelte";
  import ProgramCardFace from "$lib/components/ProgramCardFace.svelte";
  import TabletopOptionShelf from "$lib/components/TabletopOptionShelf.svelte";
  import { initializeFirebase, type FirebaseServices } from "$lib/firebase";
  import {
    MAX_ROOM_PLAYERS,
    ROBOTS,
    emptyRoomState,
    normalizeRoomCode,
    presentationDecisionKey,
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
  import {
    OPTION_CARDS_BY_ID,
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
  import { revealPresentationDecisionWithRetry } from "$lib/presentation-reveal";
  import {
    firstChangedPlaybackFrame,
    robotsForPlaybackPresentation,
  } from "$lib/playback-presentation";

  type SeatQr = { seat: number; url: string; image: string };
  type PlaybackPhase = "idle" | "countdown" | "register" | "complete";
  type OptionInspection = {
    playerName: string;
    cardIds: OptionCardId[];
    selectedCardId: OptionCardId;
  };

  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = "";
  let status = "Preparing a new tabletop…";
  let error = "";
  let pending = false;
  let seatQrs: SeatQr[] = [];
  let selectedCourseId: PlayableCourseId = "risky-exchange";
  let setupSeed = "RALLY-2005";
  let setupLives: 3 | 4 = 3;
  let e2eRematchRoomCode = "";
  let unsubscribe: Unsubscribe | undefined;
  let playbackPhase: PlaybackPhase = "idle";
  let playbackCountdown = 3;
  let playbackRegister: number | null = null;
  let playbackStage: ProgramPlayback["frames"][number]["stage"] | null = null;
  let playbackActorUid: string | null = null;
  let playbackCardId: ProgramCard["id"] | null = null;
  let playbackRobots: RaceRobotPosition[] | undefined;
  let playbackTrace: ProgramPlayback["frames"][number]["trace"] = [];
  let playbackLaserBeams: ProgramPlayback["frames"][number]["laserBeams"] = [];
  let playbackFrameIndex = 0;
  let playbackFrameCount = 0;
  let playbackProductionDurationMs = 2_000;
  let playbackKey = "";
  let scheduledPlayback: ProgramPlayback | undefined;
  let queuedPlayback:
    | { playback: ProgramPlayback; fromIndex: number }
    | undefined;
  let attemptedDecisionReveal = "";
  let tabletopMounted = false;
  let optionInspection: OptionInspection | undefined;
  let optionInspector: HTMLDivElement | undefined;
  let playbackTimers: PlaybackTimer[] = [];
  const PRODUCTION_PROGRAM_CARD_MS = 2_000;
  const PRODUCTION_FACTORY_STAGE_MS = 1_000;
  const PRODUCTION_COUNTDOWN_STEP_MS = 1_000;
  const playbackTimeScale =
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? 0.1 : 1;

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
    playbackProductionDurationMs * playbackTimeScale,
  );
  $: countdownStepMs = Math.round(
    PRODUCTION_COUNTDOWN_STEP_MS * playbackTimeScale,
  );
  $: playbackCard = PROGRAM_CARDS.find(({ id }) => id === playbackCardId);
  $: playbackStageLabel =
    playbackStage === "program-card"
      ? `${state.players.find(({ uid }) => uid === playbackActorUid)?.name ?? "Robot"} · ${playbackCard?.action.replaceAll("-", " ") ?? "Program card"} · priority ${playbackCard?.priority ?? "—"}`
      : playbackStage === "express-conveyors"
        ? "Express conveyors"
        : playbackStage === "conveyors"
          ? "All conveyors"
          : playbackStage === "pushers"
            ? "Pushers"
            : playbackStage === "gears"
              ? "Gears"
              : playbackStage === "lasers"
                ? "Robot and board lasers"
                : playbackStage === "laser-damage"
                  ? "Damage decision"
                  : "";
  $: resolutionPlaybackKey = state.resolution
    ? `${state.raceEpoch}:${state.resolution.turnNumber}`
    : "";
  $: presentedRobots = robotsForPlaybackPresentation(
    state.resolution,
    playbackRobots,
    resolutionPlaybackKey,
    playbackKey,
  );
  $: pendingPresentationDecisionKey = presentationDecisionKey(state);
  $: presentationDecisionVisible =
    !!pendingPresentationDecisionKey &&
    state.revealedDecisionKey === pendingPresentationDecisionKey;
  $: pendingOptionDecision =
    presentationDecisionVisible && playbackCaughtUp
      ? (state.resolution?.pendingOptionDecision ?? null)
      : null;
  $: pendingOptionRobot = state.resolution?.robots.find(
    ({ uid }) => uid === pendingOptionDecision?.uid,
  );
  $: inspectedOptionCard = optionInspection
    ? OPTION_CARDS_BY_ID.get(optionInspection.selectedCardId)
    : undefined;
  $: latestPlaybackEntry = playbackTrace.at(-1);
  $: finishWinners = (state.resolution?.summary?.winnerUids ?? [])
    .map((uid) => state.players.find((player) => player.uid === uid))
    .filter((player) => player !== undefined);
  $: finishOverlayVisible =
    state.resolution?.phase === "race-finished" &&
    !!state.resolution.summary &&
    !playbackIsActive &&
    playbackPhase === "complete";
  $: playbackCaughtUp =
    !!state.resolution &&
    (state.resolution.playback.frames.length === 0 ||
      (resolutionPlaybackKey === playbackKey &&
        playbackPhase === "complete" &&
        !!scheduledPlayback &&
        !queuedPlayback &&
        firstChangedPlaybackFrame(
          scheduledPlayback.frames,
          state.resolution.playback.frames,
        ) === null));

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
            requestedCourse === "option-lab"))
      ) {
        selectedCourseId = requestedCourse as PlayableCourseId;
      }
      if (params.get("lives") === "4") setupLives = 4;
      setupSeed = params.get("seed")?.slice(0, 64) || setupSeed;
      roomCode = requestedRoom || e2eRoom || RoomService.createRoomCode();

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
          status = error.message;
        },
      );
    } catch (nextError) {
      error =
        nextError instanceof Error
          ? nextError.message
          : "Could not connect to Firebase";
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

  function inspectOptions(
    playerName: string,
    cardIds: OptionCardId[],
    selectedCardId: OptionCardId,
  ) {
    optionInspection = { playerName, cardIds, selectedCardId };
    void tick().then(() => optionInspector?.focus());
  }

  function closeOptionInspection() {
    optionInspection = undefined;
  }

  function handleTabletopKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && optionInspection) closeOptionInspection();
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
    playbackTrace = [];
    playbackLaserBeams = [];
    playbackFrameIndex = 0;
    playbackFrameCount = 0;
    playbackProductionDurationMs = PRODUCTION_PROGRAM_CARD_MS;
    scheduledPlayback = undefined;
    queuedPlayback = undefined;
  }

  function schedulePlayback(callback: () => void, delay: number) {
    playbackTimers.push(schedulePlaybackTimer(callback, delay));
  }

  function productionDurationForFrame(
    frame: ProgramPlayback["frames"][number],
  ) {
    return frame.stage === "program-card"
      ? PRODUCTION_PROGRAM_CARD_MS
      : PRODUCTION_FACTORY_STAGE_MS;
  }

  function schedulePlaybackFrames(
    playback: ProgramPlayback,
    fromIndex: number,
    initialDelay: number,
  ) {
    playbackFrameCount = playback.frames.length;
    scheduledPlayback = playback;
    let frameStart = initialDelay;
    for (const [index, frame] of playback.frames.entries()) {
      if (index < fromIndex) continue;
      const productionDuration = productionDurationForFrame(frame);
      schedulePlayback(() => {
        playbackPhase = "register";
        playbackRegister = frame.register;
        playbackStage = frame.stage;
        playbackActorUid = frame.actorUid;
        playbackCardId = frame.cardId;
        playbackRobots = frame.robots;
        playbackTrace = frame.trace;
        playbackLaserBeams = frame.laserBeams ?? [];
        playbackFrameIndex = index + 1;
        playbackProductionDurationMs = productionDuration;
      }, frameStart);
      frameStart += Math.round(productionDuration * playbackTimeScale);
    }
    schedulePlayback(() => {
      if (queuedPlayback) {
        const continuation = queuedPlayback;
        queuedPlayback = undefined;
        clearPlaybackTimers();
        schedulePlaybackFrames(
          continuation.playback,
          continuation.fromIndex,
          0,
        );
        return;
      }
      playbackPhase = "complete";
      playbackRegister = null;
      playbackStage = null;
      playbackActorUid = null;
      playbackCardId = null;
      if (!state.resolution?.pendingOptionDecision) {
        playbackRobots = undefined;
        playbackLaserBeams = [];
      }
      playbackTrace = [];
    }, frameStart);
  }

  function startProgramPlayback(key: string, playback: ProgramPlayback) {
    resetProgramPlayback();
    playbackKey = key;
    playbackPhase = "countdown";
    playbackCountdown = 3;
    playbackRobots = playback.initialRobots;

    schedulePlayback(() => (playbackCountdown = 2), countdownStepMs);
    schedulePlayback(() => (playbackCountdown = 1), countdownStepMs * 2);
    schedulePlaybackFrames(playback, 0, countdownStepMs * 3);
  }

  function continueProgramPlayback(
    playback: ProgramPlayback,
    fromIndex: number,
  ) {
    clearPlaybackTimers();
    schedulePlaybackFrames(playback, fromIndex, 0);
  }

  $: {
    const resolution = state.resolution;
    if (
      resolution?.playback.frames.length &&
      resolutionPlaybackKey &&
      resolutionPlaybackKey !== playbackKey
    ) {
      startProgramPlayback(resolutionPlaybackKey, resolution.playback);
    } else if (
      resolution?.playback.frames.length &&
      resolutionPlaybackKey === playbackKey
    ) {
      const comparisonPlayback = queuedPlayback?.playback ?? scheduledPlayback;
      const changedFrame = comparisonPlayback
        ? firstChangedPlaybackFrame(
            comparisonPlayback.frames,
            resolution.playback.frames,
          )
        : null;
      if (changedFrame !== null) {
        if (playbackIsActive) {
          queuedPlayback = {
            playback: resolution.playback,
            fromIndex: Math.min(
              queuedPlayback?.fromIndex ?? changedFrame,
              changedFrame,
            ),
          };
        } else {
          continueProgramPlayback(resolution.playback, changedFrame);
        }
      }
    }
  }

  $: if (
    services &&
    pendingPresentationDecisionKey &&
    pendingPresentationDecisionKey !== state.revealedDecisionKey &&
    pendingPresentationDecisionKey !== attemptedDecisionReveal &&
    playbackCaughtUp
  ) {
    void revealCurrentPresentationDecision(pendingPresentationDecisionKey);
  }

  async function revealCurrentPresentationDecision(decisionKey: string) {
    if (!services) return;
    const activeServices = services;
    attemptedDecisionReveal = decisionKey;
    const synchronized = await revealPresentationDecisionWithRetry({
      reveal: async () => {
        if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
          window.__roborallyE2ePresentationRevealAttempts =
            (window.__roborallyE2ePresentationRevealAttempts ?? 0) + 1;
          if ((window.__roborallyE2ePresentationRevealFailures ?? 0) > 0) {
            window.__roborallyE2ePresentationRevealFailures! -= 1;
            throw new Error("Synthetic presentation checkpoint rejection.");
          }
        }
        await RoomService.revealPresentationDecision(
          activeServices.db,
          activeServices.user,
          roomCode,
          { decisionKey },
        );
      },
      shouldContinue: () =>
        tabletopMounted &&
        presentationDecisionKey(state) === decisionKey &&
        state.revealedDecisionKey !== decisionKey &&
        playbackCaughtUp,
      onRetry: (nextError, delay) => {
        console.error(nextError);
        error = `The tabletop could not synchronize the next player control. Retrying in ${Math.ceil(delay / 1_000)} seconds…`;
      },
      onSuccess: () => {
        if (
          error.startsWith(
            "The tabletop could not synchronize the next player control.",
          )
        ) {
          error = "";
        }
      },
    });
    if (!synchronized && attemptedDecisionReveal === decisionKey) {
      attemptedDecisionReveal = "";
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
          setupSeed.trim() || "RALLY-2005",
          setupLives,
        ),
      });
    } catch (nextError) {
      console.error(nextError);
      error = "The tabletop could not write the race configuration.";
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
<svelte:window onkeydown={handleTabletopKeydown} />

<main class="tabletop" data-e2e-tabletop data-room-code={roomCode}>
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

  {#if playbackPhase === "countdown"}
    <div
      class="program-countdown"
      role="timer"
      aria-live="assertive"
      data-testid="tabletop-program-countdown"
    >
      <small>ALL PROGRAMS LOCKED</small>
      {#key playbackCountdown}<strong>{playbackCountdown}</strong>{/key}
      <span>Movement incoming</span>
    </div>
  {/if}

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

  {#if optionInspection && inspectedOptionCard}
    <div
      class="option-inspector"
      role="dialog"
      aria-modal="true"
      aria-label={`${optionInspection.playerName} Options`}
      tabindex="-1"
      bind:this={optionInspector}
    >
      <section>
        <header>
          <div>
            <small>PUBLIC OPTION INSPECTION</small>
            <h2>{optionInspection.playerName}</h2>
          </div>
          <button
            type="button"
            aria-label="Close Option inspection"
            onclick={closeOptionInspection}>×</button
          >
        </header>
        {#if optionInspection.cardIds.length > 1}
          <div
            class="option-inspector-tabs"
            aria-label={`${optionInspection.playerName} additional Options`}
          >
            {#each optionInspection.cardIds as cardId}
              {@const card = OPTION_CARDS_BY_ID.get(cardId)}
              {#if card}
                <button
                  type="button"
                  class:selected={cardId === optionInspection.selectedCardId}
                  aria-pressed={cardId === optionInspection.selectedCardId}
                  aria-label={`Inspect ${card.name}`}
                  onclick={() => {
                    if (optionInspection)
                      optionInspection = {
                        ...optionInspection,
                        selectedCardId: cardId,
                      };
                  }}
                >
                  <img
                    src={`${base}/assets/options/${card.id}-poc.webp`}
                    alt=""
                  />
                  <span>{card.name}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}
        <OptionCardFace card={inspectedOptionCard} size="large" />
      </section>
    </div>
  {/if}

  <section
    class:side-seats={tabletopLayout === "side-seats"}
    class:top-bottom-seats={tabletopLayout === "top-bottom-seats"}
    class="table"
    aria-label="Shared tabletop"
    data-course-layout={tabletopLayout}
  >
    {#each Array(MAX_ROOM_PLAYERS) as _, index}
      {@const seat = index + 1}
      {@const player = state.players.find(
        (candidate) => candidate.seat === seat,
      )}
      {@const robot = player
        ? ROBOTS.find((entry) => entry.id === player.robotId)
        : undefined}
      {@const qr = seatQrs.find((candidate) => candidate.seat === seat)}
      <article
        class:open={!player}
        class={`seat seat-${seat}`}
        data-seat={seat}
        data-player-uid={player?.uid ?? ""}
      >
        <div class="seat-head">
          <b>D{String(seat).padStart(2, "0")}</b><span
            >{robot?.mark ?? "OPEN"}</span
          >
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
          <strong>{player.name}</strong>
          <small>{robot?.name}</small>
          <div
            class="robot-vitals"
            data-player-vitals={player.uid}
            aria-label={`${player.name}: ${lives} of ${startingLives} lives remaining, ${damage} damage taken and ${10 - damage} damage not yet taken, ${powerMode === "down" ? "powered down" : powerMode === "announced" ? "power down announced" : "active power"}`}
          >
            <div class="life-track" aria-hidden="true">
              <b>LIFE</b>
              {#each Array(startingLives) as _, lifeIndex}
                <i class:remaining={lifeIndex < lives}>◆</i>
              {/each}
            </div>
            <div class="damage-track" aria-hidden="true">
              <b>DMG</b>
              {#each Array(10) as _, damageIndex}
                <i
                  class:taken={damageIndex < damage}
                  class:available={damageIndex >= damage}
                ></i>
              {/each}
            </div>
            <div
              class="flag-track"
              aria-label={`${player.name} touched flags: ${touchedFlags.length ? touchedFlags.join(", ") : "none"}`}
            >
              <b>FLAGS</b>
              {#each layoutCourse.course.flags as flag}
                <i class:touched={touchedFlags.includes(flag.number)}
                  >{flag.number}</i
                >
              {/each}
            </div>
            <div
              class:down={powerMode === "down"}
              class:announced={powerMode === "announced"}
              class="power-state"
            >
              <i></i>
              <span
                >{powerMode === "down"
                  ? "POWERED DOWN"
                  : powerMode === "announced"
                    ? "SHUTDOWN NEXT"
                    : "ACTIVE"}</span
              >
            </div>
          </div>
          {#if optionCardIds.length > 0}
            <TabletopOptionShelf
              playerName={player.name}
              cardIds={optionCardIds}
              oninspect={(cardIds, selectedCardId) =>
                inspectOptions(player.name, cardIds, selectedCardId)}
            />
          {/if}
          <div
            class="program-cards"
            aria-label={`${player.name} program cards`}
          >
            {#each Array(5) as _, cardIndex}
              {@const programPlayer = state.programming?.players.find(
                (entry) => entry.uid === player.uid,
              )}
              {@const resolutionIsCurrent =
                state.resolution?.turnNumber === state.programming?.turnNumber}
              {@const revealed =
                resolutionIsCurrent &&
                (playbackPhase === "complete" ||
                  (playbackPhase === "register" &&
                    cardIndex + 1 <= (playbackRegister ?? 0)))}
              {@const cardId = programPlayer?.registers[cardIndex]?.cardId}
              {@const card = PROGRAM_CARDS.find((entry) => entry.id === cardId)}
              <span class:revealed class="program-card">
                {#if revealed && card}
                  <ProgramCardFace {card} compact variant="square" />
                {:else}
                  <span class="program-card-back" aria-hidden="true">●</span>
                {/if}
              </span>
            {/each}
          </div>
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
    {/each}

    <div
      class:playback-active={playbackPhase === "register" && !!playbackRegister}
      class:decision-active={!!pendingOptionDecision && !!pendingOptionRobot}
      class="course-wrap"
    >
      {#if state.setup}
        <CourseBoard
          setup={state.setup}
          robots={presentedRobots}
          animateRobots={playbackIsActive}
          transitionDurationMs={playbackTransitionMs}
          laserBeams={playbackLaserBeams}
          presentationOnly
        />
        {#if pendingOptionDecision && pendingOptionRobot}
          <div
            class:side-facing={tabletopLayout === "side-seats"}
            class="course-decision"
            role="status"
            aria-live="assertive"
            data-testid="tabletop-damage-prompt"
            data-decision-id={pendingOptionDecision.decisionId}
          >
            {#each ["near", "far"] as position}
              <div
                class:near={position === "near"}
                class:far={position === "far"}
                class="decision-copy"
                aria-hidden={position === "far"}
                data-table-facing={tabletopLayout === "side-seats"
                  ? position === "near"
                    ? "west"
                    : "east"
                  : position === "near"
                    ? "north"
                    : "south"}
              >
                <small
                  >{pendingOptionDecision.timing === "damage"
                    ? "DAMAGE DECISION"
                    : "OPTION DECISION"} · DOCK ORDER</small
                >
                <strong>{pendingOptionRobot.name}</strong>
                <span>{pendingOptionDecision.tabletopPrompt}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if playbackPhase === "register" && playbackRegister}
          <div
            class:side-facing={tabletopLayout === "side-seats"}
            class="course-playback"
            role="status"
            aria-live="polite"
            data-testid="tabletop-register-playback"
            data-register={playbackRegister}
            data-stage={playbackStage}
            data-frame={playbackFrameIndex}
            data-production-duration-ms={playbackProductionDurationMs}
          >
            {#each ["near", "far"] as position}
              <div
                class:near={position === "near"}
                class:far={position === "far"}
                class="playback-copy"
                aria-hidden={position === "far"}
                data-table-facing={tabletopLayout === "side-seats"
                  ? position === "near"
                    ? "west"
                    : "east"
                  : position === "near"
                    ? "north"
                    : "south"}
              >
                <strong>REGISTER {playbackRegister}</strong>
                <b>{playbackStageLabel}</b>
                <span
                  >{latestPlaybackEntry?.text ??
                    `${playbackStageLabel} resolved with no movement`}</span
                >
                <i
                  style={`--playback-progress:${playbackFrameIndex / playbackFrameCount}`}
                ></i>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="course-control" aria-label="Tabletop race configuration">
          <div>
            <span>COURSE CONTROL</span>
            <strong
              >{state.configuration
                ? selectedCourse.name
                : "Configure the race"}</strong
            >
            <small>
              {state.players.length < 2
                ? "At least two racers must scan a position before setup."
                : state.configuration
                  ? `${state.readyPlayerUids.length}/${state.players.length} racers ready on their phones.`
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
                  <option value="option-lab">Option Lab (2–8 players)</option>
                {/if}
              </select>
            </label>
            <label>
              Setup seed
              <input
                bind:value={setupSeed}
                maxlength="64"
                aria-label="Setup seed"
              />
            </label>
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
                !selectedCourseSupportsRoom}
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
              seed {state.configuration.seed} · {state.configuration.lives} lives
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</main>

<style>
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
    overflow: hidden;
    padding: clamp(4px, 0.75vw, 24px);
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
  .program-countdown {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: grid;
    place-content: center;
    place-items: center;
    background: #050909dd;
    font-family: "Space Mono", monospace;
    text-transform: uppercase;
  }
  .program-countdown small {
    color: #d2ff37;
    font-size: clamp(18px, 3vw, 38px);
    letter-spacing: 0.12em;
  }
  .program-countdown strong {
    color: #eef4ee;
    font-size: clamp(150px, 35vw, 420px);
    line-height: 0.9;
    text-shadow: 0 0 45px #d2ff3788;
  }
  .program-countdown span {
    color: #ffcf4b;
    font-size: clamp(22px, 4vw, 50px);
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
  .option-inspector {
    position: fixed;
    z-index: 58;
    inset: 0;
    display: grid;
    padding: clamp(16px, 4vw, 100px);
    place-items: center;
    background: #050909e8;
  }
  .option-inspector > section {
    display: grid;
    width: min(92vw, 1200px);
    max-height: 94vh;
    gap: clamp(10px, 1.4vh, 24px);
    justify-items: center;
    overflow: auto;
    padding: clamp(14px, 2vw, 36px);
    border: 3px solid #ffcf4b;
    border-radius: 18px;
    background: radial-gradient(circle at top, #26383a, #0c1213 72%);
    box-shadow: 0 0 80px #ffcf4b33;
  }
  .option-inspector header {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .option-inspector header div {
    display: grid;
    gap: 3px;
  }
  .option-inspector header small {
    color: #ffcf4b;
    font:
      700 clamp(11px, 0.8vw, 18px) "Space Mono",
      monospace;
    letter-spacing: 0.12em;
  }
  .option-inspector h2 {
    margin: 0;
    font:
      700 clamp(28px, 3vw, 58px) / 1 "Space Mono",
      monospace;
    text-transform: uppercase;
  }
  .option-inspector header > button {
    width: clamp(44px, 3vw, 70px);
    height: clamp(44px, 3vw, 70px);
    flex: 0 0 auto;
    border: 2px solid #ffcf4b;
    border-radius: 50%;
    color: #ffcf4b;
    background: #11191a;
    font:
      700 clamp(28px, 2vw, 48px) / 1 "Atkinson Hyperlegible",
      sans-serif;
  }
  .option-inspector :global(.option-card) {
    width: min(76vw, 1080px);
    height: auto;
    aspect-ratio: 3 / 2;
  }
  .option-inspector-tabs {
    display: flex;
    width: 100%;
    gap: clamp(6px, 0.7vw, 14px);
    overflow-x: auto;
    padding: 4px;
  }
  .option-inspector-tabs button {
    display: grid;
    width: clamp(88px, 8vw, 150px);
    flex: 0 0 auto;
    grid-template-columns: clamp(30px, 3vw, 54px) minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    padding: 5px;
    border: 2px solid #59686a;
    border-radius: 8px;
    color: #eef4ee;
    background: #11191a;
    font:
      700 clamp(11px, 0.8vw, 16px) / 1.05 "Atkinson Hyperlegible",
      sans-serif;
    text-align: left;
  }
  .option-inspector-tabs button.selected {
    border-color: #d2ff37;
    color: #d2ff37;
    box-shadow: 0 0 12px #d2ff3744;
  }
  .option-inspector-tabs img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }
  .option-inspector-tabs span {
    overflow-wrap: anywhere;
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
  .course-wrap {
    --playback-gutter-width: clamp(38px, 8vw, 140px);
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
  .course-wrap.playback-active :global(.course-panel.presentation-only),
  .course-wrap.decision-active :global(.course-panel.presentation-only) {
    padding-inline: var(--playback-gutter-width);
  }
  .course-playback,
  .course-decision {
    position: absolute;
    z-index: 3;
    inset: 4px;
    overflow: hidden;
    pointer-events: none;
  }
  .playback-copy,
  .decision-copy {
    position: absolute;
    top: 0;
    bottom: 0;
    display: grid;
    width: var(--playback-gutter-width);
    min-width: 0;
    grid-template-rows: auto auto minmax(0, 1fr) 7px;
    align-content: start;
    gap: clamp(5px, 1vh, 12px);
    padding: clamp(7px, 1vw, 14px);
    border: 2px solid #d2ff37;
    border-radius: 8px;
    color: #eef4ee;
    background: #0b1212f2;
    box-shadow: 0 0 24px #000a;
    font-family: "Space Mono", monospace;
  }
  .playback-copy.near,
  .decision-copy.near {
    left: 0;
  }
  .playback-copy.far,
  .decision-copy.far {
    right: 0;
    transform: rotate(180deg);
  }
  .playback-copy strong {
    color: #d2ff37;
    font-size: clamp(14px, 1.5vw, 24px);
    line-height: 1;
    text-transform: uppercase;
  }
  .playback-copy b {
    color: #ffcf4b;
    font-size: clamp(11px, 1vw, 17px);
    line-height: 1.12;
    text-transform: uppercase;
  }
  .playback-copy span {
    overflow: hidden;
    font-size: clamp(11px, 0.9vw, 16px);
    line-height: 1.18;
    overflow-wrap: anywhere;
  }
  .playback-copy i {
    display: block;
    align-self: end;
    background: linear-gradient(
      90deg,
      #d2ff37 0 calc(var(--playback-progress) * 100%),
      #344043 calc(var(--playback-progress) * 100%) 100%
    );
  }
  .decision-copy {
    grid-template-rows: auto auto minmax(0, 1fr);
    border-color: #ff4545;
    box-shadow:
      0 0 24px #ff202033,
      0 0 24px #000a;
  }
  .decision-copy small {
    color: #ffcf4b;
    font-size: clamp(10px, 0.8vw, 14px);
    font-weight: 700;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .decision-copy strong {
    overflow: hidden;
    color: #fff;
    font-size: clamp(16px, 1.8vw, 28px);
    line-height: 1;
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }
  .decision-copy span {
    overflow: hidden;
    font-size: clamp(11px, 0.9vw, 16px);
    line-height: 1.18;
    overflow-wrap: anywhere;
  }
  .course-playback.side-facing .playback-copy,
  .course-decision.side-facing .decision-copy {
    top: 0;
    bottom: auto;
    width: 100cqh;
    height: var(--playback-gutter-width);
    grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 7px;
    align-items: center;
  }
  .course-playback.side-facing .playback-copy.near,
  .course-decision.side-facing .decision-copy.near {
    left: var(--playback-gutter-width);
    transform: rotate(90deg);
    transform-origin: top left;
  }
  .course-playback.side-facing .playback-copy.far,
  .course-decision.side-facing .decision-copy.far {
    top: 100%;
    right: auto;
    left: calc(100% - var(--playback-gutter-width));
    transform: rotate(-90deg);
    transform-origin: top left;
  }
  .course-playback.side-facing .playback-copy span {
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .course-playback.side-facing .playback-copy i {
    grid-column: 1 / -1;
  }
  .course-decision.side-facing .decision-copy {
    grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  .course-decision.side-facing .decision-copy span {
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .seat {
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
  .seat.open {
    border-color: #7e9130;
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
  .seat-head span {
    color: #ffcf4b;
  }
  .seat > strong {
    overflow: hidden;
    font-size: clamp(14px, 7cqh, 42px);
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seat > small {
    color: #9caaac;
    font-size: clamp(10px, 3.5cqh, 22px);
  }
  .robot-vitals {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: clamp(3px, 1cqh, 8px) clamp(4px, 1cqw, 12px);
    margin-top: clamp(1px, 0.7cqh, 6px);
    font-family: "Space Mono", monospace;
  }
  .life-track,
  .damage-track {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 3px;
  }
  .life-track {
    grid-column: 1;
  }
  .damage-track {
    grid-column: 1 / -1;
  }
  .flag-track {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .robot-vitals b {
    width: clamp(26px, 5cqw, 54px);
    flex: 0 0 clamp(26px, 5cqw, 54px);
    color: #849294;
    font-size: clamp(8px, 2.4cqh, 15px);
    letter-spacing: 0.08em;
  }
  .life-track i {
    color: #394648;
    font-size: clamp(11px, 3.5cqh, 24px);
    font-style: normal;
    line-height: 1;
  }
  .life-track i.remaining {
    color: #d2ff37;
    filter: drop-shadow(0 0 3px #d2ff3788);
  }
  .damage-track i {
    height: clamp(7px, 2.5cqh, 15px);
    min-width: 4px;
    flex: 1;
    border: 1px solid #4c5a5d;
    border-radius: 2px;
    background: #202b2d;
  }
  .damage-track i.taken {
    border-color: #ff684f;
    background: #ff684f;
    box-shadow: 0 0 3px #ff684f99;
  }
  .flag-track i {
    display: grid;
    width: clamp(16px, 4cqh, 30px);
    height: clamp(16px, 4cqh, 30px);
    place-items: center;
    border: 1px solid #526164;
    border-radius: 50%;
    color: #718083;
    background: #202b2d;
    font:
      700 clamp(8px, 2.2cqh, 14px) "Space Mono",
      monospace;
    font-style: normal;
  }
  .flag-track i.touched {
    border-color: #ffcf4b;
    color: #111718;
    background: #ffcf4b;
    box-shadow: 0 0 6px #ffcf4b99;
  }
  .power-state {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    gap: 5px;
    color: #9ff07f;
    font-size: clamp(8px, 2.2cqh, 14px);
    white-space: nowrap;
  }
  .power-state i {
    width: clamp(8px, 2.5cqh, 16px);
    height: clamp(8px, 2.5cqh, 16px);
    border: 2px solid #263126;
    border-radius: 50%;
    background: #8dff69;
    box-shadow: 0 0 6px #8dff69;
  }
  .power-state.announced {
    color: #ffcf4b;
  }
  .power-state.announced i {
    border-color: #3a3218;
    background: #ffcf4b;
    box-shadow: 0 0 6px #ffcf4b;
  }
  .power-state.down {
    color: #ff887d;
  }
  .power-state.down i {
    border-color: #482522;
    background: #ff684f;
    box-shadow: 0 0 6px #ff684f;
  }
  .seat-join {
    display: grid;
    grid-template-columns: minmax(66px, 86px) 1fr;
    align-items: center;
    gap: 10px;
    color: #eef4ee;
    text-decoration: none;
  }
  .seat-join img {
    display: block;
    width: 100%;
    border: 3px solid #eef4ee;
    border-radius: 5px;
    background: #eef4ee;
    image-rendering: pixelated;
  }
  .seat-join span {
    display: grid;
    gap: 5px;
    min-width: 0;
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
  .program-cards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: clamp(2px, 0.35vw, 7px);
    margin-top: clamp(2px, 0.6cqh, 6px);
  }
  .program-card {
    position: relative;
    display: grid;
    min-width: 0;
    aspect-ratio: 1;
    place-items: center;
    overflow: hidden;
    border: 1px solid #435052;
    border-radius: clamp(2px, 0.25vw, 6px);
    color: #8b999a;
    background: linear-gradient(135deg, #202b2d, #344245);
    font:
      700 clamp(7px, 1cqw, 13px) "Space Mono",
      monospace;
    text-align: center;
    text-transform: uppercase;
  }
  .program-card.revealed {
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }
  .program-card-back {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    border: 2px solid #4a595c;
    background: repeating-linear-gradient(
      135deg,
      #1a2325 0 5px,
      #263235 5px 10px
    );
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
  .course-control :is(select, input, button) {
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
    .course-control :is(select, input, button) {
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
    .seat > strong {
      font-size: 14px;
    }
    .seat > small,
    .power-state span,
    .robot-vitals b {
      display: none;
    }
    .robot-vitals {
      display: block;
    }
    .life-track,
    .damage-track {
      margin-top: 3px;
    }
    .program-card {
      font-size: 7px;
    }
  }
</style>
