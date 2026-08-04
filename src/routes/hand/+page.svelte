<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import { initializeFirebase, type FirebaseServices } from '$lib/firebase';
  import ProgramEditor from '$lib/components/ProgramEditor.svelte';
  import * as RoomService from '$lib/room-service';
  import type { ProgramCard } from '$lib/game/program-manifest';
  import {
    REGISTER_COUNT,
    draftCardIdsInRegisterOrder,
    draftSlotsForPlayer
  } from '$lib/game/programming';
  import { OPTION_CARDS_BY_ID, type OptionCardId } from '$lib/game/option-manifest';
  import { legalReentryChoices } from '$lib/game/movement';
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
  let draftSlots: (ProgramCard['id'] | null)[] = Array.from(
    { length: REGISTER_COUNT },
    () => null
  );
  let draftDirty = false;
  let draftWriteQueue: Promise<void> = Promise.resolve();
  let selectedReentryChoice = '';
  let reentryPoweredDown = false;
  let selectedOptionPreventionIds: OptionCardId[] = [];
  let requestedTurnNumber = 1;
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
  $: activeProgramming =
    state.nextProgramming?.turnNumber === requestedTurnNumber
      ? state.nextProgramming
      : state.programming;
  $: programming = activeProgramming?.players.find((candidate) => candidate.uid === uid);
  $: openSlots = programming?.registers.filter((register) => !register.locked).length ?? 5;
  $: selected = programming ? draftCardIdsInRegisterOrder(programming, draftSlots) : [];
  $: turnId = activeProgramming?.turnId ?? 'turn-001';
  $: currentPlayerReady = !!player && state.readyPlayerUids.includes(player.uid);
  $: canRespondPowerDown = !!player && state.pendingPowerDownUid === player.uid;
  $: reentryChoices = player && state.resolution
    ? legalReentryChoices(state.resolution, player.uid)
    : [];
  $: reentryRobot = state.resolution?.robots.find(
    (candidate) => candidate.uid === state.resolution?.nextReentryUid
  );
  $: optionLossRobot = state.resolution?.robots.find(
    (candidate) => candidate.uid === state.resolution?.nextOptionChoiceUid
  );
  $: optionPlanRobot = player
    ? state.resolution?.robots.find((candidate) => candidate.uid === player.uid)
    : undefined;
  $: canChooseOptionPlan = !!player && state.pendingOptionUid === player.uid && !!activeProgramming;

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
        const nextActiveProgramming =
          next.nextProgramming?.turnNumber === requestedTurnNumber
            ? next.nextProgramming
            : next.programming;
        const nextProgrammingPlayer = nextActiveProgramming?.players.find(
          (candidate) => candidate.uid === uid
        );
        if (!nextProgrammingPlayer?.submitted) {
          const nextDraftSlots = nextProgrammingPlayer
            ? draftSlotsForPlayer(nextProgrammingPlayer)
            : Array.from({ length: REGISTER_COUNT }, () => null);
          const serverMatchesLocal = nextDraftSlots.every(
            (cardId, index) => cardId === draftSlots[index]
          );
          if (!draftDirty || serverMatchesLocal) {
            draftSlots = nextDraftSlots;
            if (serverMatchesLocal) draftDirty = false;
          }
        }
        const effectDraft = next.effectDrafts.find(
          ({ uid: draftUid, turnId: draftTurnId }) =>
            draftUid === uid &&
            (draftTurnId === next.programming?.turnId ||
              draftTurnId === `turn-${String(next.resolution?.turnNumber ?? 0).padStart(3, '0')}`)
        );
        if (effectDraft?.draft.kind === 'reentry') {
          selectedReentryChoice =
            effectDraft.draft.x !== null &&
            effectDraft.draft.y !== null &&
            effectDraft.draft.facing
              ? `${effectDraft.draft.x},${effectDraft.draft.y},${effectDraft.draft.facing}`
              : '';
          reentryPoweredDown = effectDraft.draft.poweredDown;
        } else if (effectDraft?.draft.kind === 'option-plan') {
          selectedOptionPreventionIds = [...effectDraft.draft.preventDamageWith];
        }
        const programmingIsAhead =
          !!nextActiveProgramming &&
          (!next.resolution || nextActiveProgramming.turnNumber > next.resolution.turnNumber);
        status = programmingIsAhead
          ? `Choose five registers privately for turn ${nextActiveProgramming.turnNumber}.`
          : next.resolution
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

  function beginNextTurn() {
    if (!state.nextProgramming) return;
    requestedTurnNumber = state.nextProgramming.turnNumber;
    const nextPlayer = state.nextProgramming.players.find((candidate) => candidate.uid === uid);
    draftSlots = nextPlayer
      ? draftSlotsForPlayer(nextPlayer)
      : Array.from({ length: REGISTER_COUNT }, () => null);
    draftDirty = false;
    draftWriteQueue = Promise.resolve();
    status = `Choose five registers privately for turn ${requestedTurnNumber}.`;
  }

  async function persistReentryDraft() {
    if (!services || !state.resolution) return;
    const [x, y, facing] = selectedReentryChoice.split(',');
    const validFacing = ['north', 'east', 'south', 'west'].includes(facing)
      ? (facing as 'north' | 'east' | 'south' | 'west')
      : null;
    try {
      await RoomService.updateEffectDraft(
        services.db,
        services.user,
        roomCode,
        `turn-${String(state.resolution.turnNumber).padStart(3, '0')}`,
        {
          kind: 'reentry',
          x: x ? Number(x) : null,
          y: y ? Number(y) : null,
          facing: validFacing,
          poweredDown: reentryPoweredDown
        }
      );
    } catch (nextError) {
      console.error(nextError);
      error = 'Your re-entry draft could not be written.';
    }
  }

  async function submitReentryChoice() {
    if (!services || !state.resolution || !selectedReentryChoice || pending) return;
    const [x, y, facing] = selectedReentryChoice.split(',');
    if (!x || !y || !['north', 'east', 'south', 'west'].includes(facing)) return;
    pending = true;
    error = '';
    try {
      await RoomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        {
          kind: 'reentry',
          x: Number(x),
          y: Number(y),
          facing: facing as 'north' | 'east' | 'south' | 'west',
          ...(reentryRobot?.powerDownNextTurn ? { poweredDown: reentryPoweredDown } : {})
        },
        `turn-${String(state.resolution.turnNumber).padStart(3, '0')}`
      );
      selectedReentryChoice = '';
      reentryPoweredDown = false;
    } catch (nextError) {
      console.error(nextError);
      error = 'Your re-entry choice could not be written.';
    } finally {
      pending = false;
    }
  }

  async function discardDestroyedOption(cardId: OptionCardId) {
    if (!services || !activeProgramming || pending) return;
    pending = true;
    error = '';
    try {
      await RoomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        { kind: 'option-loss', cardId },
        activeProgramming.turnId
      );
    } catch (nextError) {
      console.error(nextError);
      error = 'Your Option loss choice could not be written.';
    } finally {
      pending = false;
    }
  }

  function toggleOptionPrevention(cardId: OptionCardId) {
    selectedOptionPreventionIds = selectedOptionPreventionIds.includes(cardId)
      ? selectedOptionPreventionIds.filter((id) => id !== cardId)
      : [...selectedOptionPreventionIds, cardId];
    if (services && activeProgramming) {
      void RoomService.updateEffectDraft(
        services.db,
        services.user,
        roomCode,
        activeProgramming.turnId,
        { kind: 'option-plan', preventDamageWith: selectedOptionPreventionIds, activations: [] }
      ).catch((nextError) => {
        console.error(nextError);
        error = 'Your Option draft could not be written.';
      });
    }
  }

  async function submitOptionPlan() {
    if (!services || !activeProgramming || !canChooseOptionPlan || pending) return;
    pending = true;
    error = '';
    try {
      await RoomService.chooseEffect(
        services.db,
        services.user,
        roomCode,
        { kind: 'option-plan', preventDamageWith: selectedOptionPreventionIds, activations: [] },
        activeProgramming.turnId
      );
      selectedOptionPreventionIds = [];
    } catch (nextError) {
      console.error(nextError);
      error = 'Your Option plan could not be written.';
    } finally {
      pending = false;
    }
  }

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

  async function respondPowerDown(powerDownNextTurn: boolean) {
    if (!services || !activeProgramming || !canRespondPowerDown || pending) return;
    pending = true;
    error = '';
    try {
      await RoomService.respondPowerDown(services.db, services.user, roomCode, {
        turnId: activeProgramming.turnId,
        powerDownNextTurn
      });
    } catch (nextError) {
      console.error(nextError);
      error = 'Your power-down choice could not be written.';
    } finally {
      pending = false;
    }
  }

  function persistDraft(nextSlots: (ProgramCard['id'] | null)[]) {
    draftSlots = nextSlots;
    draftDirty = true;
    if (!services || !roomCode || !programming) return;
    const cardIds = draftCardIdsInRegisterOrder(programming, nextSlots);
    const slots = [...nextSlots];
    draftWriteQueue = draftWriteQueue.then(async () => {
      try {
        await RoomService.updateProgramDraft(
          services!.db,
          services!.user,
          roomCode,
          cardIds,
          turnId,
          slots
        );
      } catch (nextError) {
        console.error(nextError);
        draftDirty = false;
        error = 'Your Program draft could not be written.';
      }
    });
  }

  async function submit() {
    if (!services || !roomCode || selected.length !== openSlots) return;
    await draftWriteQueue;
    const cardIds = programming ? draftCardIdsInRegisterOrder(programming, draftSlots) : [];
    await RoomService.submitProgram(services.db, services.user, roomCode, cardIds, turnId);
    draftDirty = false;
  }
