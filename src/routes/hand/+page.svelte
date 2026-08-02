<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import { initializeFirebase, type FirebaseServices } from '$lib/firebase';
  import * as RoomService from '$lib/room-service';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import {
    MAX_ROOM_PLAYERS,
    ROBOTS,
    emptyRoomState,
    normalizePlayerName,
    type RobotId,
    type RoomState
  } from '$lib/room-model';
  import type { Unsubscribe } from 'firebase/firestore';

  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = '';
  let uid = '';
  let requestedSeat = 0;
  let playerName = '';
  let selectedRobot: RobotId = 'axle';
  let selected: `${'program'}-${string}`[] = [];
  let status = 'Connecting to the tabletop…';
  let error = '';
  let pending = false;
  let unsubscribe: Unsubscribe | undefined;

  $: player = state.players.find((candidate) => candidate.uid === uid);
  $: seatPlayer = state.players.find((candidate) => candidate.seat === requestedSeat);
  $: unavailableRobots = new Set(state.players.map((candidate) => candidate.robotId));
  $: normalizedName = normalizePlayerName(playerName);
  $: canJoin = requestedSeat >= 1 && requestedSeat <= MAX_ROOM_PLAYERS &&
    !seatPlayer && !!normalizedName && !unavailableRobots.has(selectedRobot) && !pending;
  $: programming = state.programming?.players.find((candidate) => candidate.uid === uid);
  $: openSlots = programming?.registers.filter((register) => !register.locked).length ?? 5;
  $: turnId = state.programming?.turnId ?? 'turn-001';
  $: currentPlayerReady = !!player && state.readyPlayerUids.includes(player.uid);

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    roomCode = (params.get('room') ?? '').trim().toUpperCase();
    requestedSeat = Number(params.get('seat') ?? 0);
    if (!roomCode) return;
    try {
      services = await initializeFirebase(); uid = services.user.uid;
      unsubscribe = RoomService.subscribeRoom(services.db, roomCode, (next) => {
        state = next;
        const nextPlayer = next.players.find((candidate) => candidate.uid === uid);
        const draft = next.programming?.players.find((candidate) => candidate.uid === uid)?.draftCardIds ?? [];
        if (!next.programming?.players.find((candidate) => candidate.uid === uid)?.submitted) selected = draft;
        status = next.resolution
          ? 'Watch the shared tabletop for execution.'
          : next.programming
            ? 'Choose five registers privately.'
            : next.configuration
              ? 'Confirm that you are ready to race.'
              : nextPlayer
                ? 'The tabletop is choosing the course and settings.'
                : `Claim position ${requestedSeat} from this phone.`;
      }, (nextError) => { error = nextError.message; });
    } catch (nextError) { error = nextError instanceof Error ? nextError.message : 'Could not connect'; }
  });
  onDestroy(() => unsubscribe?.());

  async function claimSeat() {
    if (!services || !canJoin) return;
    pending = true;
    error = '';
    try {
      await RoomService.joinRoom(services.db, services.user, roomCode, {
        name: normalizedName,
        robotId: selectedRobot,
        seat: requestedSeat
      });
    } catch (nextError) {
      console.error(nextError);
      error = 'That position could not be claimed. Scan an open position and try again.';
    } finally {
      pending = false;
    }
  }

  async function becomeReady() {
    if (!services || !player || !state.configurationEventId || currentPlayerReady || pending) return;
    pending = true;
    error = '';
    try {
      await RoomService.markReady(services.db, services.user, roomCode, state.configurationEventId);
    } catch (nextError) {
      console.error(nextError);
      error = 'Your ready signal could not be written.';
    } finally {
      pending = false;
    }
  }

  function toggle(cardId: ProgramCard['id']) {
    if (!programming || programming.submitted || selected.includes(cardId) && selected.length === openSlots) return;
    selected = selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId];
    if (services && roomCode) void RoomService.updateProgramDraft(services.db, services.user, roomCode, selected, turnId);
  }
  async function submit() {
    if (!services || !roomCode || selected.length !== openSlots) return;
    await RoomService.submitProgram(services.db, services.user, roomCode, selected, turnId);
  }
</script>

