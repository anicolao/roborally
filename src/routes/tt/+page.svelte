<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import QRCode from 'qrcode';
  import CourseBoard from '$lib/components/CourseBoard.svelte';
  import { initializeFirebase, type FirebaseServices } from '$lib/firebase';
  import { MAX_ROOM_PLAYERS, ROBOTS, emptyRoomState, type RoomState } from '$lib/room-model';
  import * as RoomService from '$lib/room-service';
  import { PUBLISHED_COURSES_BY_ID } from '$lib/game/course-catalog';
  import {
    PLAYABLE_COURSE_IDS,
    raceConfig,
    type PlayableCourseId
  } from '$lib/game/setup';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import type { ProgramPlayback, RaceRobotPosition } from '$lib/game/movement';
  import type { Unsubscribe } from 'firebase/firestore';

  type SeatQr = { seat: number; url: string; image: string };
  type PlaybackPhase = 'idle' | 'countdown' | 'register' | 'complete';

  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = '';
  let status = 'Preparing a new tabletop…';
  let error = '';
  let pending = false;
  let seatQrs: SeatQr[] = [];
  let selectedCourseId: PlayableCourseId = 'risky-exchange';
  let setupSeed = 'RALLY-2005';
  let setupLives: 3 | 4 = 3;
  let unsubscribe: Unsubscribe | undefined;
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
  let playbackTimers: ReturnType<typeof setTimeout>[] = [];
  const PRODUCTION_PROGRAM_CARD_MS = 2_000;
  const PRODUCTION_FACTORY_STAGE_MS = 1_000;
  const PRODUCTION_COUNTDOWN_STEP_MS = 1_000;
  const playbackTimeScale = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' ? 0.1 : 1;

  $: selectedCourse = PUBLISHED_COURSES_BY_ID.get(selectedCourseId)!;
  $: selectedCourseSupportsRoom = selectedCourse.players.includes(state.players.length);
  $: playbackIsActive = playbackPhase === 'countdown' || playbackPhase === 'register';
  $: playbackTransitionMs = Math.round(playbackProductionDurationMs * playbackTimeScale);
  $: countdownStepMs = Math.round(PRODUCTION_COUNTDOWN_STEP_MS * playbackTimeScale);
  $: playbackCard = PROGRAM_CARDS.find(({ id }) => id === playbackCardId);
  $: playbackStageLabel = playbackStage === 'program-card'
    ? `${state.players.find(({ uid }) => uid === playbackActorUid)?.name ?? 'Robot'} · ${playbackCard?.action.replaceAll('-', ' ') ?? 'Program card'} · priority ${playbackCard?.priority ?? '—'}`
    : playbackStage === 'express-conveyors'
      ? 'Express conveyors'
      : playbackStage === 'conveyors'
        ? 'All conveyors'
        : playbackStage === 'pushers'
          ? 'Pushers'
          : playbackStage === 'gears'
            ? 'Gears · lasers · flags'
            : '';
  $: presentedRobots = playbackRobots ?? state.resolution?.robots;
  $: latestPlaybackEntry = playbackTrace.at(-1);

  onMount(async () => {
    try {
      services = await initializeFirebase();
      const params = new URLSearchParams(location.search);
      const requestedRoom = (params.get('room') ?? '').trim().toUpperCase();
      const e2eRoom = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
        ? (params.get('e2eRoomCode') ?? '').trim().toUpperCase()
        : '';
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
              errorCorrectionLevel: 'M',
              margin: 2,
              width: 320,
              color: { dark: '#11191a', light: '#eef4ee' }
            })
          };
        })
      );

      if (!requestedRoom) {
        status = 'Reserving a fresh tabletop room…';
        await RoomService.createTabletopRoom(services.db, services.user, roomCode);
      }
      unsubscribe = RoomService.subscribeRoom(services.db, roomCode, (next) => {
        state = next;
        status = next.resolution ? `Turn ${next.resolution.turnNumber} · ${next.resolution.phase.replaceAll('-', ' ')}` :
          next.configuration ? 'Race configured · waiting for racers' : 'Waiting for race configuration';
      }, (error) => { status = error.message; });
    } catch (nextError) {
      error = nextError instanceof Error ? nextError.message : 'Could not connect to Firebase';
      status = error;
    }
  });
  onDestroy(() => {
    unsubscribe?.();
    clearPlaybackTimers();
  });

  function cardLabel(cardId: string | null | undefined) {
    return PROGRAM_CARDS.find((card) => card.id === cardId)?.action.replaceAll('-', ' ') ?? '—';
  }

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
    return frame.stage === 'program-card'
      ? PRODUCTION_PROGRAM_CARD_MS
      : PRODUCTION_FACTORY_STAGE_MS;
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

    let frameStart = countdownStepMs * 3;
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
    const resolution = state.resolution;
    const nextPlaybackKey = resolution
      ? `${state.raceEpoch}:${resolution.turnNumber}`
      : '';
    if (
      resolution?.playback.frames.length &&
      nextPlaybackKey &&
      nextPlaybackKey !== playbackKey
    ) {
      startProgramPlayback(nextPlaybackKey, resolution.playback);
    }
  }

  async function configureCourse() {
    if (
      !services ||
      services.user.uid !== state.hostUid ||
      state.players.length < 2 ||
      !selectedCourseSupportsRoom
    ) return;
    pending = true;
    error = '';
    try {
      await RoomService.configureRace(services.db, services.user, roomCode, {
        config: raceConfig(selectedCourseId, setupSeed.trim() || 'RALLY-2005', setupLives)
      });
    } catch (nextError) {
      console.error(nextError);
      error = 'The tabletop could not write the race configuration.';
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head><title>Robo Rally · Tabletop</title></svelte:head>

<main class="tabletop" data-e2e-tabletop>
  <header>
    <a href={`${base}/`} class="brand"><strong>ROBO</strong> RALLY <small>TABLETOP</small></a>
    <div><strong>{roomCode || 'NO ROOM'}</strong><span>{status}</span></div>
    <span class="table-control">COURSE CONTROL</span>
  </header>

  {#if error}<p class="table-error" role="alert">{error}</p>{/if}

  {#if playbackPhase === 'countdown'}
    <div class="program-countdown" role="timer" aria-live="assertive" data-testid="tabletop-program-countdown">
      <small>ALL PROGRAMS LOCKED</small>
      {#key playbackCountdown}<strong>{playbackCountdown}</strong>{/key}
      <span>Movement incoming</span>
    </div>
  {:else if playbackPhase === 'register' && playbackRegister}
    <div
      class="register-playback"
      role="status"
      aria-live="polite"
      data-testid="tabletop-register-playback"
      data-register={playbackRegister}
      data-stage={playbackStage}
      data-frame={playbackFrameIndex}
      data-production-duration-ms={playbackProductionDurationMs}
    >
      <strong>REGISTER {playbackRegister} / {playbackStageLabel}</strong>
      <span>{latestPlaybackEntry?.text ?? `${playbackStageLabel} resolved with no movement`}</span>
      <i style={`--playback-progress:${playbackFrameIndex / playbackFrameCount}`}></i>
    </div>
  {/if}

  <section class="table" aria-label="Shared tabletop">
    {#each Array(MAX_ROOM_PLAYERS) as _, index}
      {@const seat = index + 1}
      {@const player = state.players.find((candidate) => candidate.seat === seat)}
      {@const robot = player ? ROBOTS.find((entry) => entry.id === player.robotId) : undefined}
      {@const qr = seatQrs.find((candidate) => candidate.seat === seat)}
      <article class:open={!player} class={`seat seat-${seat}`} data-seat={seat} data-player-uid={player?.uid ?? ''}>
        <div class="seat-head"><b>D{String(seat).padStart(2, '0')}</b><span>{robot?.mark ?? 'OPEN'}</span></div>
        {#if player}
          {@const raceRobot = presentedRobots?.find((candidate) => candidate.uid === player.uid)}
          {@const startingLives = state.setup?.players.find((candidate) => candidate.uid === player.uid)?.lives ?? state.configuration?.lives ?? 3}
          {@const lives = raceRobot?.lives ?? startingLives}
          {@const damage = Math.max(0, Math.min(10, raceRobot?.damage ?? state.setup?.startingDamage ?? 0))}
          {@const powerMode = raceRobot?.poweredDown
            ? 'down'
            : raceRobot?.powerDownNextTurn
              ? 'announced'
              : 'active'}
          <strong>{player.name}</strong>
          <small>{robot?.name}</small>
          <div
            class="robot-vitals"
            data-player-vitals={player.uid}
            aria-label={`${player.name}: ${lives} of ${startingLives} lives remaining, ${damage} damage taken and ${10 - damage} damage not yet taken, ${powerMode === 'down' ? 'powered down' : powerMode === 'announced' ? 'power down announced' : 'active power'}`}
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
                <i class:taken={damageIndex < damage} class:available={damageIndex >= damage}></i>
              {/each}
            </div>
            <div class:down={powerMode === 'down'} class:announced={powerMode === 'announced'} class="power-state">
              <i></i>
              <span>{powerMode === 'down' ? 'POWERED DOWN' : powerMode === 'announced' ? 'SHUTDOWN NEXT' : 'ACTIVE'}</span>
            </div>
          </div>
          <div class="program-cards" aria-label={`${player.name} program cards`}>
            {#each Array(5) as _, cardIndex}
              {@const programPlayer = state.programming?.players.find((entry) => entry.uid === player.uid)}
              {@const resolutionIsCurrent = state.resolution?.turnNumber === state.programming?.turnNumber}
              {@const revealed = resolutionIsCurrent &&
                (playbackPhase === 'complete' ||
                  (playbackPhase === 'register' && cardIndex + 1 <= (playbackRegister ?? 0)))}
              {@const cardId = programPlayer?.registers[cardIndex]?.cardId}
              <span class:revealed class="program-card">{revealed ? cardLabel(cardId) : '●'}</span>
            {/each}
          </div>
        {:else if qr}
          <a class="seat-join" href={qr.url} aria-label={`Join tabletop ${roomCode} at position ${seat}`}>
            <img src={qr.image} alt={`QR code to join position ${seat}`} />
            <span><strong>SCAN TO JOIN</strong><small>Position {seat}</small></span>
          </a>
        {:else}
          <span class="qr-placeholder">Generating join code…</span>
        {/if}
      </article>
    {/each}

    <div class="course-wrap">
      {#if state.setup}
        <CourseBoard
          setup={state.setup}
          robots={presentedRobots}
          animateRobots={playbackIsActive}
          transitionDurationMs={playbackTransitionMs}
          presentationOnly
          rotatePortrait
        />
      {:else}
        <div class="course-control" aria-label="Tabletop race configuration">
          <div>
            <span>COURSE CONTROL</span>
            <strong>{state.configuration ? selectedCourse.name : 'Configure the race'}</strong>
            <small>
              {state.players.length < 2
                ? 'At least two racers must scan a position before setup.'
                : state.configuration
                  ? `${state.readyPlayerUids.length}/${state.players.length} racers ready on their phones.`
                  : 'Choose the shared course and settings here on the table.'}
            </small>
          </div>
          <form onsubmit={(event) => { event.preventDefault(); void configureCourse(); }}>
            <label>
              Course
              <select bind:value={selectedCourseId} aria-label="Course">
                {#each PLAYABLE_COURSE_IDS as courseId}
                  {@const course = PUBLISHED_COURSES_BY_ID.get(courseId)!}
                  <option value={courseId} disabled={!course.players.includes(state.players.length)}>
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
              Starting lives
              <select bind:value={setupLives} aria-label="Starting Lives">
                <option value={3}>3 Lives</option>
                <option value={4} disabled={state.players.length < 5}>4 Lives (5+ racers)</option>
              </select>
            </label>
            <button type="submit" disabled={pending || state.players.length < 2 || !selectedCourseSupportsRoom}>
              {pending ? 'CONFIGURING…' : state.configuration ? 'REPLACE CONFIGURATION' : 'CONFIGURE RACE'}
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

  <footer>Shared information belongs on the tabletop · programming, Options, and private choices stay on each phone.</footer>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html), :global(body) { margin: 0; min-width: 320px; min-height: 100%; background: #111718; color: #eef4ee; font-family: 'Atkinson Hyperlegible', sans-serif; }
  .tabletop { min-height: 100vh; padding: 22px; background: radial-gradient(circle at center, #263637, #0c1112 72%); }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; max-width: 1800px; margin: 0 auto; }
  header { border-bottom: 1px solid #506064; padding-bottom: 14px; font-family: 'Space Mono', monospace; }
  .brand { color: #eef4ee; text-decoration: none; font-size: clamp(20px, 2vw, 34px); letter-spacing: .08em; white-space: nowrap; }
  .brand strong { color: #d2ff37; } .brand small { color: #aebbb9; font-size: .5em; }
  header div { display: grid; gap: 3px; text-align: center; } header div strong { color: #d2ff37; font-size: 24px; } header div span { color: #aebbb9; font-size: 15px; }
  .table-control { color: #ffcf4b; font: 700 16px 'Space Mono', monospace; }
  .table-error { max-width: 1800px; margin: 10px auto 0; color: #ffbf69; font-size: 18px; text-align: center; }
  .program-countdown { position: fixed; z-index: 50; inset: 0; display: grid; place-content: center; place-items: center; background: #050909dd; font-family: 'Space Mono', monospace; text-transform: uppercase; }
  .program-countdown small { color: #d2ff37; font-size: clamp(18px, 3vw, 38px); letter-spacing: .12em; }
  .program-countdown strong { color: #eef4ee; font-size: clamp(150px, 35vw, 420px); line-height: .9; text-shadow: 0 0 45px #d2ff3788; }
  .program-countdown span { color: #ffcf4b; font-size: clamp(22px, 4vw, 50px); }
  .register-playback { position: fixed; z-index: 40; top: 20px; left: 50%; display: grid; width: min(90vw, 1100px); gap: 7px; padding: 14px 20px; border: 2px solid #d2ff37; border-radius: 10px; color: #eef4ee; background: #0b1212ee; box-shadow: 0 10px 35px #000b; font-family: 'Space Mono', monospace; transform: translateX(-50%); }
  .register-playback strong { color: #d2ff37; font-size: clamp(16px, 2vw, 28px); text-transform: uppercase; }
  .register-playback span { overflow: hidden; font-size: clamp(14px, 1.5vw, 20px); text-overflow: ellipsis; white-space: nowrap; }
  .register-playback i { display: block; height: 5px; background: linear-gradient(90deg, #d2ff37 0 calc(var(--playback-progress) * 100%), #344043 calc(var(--playback-progress) * 100%) 100%); }
  .table { position: relative; display: grid; grid-template-columns: repeat(4, minmax(145px, 1fr)); grid-template-rows: minmax(175px, auto) minmax(480px, 1fr) minmax(175px, auto); gap: 14px; max-width: 1800px; min-height: calc(100vh - 120px); margin: 14px auto; }
  .course-wrap { grid-column: 1 / -1; grid-row: 2; z-index: 1; min-width: 0; min-height: 0; overflow: hidden; padding: 4px; border: 2px solid #6f7e7f; border-radius: 16px; background: #090d0e; box-shadow: 0 16px 50px #050707aa; }
  .course-wrap :global(.course-panel), .course-wrap :global(.board-viewport) { height: 100%; }
  .seat { z-index: 2; display: grid; gap: 4px; align-content: start; min-width: 0; padding: 12px; border: 2px solid #4b5a5c; border-radius: 10px; background: #11191aee; box-shadow: 0 7px 18px #05070799; }
  .seat.open { border-color: #7e9130; }
  .seat-1 { grid-column: 1; grid-row: 1; } .seat-2 { grid-column: 2; grid-row: 1; } .seat-3 { grid-column: 3; grid-row: 1; } .seat-4 { grid-column: 4; grid-row: 1; }
  .seat-5 { grid-column: 4; grid-row: 3; } .seat-6 { grid-column: 3; grid-row: 3; } .seat-7 { grid-column: 2; grid-row: 3; } .seat-8 { grid-column: 1; grid-row: 3; }
  .seat-head { display: flex; justify-content: space-between; color: #d2ff37; font-family: 'Space Mono', monospace; } .seat-head span { color: #ffcf4b; }
  .seat > strong { overflow: hidden; font-size: 22px; text-overflow: ellipsis; white-space: nowrap; } .seat > small { color: #9caaac; }
  .robot-vitals { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 8px; margin-top: 4px; font-family: 'Space Mono', monospace; }
  .life-track, .damage-track { display: flex; min-width: 0; align-items: center; gap: 3px; }
  .life-track { grid-column: 1; }
  .damage-track { grid-column: 1 / -1; }
  .robot-vitals b { width: 32px; flex: 0 0 32px; color: #849294; font-size: 9px; letter-spacing: .08em; }
  .life-track i { color: #394648; font-size: 14px; font-style: normal; line-height: 1; }
  .life-track i.remaining { color: #d2ff37; filter: drop-shadow(0 0 3px #d2ff3788); }
  .damage-track i { height: 9px; min-width: 8px; flex: 1; border: 1px solid #4c5a5d; border-radius: 1px; background: #202b2d; }
  .damage-track i.taken { border-color: #ff684f; background: #ff684f; box-shadow: 0 0 3px #ff684f99; }
  .power-state { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 5px; color: #9ff07f; font-size: 9px; white-space: nowrap; }
  .power-state i { width: 10px; height: 10px; border: 2px solid #263126; border-radius: 50%; background: #8dff69; box-shadow: 0 0 6px #8dff69; }
  .power-state.announced { color: #ffcf4b; }
  .power-state.announced i { border-color: #3a3218; background: #ffcf4b; box-shadow: 0 0 6px #ffcf4b; }
  .power-state.down { color: #ff887d; }
  .power-state.down i { border-color: #482522; background: #ff684f; box-shadow: 0 0 6px #ff684f; }
  .seat-join { display: grid; grid-template-columns: minmax(66px, 86px) 1fr; align-items: center; gap: 10px; color: #eef4ee; text-decoration: none; }
  .seat-join img { display: block; width: 100%; border: 3px solid #eef4ee; border-radius: 5px; background: #eef4ee; image-rendering: pixelated; }
  .seat-join span { display: grid; gap: 5px; min-width: 0; }
  .seat-join strong { color: #d2ff37; font: 700 clamp(12px, 1.1vw, 18px) 'Space Mono', monospace; }
  .seat-join small, .qr-placeholder { color: #aebbb9; font-size: 14px; }
  .program-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; margin-top: 5px; } .program-card { display: grid; min-height: 35px; place-items: center; overflow: hidden; border: 1px solid #435052; color: #8b999a; background: #263235; font: 700 10px 'Space Mono', monospace; text-align: center; text-transform: uppercase; } .program-card.revealed { color: #111; border-color: #d2ff37; background: #d2ff37; }
  .course-control { display: grid; height: 100%; max-width: 920px; margin: auto; place-content: center; gap: 24px; padding: 30px; }
  .course-control > div { display: grid; gap: 8px; text-align: center; }
  .course-control > div span { color: #d2ff37; font: 700 20px 'Space Mono', monospace; }
  .course-control > div strong { font: 700 clamp(32px, 5vw, 66px) 'Space Mono', monospace; text-transform: uppercase; }
  .course-control > div small { color: #aebbb9; font-size: 20px; }
  .course-control form { display: grid; grid-template-columns: 1.4fr 1fr 1fr auto; align-items: end; gap: 12px; }
  .course-control label { display: grid; gap: 6px; color: #d2ff37; font: 700 14px 'Space Mono', monospace; text-transform: uppercase; }
  .course-control :is(select, input, button) { min-height: 52px; border: 1px solid #657577; padding: 8px 12px; color: #eef4ee; background: #101718; font: 700 16px 'Atkinson Hyperlegible', sans-serif; }
  .course-control button { border-color: #d2ff37; color: #101718; background: #d2ff37; font-family: 'Space Mono', monospace; }
  .course-control button:disabled { opacity: .45; }
  .configured { margin: 0; color: #ffcf4b; font: 700 15px 'Space Mono', monospace; text-align: center; text-transform: uppercase; }
  footer { color: #9caaac; font-size: 16px; }
  @media (max-width: 1100px) { .course-control form { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 900px) { .table { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(4, auto) minmax(480px, 1fr); } .course-wrap { grid-column: 1 / -1; grid-row: 3 / 6; } .seat-1,.seat-2,.seat-3,.seat-4,.seat-5,.seat-6,.seat-7,.seat-8 { grid-column: auto; grid-row: auto; } .seat-5 { grid-column: 1; } .seat-6 { grid-column: 2; } .seat-7 { grid-column: 1; } .seat-8 { grid-column: 2; } }
</style>