</script>

<svelte:head><title>Robo Rally · Private controller</title></svelte:head>
<main class="phone" data-e2e-private-hand>
  <header><a href={`${base}/`}><strong>ROBO</strong> RALLY</a><span>{roomCode || 'NO ROOM'}</span></header>
  <div class:programming={!!programming} class="controller-content">
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
    {#if canRespondPowerDown}
      <section class="power-control" aria-label="Power-down choice">
        <h2>Next-turn power</h2>
        <p>Choose whether your robot will shut down for the next turn.</p>
        <div>
          <button onclick={() => respondPowerDown(true)} disabled={pending}>POWER DOWN</button>
          <button onclick={() => respondPowerDown(false)} disabled={pending}>STAY ACTIVE</button>
        </div>
      </section>
    {/if}
    {#if state.nextProgramming && requestedTurnNumber < state.nextProgramming.turnNumber}
      <section class="next-turn-control" aria-label="Next turn ready">
        <h2>Turn {state.resolution?.turnNumber} complete</h2>
        <p>Watch the tabletop finish its playback, then open your next private Program hand.</p>
        <button onclick={beginNextTurn}>BEGIN TURN {state.nextProgramming.turnNumber}</button>
      </section>
    {:else if programming}
      {#if optionLossRobot?.uid === player.uid}
        <section class="effect-control" aria-label="Destroyed robot Option loss">
          <h2>Discard one Option</h2>
          <p>Your destroyed robot must discard one Option before it can re-enter.</p>
          <div>
            {#each optionLossRobot.options as option}
              <button onclick={() => discardDestroyedOption(option.cardId)} disabled={pending}>
                DISCARD {OPTION_CARDS_BY_ID.get(option.cardId)?.name ?? option.cardId}
              </button>
            {/each}
          </div>
        </section>
      {:else if reentryChoices.length > 0}
        <section class="effect-control" aria-label="Robot re-entry choice">
          <h2>Re-enter your robot</h2>
          <p>Choose a legal cell and facing. The race continues after every destroyed robot returns.</p>
          <label>
            Re-entry cell and facing
            <select bind:value={selectedReentryChoice} onchange={persistReentryDraft}>
              <option value="">Choose a legal placement</option>
              {#each reentryChoices as choice}
                <option value={`${choice.x},${choice.y},${choice.facing}`}>
                  ({choice.x},{choice.y}) facing {choice.facing}
                </option>
              {/each}
            </select>
          </label>
          {#if reentryRobot?.powerDownNextTurn}
            <label class="check-control">
              <input type="checkbox" bind:checked={reentryPoweredDown} onchange={persistReentryDraft} />
              Re-enter powered down
            </label>
          {/if}
          <button onclick={submitReentryChoice} disabled={pending || !selectedReentryChoice}>CONFIRM RE-ENTRY</button>
        </section>
      {:else if canChooseOptionPlan && optionPlanRobot}
        <section class="effect-control" aria-label="Turn Option plan">
          <h2>Commit Option choices</h2>
          <p>Select Options to discard in order to prevent one damage each. Unselected cards are retained.</p>
          <div>
            {#each optionPlanRobot.options as option}
              <button
                class:selected={selectedOptionPreventionIds.includes(option.cardId)}
                aria-pressed={selectedOptionPreventionIds.includes(option.cardId)}
                onclick={() => toggleOptionPrevention(option.cardId)}
              >{OPTION_CARDS_BY_ID.get(option.cardId)?.name ?? option.cardId}</button>
            {/each}
          </div>
          <button onclick={submitOptionPlan} disabled={pending}>COMMIT OPTION PLAN</button>
        </section>
      {/if}
      <section class="private-programming">
        <p>These choices remain private. The tabletop reveals cards only when execution begins.</p>
        {#key turnId}
          <ProgramEditor
            player={programming}
            bind:draftSlots
            {pending}
            viewportFit
            instructionsVisible={false}
            submitLabel="Lock program"
            submittedMessage="Program locked. Watch the tabletop for execution."
            ondraftchange={persistDraft}
            onprogramsubmit={submit}
          />
        {/key}
      </section>
    {:else if state.configuration && !state.setup}
      <section class="ready-control">
        <h2>Race configured</h2>
        <p>The shared table has chosen the course and settings.</p>
        <button onclick={becomeReady} disabled={pending || currentPlayerReady}>
          {currentPlayerReady ? 'READY · WATCH THE TABLE' : 'READY FOR RACE'}
        </button>
      </section>
    {:else if !canRespondPowerDown}<p class="empty">{status}</p>{/if}
  {/if}
  </div>
  <footer><a href={`${base}/tt/?room=${roomCode}`}>View shared tabletop ↗</a><span>Keep this screen private.</span></footer>
</main>
<style>
  :global(*) { box-sizing: border-box; }
  :global(html), :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    min-width: 320px;
    overflow: hidden;
    overscroll-behavior: none;
    background: #0c1112;
    color: #eef4ee;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }
  .phone {
    display: grid;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    margin: 0;
    overflow: hidden;
    padding:
      max(10px, env(safe-area-inset-top))
      max(12px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
  }
  .controller-content { min-height: 0; overflow: auto; }
  .controller-content.programming {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header, footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 15px;
    border-bottom: 1px solid #465356;
    font-family: 'Space Mono', monospace;
  }
  header a, footer a { color: #eef4ee; text-decoration: none; }
  header strong, header span { color: #d2ff37; }
  .identity { margin: 28px 0; }
  .programming .identity {
    display: grid;
    flex: none;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 4px 10px;
    align-items: baseline;
    margin: 6px 0;
  }
  .programming .identity > span { display: none; }
  .programming .identity h1 { margin: 0; font-size: clamp(22px, 7vw, 34px); }
  .programming .identity strong { justify-self: end; }
  .programming .identity p {
    grid-column: 1 / -1;
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .identity span, .join-position > span, h2 {
    color: #d2ff37;
    font: 700 18px 'Space Mono', monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 6px 0;
    font: 700 clamp(44px, 13vw, 88px) 'Space Mono', monospace;
    text-transform: uppercase;
  }
  h2 { margin: 0 0 12px; font-size: 16px; }
  .identity strong { color: #ffcf4b; font-family: 'Space Mono', monospace; }
  p { color: #aebbb9; font-size: 20px; }
  .private-programming, .ready-control, .next-turn-control, .power-control {
    margin-top: 20px;
    padding: 16px;
    border: 1px solid #465356;
    background: #141c1d;
  }
  .programming .private-programming {
    display: grid;
    flex: 1 1 auto;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    margin-top: 0;
    overflow: hidden;
    padding: 8px;
  }
  .programming .private-programming > p { display: none; }
  .programming .power-control,
  .programming .effect-control { flex: none; margin-top: 4px; padding: 6px; }
  .private-programming > p { margin-top: 0; font-size: 17px; }
  button {
    min-height: 48px;
    padding: 8px 12px;
    border: 1px solid #d2ff37;
    color: #111;
    background: #d2ff37;
    font: 700 16px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  button:disabled { opacity: .5; }
  .empty, .error { margin-top: 35vh; text-align: center; }
  .error { color: #ffbf69; }
  footer {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #465356;
    border-bottom: 0;
    color: #aebbb9;
    font-size: 14px;
  }
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
  .ready-control button, .next-turn-control button { width: 100%; }
  .next-turn-control p { margin: 0 0 16px; }
  .power-control p { margin: 0 0 12px; }
  .power-control > div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .effect-control { margin-top: 20px; padding: 16px; border: 2px solid #ffcf4b; background: #211d12; }
  .effect-control p { margin: 0 0 14px; }
  .effect-control label { display: grid; gap: 7px; margin-bottom: 12px; color: #ffcf4b; font: 700 15px 'Space Mono', monospace; text-transform: uppercase; }
  .effect-control select { min-height: 52px; padding: 8px 10px; border: 1px solid #657577; color: #eef4ee; background: #141c1d; font-size: 18px; }
  .effect-control > div { display: grid; gap: 8px; margin-bottom: 10px; }
  .effect-control > button { width: 100%; }
  .effect-control button.selected { color: #111; background: #ffcf4b; border-color: #ffcf4b; }
  .effect-control .check-control { display: flex; align-items: center; text-transform: none; }
  .effect-control .check-control input { width: 24px; height: 24px; }

  @media (max-width: 700px) {
    header, footer { padding-bottom: 6px; font-size: 12px; }
    footer span { display: none; }
  }

  @media (max-height: 720px) {
    .phone { padding-top: max(4px, env(safe-area-inset-top)); padding-bottom: max(3px, env(safe-area-inset-bottom)); }
    header { padding-bottom: 3px; }
    footer { display: none; }
    .programming .identity { margin: 2px 0; }
    .programming .identity p { display: none; }
    .programming .private-programming { padding: 3px; }
  }
</style>
