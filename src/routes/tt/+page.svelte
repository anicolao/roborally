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
  import { PROGRAM_CARDS } from '$lib/game/program-manifest';
  import type { Unsubscribe } from 'firebase/firestore';

  type SeatQr = { seat: number; url: string; image: string };

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

  $: selectedCourse = PUBLISHED_COURSES_BY_ID.get(selectedCourseId)!;
  $: selectedCourseSupportsRoom = selectedCourse.players.includes(state.players.length);

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
  onDestroy(() => unsubscribe?.());

  function cardLabel(cardId: string | null | undefined) {
    return PROGRAM_CARDS.find((card) => card.id === cardId)?.action.replaceAll('-', ' ') ?? '—';
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

  <section class="table" aria-label="Shared tabletop">
    {#each Array(MAX_ROOM_PLAYERS) as _, index}
      {@const seat = index + 1}
      {@const player = state.players.find((candidate) => candidate.seat === seat)}
      {@const robot = player ? ROBOTS.find((entry) => entry.id === player.robotId) : undefined}
      {@const qr = seatQrs.find((candidate) => candidate.seat === seat)}
      <article class:open={!player} class={`seat seat-${seat}`} data-seat={seat} data-player-uid={player?.uid ?? ''}>
        <div class="seat-head"><b>D{String(seat).padStart(2, '0')}</b><span>{robot?.mark ?? 'OPEN'}</span></div>
        {#if player}
          <strong>{player.name}</strong>
          <small>{robot?.name}</small>
          <div class="program-cards" aria-label={`${player.name} program cards`}>
            {#each Array(5) as _, cardIndex}
              {@const programPlayer = state.programming?.players.find((entry) => entry.uid === player.uid)}
              {@const revealed = state.programming?.phase === 'programmed' || !!state.resolution}
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
        <CourseBoard setup={state.setup} robots={state.resolution?.robots} />
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
  .table { position: relative; display: grid; grid-template-columns: repeat(4, minmax(145px, 1fr)); grid-template-rows: minmax(135px, auto) minmax(480px, 1fr) minmax(135px, auto); gap: 14px; max-width: 1800px; min-height: calc(100vh - 120px); margin: 14px auto; }
  .course-wrap { grid-column: 1 / -1; grid-row: 2; z-index: 1; min-width: 0; min-height: 0; padding: 12px; border: 2px solid #6f7e7f; border-radius: 16px; background: #182123; box-shadow: 0 16px 50px #050707aa; }
  .course-wrap :global(.course-panel) { height: 100%; } .course-wrap :global(.board-viewport) { height: calc(100% - 115px); }
  .seat { z-index: 2; display: grid; gap: 4px; align-content: start; min-width: 0; padding: 12px; border: 2px solid #4b5a5c; border-radius: 10px; background: #11191aee; box-shadow: 0 7px 18px #05070799; }
  .seat.open { border-color: #7e9130; }
  .seat-1 { grid-column: 1; grid-row: 1; } .seat-2 { grid-column: 2; grid-row: 1; } .seat-3 { grid-column: 3; grid-row: 1; } .seat-4 { grid-column: 4; grid-row: 1; }
  .seat-5 { grid-column: 4; grid-row: 3; } .seat-6 { grid-column: 3; grid-row: 3; } .seat-7 { grid-column: 2; grid-row: 3; } .seat-8 { grid-column: 1; grid-row: 3; }
  .seat-head { display: flex; justify-content: space-between; color: #d2ff37; font-family: 'Space Mono', monospace; } .seat-head span { color: #ffcf4b; }
  .seat > strong { overflow: hidden; font-size: 22px; text-overflow: ellipsis; white-space: nowrap; } .seat > small { color: #9caaac; }
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