<svelte:head><title>Robo Rally · Private controller</title></svelte:head>
<main class="phone" data-e2e-private-hand>
  <header><a href={`${base}/`}><strong>ROBO</strong> RALLY</a><span>{roomCode || 'NO ROOM'}</span></header>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if !roomCode}
    <p class="empty">Scan a tabletop position to connect this private controller.</p>
  {:else if !player}
    <section class="join-position" aria-label={`Join tabletop position ${requestedSeat}`}>
      <span>PRIVATE POSITION</span>
      <h1>D{String(requestedSeat || 0).padStart(2, '0')}</h1>
      {#if requestedSeat < 1 || requestedSeat > MAX_ROOM_PLAYERS}
        <p>This join link has no valid table position. Scan a QR code on the tabletop again.</p>
      {:else if seatPlayer}
        <p>Position {requestedSeat} has already been claimed by {seatPlayer.name}. Scan an open position.</p>
      {:else}
        <p>Choose your racer name and robot. This phone will keep your cards and choices private.</p>
        <form onsubmit={(event) => { event.preventDefault(); void claimSeat(); }}>
          <label>
            Racer name
            <input name="playerName" bind:value={playerName} maxlength="24" autocomplete="nickname" aria-label="Racer name" />
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
                ><span>{robot.mark}</span>{robot.name}</button>
              {/each}
            </div>
          </fieldset>
          <button type="submit" disabled={!canJoin}>{pending ? 'CLAIMING…' : `CLAIM POSITION ${requestedSeat}`}</button>
        </form>
      {/if}
    </section>
  {:else}
    <section class="identity"><span>PRIVATE CONTROLLER</span><h1>{player.name}</h1><strong>{ROBOTS.find((robot) => robot.id === player.robotId)?.name}</strong><p>{status}</p></section>
    {#if programming}
      <section class="registers"><h2>Registers · {selected.length}/{openSlots}</h2><ol>{#each Array(5) as _, index}<li><span>R{index + 1}</span>{programming.registers[index]?.locked ? 'LOCKED' : (PROGRAM_CARDS.find((card) => card.id === selected[index])?.action.replaceAll('-', ' ') ?? 'EMPTY')}</li>{/each}</ol><button onclick={submit} disabled={programming.submitted || selected.length !== openSlots}>{programming.submitted ? 'PROGRAM LOCKED' : 'Lock program'}</button></section>
      <section class="hand"><h2>Program deck</h2><p>These choices remain private. The tabletop reveals cards only when execution begins.</p><div>{#each programming.hand as cardId}{@const card = PROGRAM_CARDS.find((entry) => entry.id === cardId)}<button class:selected={selected.includes(cardId)} onclick={() => toggle(cardId)} disabled={programming.submitted}><small>{card?.priority}</small><strong>{card?.action.replaceAll('-', ' ')}</strong></button>{/each}</div></section>
    {:else if state.configuration}
      <section class="ready-control">
        <h2>Race configured</h2>
        <p>The shared table has chosen the course and settings.</p>
        <button onclick={becomeReady} disabled={pending || currentPlayerReady}>
          {currentPlayerReady ? 'READY · WATCH THE TABLE' : 'READY FOR RACE'}
        </button>
      </section>
    {:else}<p class="empty">{status}</p>{/if}
  {/if}
  <footer><a href={`${base}/tt/?room=${roomCode}`}>View shared tabletop ↗</a><span>Keep this screen private.</span></footer>
</main>
<style>
  :global(*) { box-sizing: border-box; } :global(html), :global(body) { margin: 0; min-width: 320px; background: #0c1112; color: #eef4ee; font-family: 'Atkinson Hyperlegible', sans-serif; } .phone { width: min(100%, 720px); min-height: 100vh; margin: auto; padding: 20px; } header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 15px; border-bottom: 1px solid #465356; font-family: 'Space Mono', monospace; } header a, footer a { color: #eef4ee; text-decoration: none; } header strong { color: #d2ff37; } header span { color: #d2ff37; } .identity { margin: 28px 0; } .identity span, .join-position > span, h2 { color: #d2ff37; font: 700 18px 'Space Mono', monospace; letter-spacing: .08em; text-transform: uppercase; } h1 { margin: 6px 0; font: 700 clamp(44px, 13vw, 88px) 'Space Mono', monospace; text-transform: uppercase; } .identity strong { color: #ffcf4b; font-family: 'Space Mono', monospace; } p { color: #aebbb9; font-size: 20px; } .registers, .hand, .ready-control { margin-top: 20px; padding: 16px; border: 1px solid #465356; background: #141c1d; } h2 { margin: 0 0 12px; font-size: 16px; } ol { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; } ol li { display: grid; min-height: 70px; place-content: center; gap: 5px; border: 1px solid #526265; background: #202b2d; color: #eef4ee; font: 700 13px 'Space Mono', monospace; text-align: center; text-transform: uppercase; } ol span { color: #d2ff37; font-size: 12px; } button { min-height: 48px; padding: 8px 12px; border: 1px solid #d2ff37; color: #111; background: #d2ff37; font: 700 16px 'Space Mono', monospace; text-transform: uppercase; } button:disabled { opacity: .5; } .hand > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .hand button { display: grid; min-height: 82px; gap: 4px; align-content: center; color: #d2ff37; background: #202b2d; text-align: left; } .hand button.selected { color: #111; background: #d2ff37; } .hand small { color: #ffcf4b; } .hand button.selected small { color: #111; } .hand p { margin-top: 0; font-size: 17px; } .empty, .error { margin-top: 35vh; text-align: center; } .error { color: #ffbf69; } footer { margin-top: 26px; border-top: 1px solid #465356; border-bottom: 0; padding-top: 15px; color: #aebbb9; font-size: 14px; }
  .join-position { margin: 30px 0; }
  .join-position > p { margin: 8px 0 24px; }
  .join-position form { display: grid; gap: 18px; }
  .join-position label, .join-position legend { color: #d2ff37; font: 700 15px 'Space Mono', monospace; text-transform: uppercase; }
  .join-position label { display: grid; gap: 8px; }
  .join-position input { min-height: 54px; border: 1px solid #657577; padding: 10px 12px; color: #eef4ee; background: #141c1d; font-size: 22px; }
  .join-position fieldset { margin: 0; padding: 14px; border: 1px solid #465356; }
  .robot-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 10px; }
  .robot-options button { display: flex; align-items: center; gap: 8px; color: #d2ff37; background: #202b2d; text-align: left; }
  .robot-options button span { color: #ffcf4b; }
  .robot-options button.selected { color: #111; background: #d2ff37; }
  .robot-options button.selected span { color: #111; }
  .ready-control p { margin: 0 0 16px; }
  .ready-control button { width: 100%; }
</style>
