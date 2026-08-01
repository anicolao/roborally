<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import CourseBoard from '$lib/components/CourseBoard.svelte';
  import { initializeFirebase, type FirebaseServices } from '$lib/firebase';
  import { MAX_ROOM_PLAYERS, ROBOTS, emptyRoomState, type RoomState } from '$lib/room-model';
  import * as RoomService from '$lib/room-service';
  import { PROGRAM_CARDS } from '$lib/game/program-manifest';
  import type { Unsubscribe } from 'firebase/firestore';

  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = '';
  let status = 'Connect a room from a phone to put it on the table.';
  let unsubscribe: Unsubscribe | undefined;

  onMount(async () => {
    roomCode = (new URLSearchParams(location.search).get('room') ?? '').trim().toUpperCase();
    if (!roomCode) return;
    try {
      services = await initializeFirebase();
      unsubscribe = RoomService.subscribeRoom(services.db, roomCode, (next) => {
        state = next;
        status = next.resolution ? `Turn ${next.resolution.turnNumber} · ${next.resolution.phase.replaceAll('-', ' ')}` :
          next.configuration ? 'Race configured · waiting for racers' : 'Waiting for race configuration';
      }, (error) => { status = error.message; });
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not connect to Firebase';
    }
  });
  onDestroy(() => unsubscribe?.());

  function playerAt(seat: number) { return state.players.find((player) => player.seat === seat); }
  function cardLabel(cardId: string | null | undefined) {
    return PROGRAM_CARDS.find((card) => card.id === cardId)?.action.replaceAll('-', ' ') ?? '—';
  }
</script>

<svelte:head><title>Robo Rally · Tabletop</title></svelte:head>

<main class="tabletop" data-e2e-tabletop>
  <header>
    <a href={`${base}/`} class="brand"><strong>ROBO</strong> RALLY <small>TABLETOP</small></a>
    <div><strong>{roomCode || 'NO ROOM'}</strong><span>{status}</span></div>
    {#if roomCode}<a class="phone-link" href={`${base}/hand/?room=${roomCode}`}>Private phone view ↗</a>{/if}
  </header>

  <section class="table" aria-label="Shared tabletop">
    {#each Array(MAX_ROOM_PLAYERS) as _, index}
      {@const seat = index + 1}
      {@const player = playerAt(seat)}
      {@const robot = player ? ROBOTS.find((entry) => entry.id === player.robotId) : undefined}
      <article class={`seat seat-${seat}`} data-seat={seat} data-player-uid={player?.uid ?? ''}>
        <div class="seat-head"><b>D{String(seat).padStart(2, '0')}</b><span>{robot?.mark ?? 'OPEN'}</span></div>
        <strong>{player?.name ?? 'Open position'}</strong>
        <small>{player ? robot?.name : 'Scan a phone to join'}</small>
        <div class="program-cards" aria-label={`${player?.name ?? 'Open'} program cards`}>
          {#each Array(5) as _, cardIndex}
            {@const programPlayer = state.programming?.players.find((entry) => entry.uid === player?.uid)}
            {@const revealed = state.programming?.phase === 'programmed' || !!state.resolution}
            {@const cardId = programPlayer?.registers[cardIndex]?.cardId}
            <span class:revealed class="program-card">{revealed ? cardLabel(cardId) : '●'}</span>
          {/each}
        </div>
      </article>
    {/each}

    <div class="course-wrap">
      {#if state.setup}
        <CourseBoard setup={state.setup} robots={state.resolution?.robots} />
      {:else}
        <div class="course-placeholder"><span>COURSE</span><strong>Waiting for setup</strong><small>Configure the race from a player phone.</small></div>
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
  .phone-link { color: #ffcf4b; font-size: 16px; }
  .table { position: relative; display: grid; grid-template-columns: repeat(4, minmax(145px, 1fr)); grid-template-rows: minmax(135px, auto) minmax(480px, 1fr) minmax(135px, auto); gap: 14px; max-width: 1800px; min-height: calc(100vh - 120px); margin: 14px auto; }
  .course-wrap { grid-column: 1 / -1; grid-row: 2; z-index: 1; min-width: 0; min-height: 0; padding: 12px; border: 2px solid #6f7e7f; border-radius: 16px; background: #182123; box-shadow: 0 16px 50px #050707aa; }
  .course-wrap :global(.course-panel) { height: 100%; } .course-wrap :global(.board-viewport) { height: calc(100% - 115px); }
  .seat { z-index: 2; display: grid; gap: 4px; align-content: start; min-width: 0; padding: 12px; border: 2px solid #4b5a5c; border-radius: 10px; background: #11191aee; box-shadow: 0 7px 18px #05070799; }
  .seat-1 { grid-column: 1; grid-row: 1; } .seat-2 { grid-column: 2; grid-row: 1; } .seat-3 { grid-column: 3; grid-row: 1; } .seat-4 { grid-column: 4; grid-row: 1; }
  .seat-5 { grid-column: 4; grid-row: 3; } .seat-6 { grid-column: 3; grid-row: 3; } .seat-7 { grid-column: 2; grid-row: 3; } .seat-8 { grid-column: 1; grid-row: 3; }
  .seat-head { display: flex; justify-content: space-between; color: #d2ff37; font-family: 'Space Mono', monospace; } .seat-head span { color: #ffcf4b; }
  .seat > strong { overflow: hidden; font-size: 22px; text-overflow: ellipsis; white-space: nowrap; } .seat > small { color: #9caaac; }
  .program-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; margin-top: 5px; } .program-card { display: grid; min-height: 35px; place-items: center; overflow: hidden; border: 1px solid #435052; color: #8b999a; background: #263235; font: 700 10px 'Space Mono', monospace; text-align: center; text-transform: uppercase; } .program-card.revealed { color: #111; border-color: #d2ff37; background: #d2ff37; }
  .course-placeholder { display: grid; height: 100%; place-content: center; gap: 12px; text-align: center; } .course-placeholder span { color: #d2ff37; font: 700 20px 'Space Mono', monospace; } .course-placeholder strong { font: 700 clamp(32px, 5vw, 70px) 'Space Mono', monospace; } .course-placeholder small { color: #aebbb9; font-size: 20px; }
  footer { color: #9caaac; font-size: 16px; }
  @media (max-width: 900px) { .table { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(4, auto) minmax(480px, 1fr); } .course-wrap { grid-column: 1 / -1; grid-row: 3 / 6; } .seat-1,.seat-2,.seat-3,.seat-4,.seat-5,.seat-6,.seat-7,.seat-8 { grid-column: auto; grid-row: auto; } .seat-5 { grid-column: 1; } .seat-6 { grid-column: 2; } .seat-7 { grid-column: 1; } .seat-8 { grid-column: 2; } }
</style>
