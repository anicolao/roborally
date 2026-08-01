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
  import { ROBOTS, emptyRoomState, type RoomState } from '$lib/room-model';
  import type { Unsubscribe } from 'firebase/firestore';

  let services: FirebaseServices | undefined;
  let state: RoomState = emptyRoomState();
  let roomCode = '';
  let uid = '';
  let selected: `${'program'}-${string}`[] = [];
  let status = 'Enter a room code to connect your private controller.';
  let error = '';
  let unsubscribe: Unsubscribe | undefined;

  $: player = state.players.find((candidate) => candidate.uid === uid);
  $: programming = state.programming?.players.find((candidate) => candidate.uid === uid);
  $: openSlots = programming?.registers.filter((register) => !register.locked).length ?? 5;
  $: turnId = state.programming?.turnId ?? 'turn-001';

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    roomCode = (params.get('room') ?? '').trim().toUpperCase();
    if (!roomCode) return;
    try {
      services = await initializeFirebase(); uid = services.user.uid;
      unsubscribe = RoomService.subscribeRoom(services.db, roomCode, (next) => {
        state = next;
        const draft = next.programming?.players.find((candidate) => candidate.uid === uid)?.draftCardIds ?? [];
        if (!next.programming?.players.find((candidate) => candidate.uid === uid)?.submitted) selected = draft;
        status = next.resolution ? 'Watch the shared tabletop for execution.' : next.programming ? 'Choose five registers privately.' : 'Waiting for the race to start.';
      }, (nextError) => { error = nextError.message; });
    } catch (nextError) { error = nextError instanceof Error ? nextError.message : 'Could not connect'; }
  });
  onDestroy(() => unsubscribe?.());

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
  {#if error}<p class="error">{error}</p>{:else if !roomCode}<p class="empty">Open this view with <code>/hand/?room=ROOMCODE</code>.</p>{:else if !player}<p class="empty">This phone is not seated in room {roomCode}. Join from the main race view first.</p>{:else}
    <section class="identity"><span>PRIVATE CONTROLLER</span><h1>{player.name}</h1><strong>{ROBOTS.find((robot) => robot.id === player.robotId)?.name}</strong><p>{status}</p></section>
    {#if programming}
      <section class="registers"><h2>Registers · {selected.length}/{openSlots}</h2><ol>{#each Array(5) as _, index}<li><span>R{index + 1}</span>{programming.registers[index]?.locked ? 'LOCKED' : (PROGRAM_CARDS.find((card) => card.id === selected[index])?.action.replaceAll('-', ' ') ?? 'EMPTY')}</li>{/each}</ol><button onclick={submit} disabled={programming.submitted || selected.length !== openSlots}>{programming.submitted ? 'PROGRAM LOCKED' : 'Lock program'}</button></section>
      <section class="hand"><h2>Program deck</h2><p>These choices remain private. The tabletop reveals cards only when execution begins.</p><div>{#each programming.hand as cardId}{@const card = PROGRAM_CARDS.find((entry) => entry.id === cardId)}<button class:selected={selected.includes(cardId)} onclick={() => toggle(cardId)} disabled={programming.submitted}><small>{card?.priority}</small><strong>{card?.action.replaceAll('-', ' ')}</strong></button>{/each}</div></section>
    {:else}<p class="empty">{status}</p>{/if}
  {/if}
  <footer><a href={`${base}/tt/?room=${roomCode}`}>View shared tabletop ↗</a><span>Keep this screen private.</span></footer>
</main>
<style>
  :global(*) { box-sizing: border-box; } :global(html), :global(body) { margin: 0; min-width: 320px; background: #0c1112; color: #eef4ee; font-family: 'Atkinson Hyperlegible', sans-serif; } .phone { width: min(100%, 720px); min-height: 100vh; margin: auto; padding: 20px; } header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 15px; border-bottom: 1px solid #465356; font-family: 'Space Mono', monospace; } header a, footer a { color: #eef4ee; text-decoration: none; } header strong { color: #d2ff37; } header span { color: #d2ff37; } .identity { margin: 28px 0; } .identity span, h2 { color: #d2ff37; font: 700 18px 'Space Mono', monospace; letter-spacing: .08em; text-transform: uppercase; } h1 { margin: 6px 0; font: 700 clamp(44px, 13vw, 88px) 'Space Mono', monospace; text-transform: uppercase; } .identity strong { color: #ffcf4b; font-family: 'Space Mono', monospace; } p { color: #aebbb9; font-size: 20px; } .registers, .hand { margin-top: 20px; padding: 16px; border: 1px solid #465356; background: #141c1d; } h2 { margin: 0 0 12px; font-size: 16px; } ol { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; } ol li { display: grid; min-height: 70px; place-content: center; gap: 5px; border: 1px solid #526265; background: #202b2d; color: #eef4ee; font: 700 13px 'Space Mono', monospace; text-align: center; text-transform: uppercase; } ol span { color: #d2ff37; font-size: 12px; } button { min-height: 48px; padding: 8px 12px; border: 1px solid #d2ff37; color: #111; background: #d2ff37; font: 700 16px 'Space Mono', monospace; text-transform: uppercase; } button:disabled { opacity: .5; } .hand > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .hand button { display: grid; min-height: 82px; gap: 4px; align-content: center; color: #d2ff37; background: #202b2d; text-align: left; } .hand button.selected { color: #111; background: #d2ff37; } .hand small { color: #ffcf4b; } .hand button.selected small { color: #111; } .hand p { margin-top: 0; font-size: 17px; } .empty, .error { margin-top: 35vh; text-align: center; } .error { color: #ffbf69; } footer { margin-top: 26px; border-top: 1px solid #465356; border-bottom: 0; padding-top: 15px; color: #aebbb9; font-size: 14px; }
</style>
