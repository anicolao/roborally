<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { replaceState } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { Unsubscribe } from 'firebase/firestore';
  import type { FirebaseServices } from '$lib/firebase';
  import CourseBoard from '$lib/components/CourseBoard.svelte';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import { legalReentryChoices } from '$lib/game/movement';
  import { previewProgram, programCardZones } from '$lib/game/programming';
  import { riskyExchangeConfig } from '$lib/game/setup';
  import {
    MAX_ROOM_PLAYERS,
    ROBOTS,
    emptyRoomState,
    normalizePlayerName,
    normalizeRoomCode,
    type RobotId
  } from '$lib/room-model';
  import type * as RoomService from '$lib/room-service';

  type ConnectionState = 'connecting' | 'synced' | 'error';
  type ViewMode = 'landing' | 'create' | 'join' | 'room';

  let connectionState: ConnectionState = 'connecting';
  let connectionMessage = 'Connecting to the factory network';
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
  let setupSeed = 'RISKY-2005';
  let setupLives: 3 | 4 = 3;
  let selectedProgramCardIds: ProgramCard['id'][] = [];
  let clockNow = Date.now();
  let clockInterval: ReturnType<typeof setInterval> | undefined;
  let showProgramming = false;
  let selectedReentryChoice = '';
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
  $: programmingPlayer = currentPlayer && roomState.programming
    ? roomState.programming.players.find((player) => player.uid === currentPlayer.uid)
    : undefined;
  $: programPreview = programmingPlayer
    ? previewProgram(programmingPlayer, selectedProgramCardIds)
    : [];
  $: deadlineSeconds = roomState.programming?.deadline
    ? Math.max(0, Math.ceil((roomState.programming.deadline - clockNow) / 1000))
    : null;
  $: reentryChoices =
    currentPlayer && roomState.resolution
      ? legalReentryChoices(roomState.resolution, currentPlayer.uid)
      : [];
  $: normalizedName = normalizePlayerName(playerName);
  $: canSubmit =
    !!normalizedName &&
    !pending &&
    !unavailableRobots.has(selectedRobot) &&
    (mode !== 'join' || (!!roomState.gameId && !roomIsFull));

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
    unsubscribe?.();
    roomCode = normalizeRoomCode(code);
    joinCode = roomCode;
    roomState = emptyRoomState();
    formError = '';
    unsubscribe = roomService.subscribeRoom(
      services.db,
      roomCode,
      (nextState) => {
        roomState = nextState;
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
        console.error(error);
        formError = 'The immutable room stream could not be read.';
      }
    );
  }

  onMount(async () => {
    try {
      const { initializeFirebase } = await import('$lib/firebase');
      services = await initializeFirebase();
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
      clockInterval = setInterval(() => (clockNow = Date.now()), 250);
    } catch (error) {
      console.error(error);
      connectionState = 'error';
      connectionMessage = 'Firebase configuration required';
    }
  });

  onDestroy(() => {
    unsubscribe?.();
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

  async function configureRiskyExchange() {
    if (!services || !roomService || !isHost || roomState.players.length < 2) return;
    pending = true;
    formError = '';
    try {
      await roomService.configureRace(services.db, services.user, roomCode, {
        config: riskyExchangeConfig(setupSeed.trim() || 'RISKY-2005', setupLives)
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
    if (selectedProgramCardIds.includes(cardId)) {
      selectedProgramCardIds = selectedProgramCardIds.filter((selected) => selected !== cardId);
    } else if (selectedProgramCardIds.length < 5) {
      selectedProgramCardIds = [...selectedProgramCardIds, cardId];
    }
  }

  async function submitProgramCards() {
    if (
      !services ||
      !roomService ||
      selectedProgramCardIds.length !== 5 ||
      programmingPlayer?.submitted
    ) return;
    pending = true;
    try {
      await roomService.submitProgram(services.db, services.user, roomCode, selectedProgramCardIds);
      selectedProgramCardIds = [];
    } catch (error) {
      console.error(error);
      formError = 'The immutable Program submission could not be written.';
    } finally {
      pending = false;
    }
  }

  async function claimTimeout() {
    const targetUid = roomState.programming?.deadlinePlayerUid;
    if (!services || !roomService || !targetUid || deadlineSeconds !== 0) return;
    pending = true;
    try {
      await roomService.claimProgramTimeout(services.db, services.user, roomCode, targetUid);
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
      await roomService.chooseEffect(services.db, services.user, roomCode, {
        kind: 'reentry',
        x: Number(x),
        y: Number(y),
        facing: facing as 'north' | 'east' | 'south' | 'west'
      });
      selectedReentryChoice = '';
    } catch (error) {
      console.error(error);
      formError = 'The re-entry choice could not be written.';
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
      <span role="status" data-status={connectionState}>{connectionMessage}</span>
    </div>
  </header>

  {#if mode === 'room' && currentPlayer && roomState.setup && roomState.configuration}
    <section class="configured-race" aria-labelledby="race-heading">
      <CourseBoard setup={roomState.setup} robots={roomState.resolution?.robots} />
      <aside
        class:resolution-active={!!roomState.resolution}
        class:many-robots={roomState.setup.players.length >= 3}
        class="setup-summary"
      >
        <p class="eyebrow">
          <span>{roomState.resolution ? '05' : showProgramming ? '04' : '03'}</span>
          {roomState.resolution ? 'PRIORITY RESOLUTION' : showProgramming ? 'SHARED DECK / TURN 1' : 'SEEDED RACE SETUP'}
        </p>
        <h1 id="race-heading">
          {showProgramming ? 'Program.' : 'Ready.'}<br />
          <em>{showProgramming ? 'Secret.' : 'Race.'}</em>
        </h1>
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
          <div><dt>3</dt><dd>flags</dd></div>
        </dl>
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
        {#if showProgramming && programmingPlayer && roomState.programming}
          <section class="program-console" aria-labelledby="hand-heading">
            <div class="program-head">
              <h2 id="hand-heading">Your hand · {programmingPlayer.hand.length || 'submitted'}</h2>
              <span>{selectedProgramCardIds.length}/5 registers</span>
            </div>
            <p class="conservation" data-testid="program-conservation">
              {programCardZones(roomState.programming).size}/84 cards accounted ·
              {roomState.programming.drawPile.length} undealt ·
              {roomState.programming.currentTurnDiscard.length} turn discard
            </p>
            {#if programmingPlayer.submitted}
              <p class="submission-state">Program committed. It cannot be inspected or changed.</p>
            {:else}
              <div class="program-hand" aria-label="Your Program hand">
                {#each programmingPlayer.hand as cardId}
                  {@const card = cardForId(cardId)}
                  {@const selectedIndex = selectedProgramCardIds.indexOf(cardId)}
                  <button
                    type="button"
                    class:selected={selectedIndex >= 0}
                    aria-pressed={selectedIndex >= 0}
                    aria-label={`${card?.action} priority ${card?.priority}`}
                    onclick={() => toggleProgramCard(cardId)}
                  >
                    <small>{selectedIndex >= 0 ? `R${selectedIndex + 1}` : card?.priority}</small>
                    <strong>{card?.action.replaceAll('-', ' ')}</strong>
                  </button>
                {/each}
              </div>
              <ol class="chosen-registers" aria-label="Chosen registers">
                {#each Array(5) as _, index}
                  {@const card = cardForId(selectedProgramCardIds[index] ?? null)}
                  <li><span>R{index + 1}</span>{card ? `${card.action} ${card.priority}` : 'empty'}</li>
                {/each}
              </ol>
              <p class="preview-note">
                Preview excludes robots and unrevealed board outcomes.
                {programPreview.join(' · ')}
              </p>
              <button
                type="button"
                onclick={submitProgramCards}
                disabled={pending || selectedProgramCardIds.length !== 5}
              >Submit immutable program</button>
            {/if}

            <ul class="opponent-programs" aria-label="Program submission status">
              {#each roomState.programming.players as player}
                {#if player.uid !== currentPlayer.uid}
                  {@const roomPlayer = roomState.players.find(({ uid }) => uid === player.uid)}
                  <li>
                    <strong>{roomPlayer?.name}</strong>
                    {#if roomState.programming.phase === 'programmed'}
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
            {#if roomState.programming.deadlinePlayerUid}
              {@const timedPlayer = roomState.players.find(({ uid }) => uid === roomState.programming?.deadlinePlayerUid)}
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
                  Turn 1 {roomState.resolution.phase === 'turn-complete' ? 'complete' : 'awaiting re-entry'}
                  · {roomState.resolution.trace.length} microsteps
                </h2>
                <ul class="robot-state" aria-label="Robot Life and damage state">
                  {#each roomState.resolution.robots as robot}
                    <li>
                      <strong>{robot.name}</strong>
                      <span>
                        {robot.status} · {robot.lives} Lives · {robot.damage} Damage
                        {robot.lockedRegisters.length
                          ? ` · Locked ${robot.lockedRegisters.map(({ register }) => `R${register}`).join('/')}`
                          : ''}
                      </span>
                    </li>
                  {/each}
                </ul>
                <p class="reentry-policy">
                  Shared archive safety: later destructions choose an empty adjacent cell and a
                  facing with no robot in line of sight within three spaces.
                </p>
                <p class="board-phase">
                  Board phase: express conveyors → all conveyors → register pushers → gears →
                  one laser snapshot. Exchange prints no pushers; fixtures cover that stage.
                  Damage 9 repeats all five locked registers.
                </p>
                {#if reentryChoices.length > 0}
                  <div class="reentry-choice">
                    <label>
                      Re-entry cell and facing
                      <select bind:value={selectedReentryChoice} aria-label="Re-entry cell and facing">
                        <option value="">Choose a legal placement</option>
                        {#each reentryChoices as choice}
                          <option value={`${choice.x},${choice.y},${choice.facing}`}>
                            ({choice.x},{choice.y}) facing {choice.facing}
                          </option>
                        {/each}
                      </select>
                    </label>
                    <button
                      type="button"
                      onclick={submitReentryChoice}
                      disabled={pending || !selectedReentryChoice}
                    >Confirm re-entry</button>
                  </div>
                {:else if roomState.resolution.nextReentryUid}
                  {@const nextReentryPlayer = roomState.players.find(({ uid }) => uid === roomState.resolution?.nextReentryUid)}
                  <p class="reentry-wait">Waiting for {nextReentryPlayer?.name} to choose re-entry.</p>
                {/if}
                <ol aria-label="Resolution feed" aria-live="polite">
                  {#each roomState.resolution.trace.slice(-5) as entry, index}
                    <li style={`--trace-index:${index}`}>
                      <span>{entry.register <= 5 ? `R${entry.register}` : 'CLEANUP'} · {entry.priority ?? 'SYS'}</span>
                      {entry.text}
                    </li>
                  {/each}
                </ol>
                <details class="full-resolution">
                  <summary>Full resolution text</summary>
                  <ol aria-label="Full resolution feed">
                    {#each roomState.resolution.trace as entry}
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
            Every robot’s archive begins on its Dock cell. Option cards remain disabled until their
            complete 2005 manifest is reviewed.
          </p>
          <button class="open-programming" type="button" onclick={() => (showProgramming = true)}>
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
        {#if roomState.players.length >= 2}
          <div class="race-config" aria-label="Risky Exchange configuration">
            {#if isHost}
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
              <button type="button" onclick={configureRiskyExchange} disabled={pending}>
                {roomState.configuration ? 'Replace configuration' : 'Configure Risky Exchange'}
              </button>
            {:else if !roomState.configuration}
              <p>Host is configuring Risky Exchange.</p>
            {/if}
            {#if roomState.configuration}
              <p class="configuration-lock">
                Risky Exchange · seed {roomState.configuration.seed} ·
                {roomState.configuration.lives} Lives
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
            Host may configure the reviewed Risky Exchange course.
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
  :global(button), :global(input) { font: inherit; }

  .shell {
    display: grid;
    grid-template-rows: 68px minmax(0, 1fr) 46px;
    width: min(100% - 48px, 1180px);
    height: 100dvh;
    margin: 0 auto;
  }

  .masthead, footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .masthead { border-bottom: 1px solid #344043; }
  .brand {
    display: flex;
    flex: none;
    gap: 12px;
    align-items: center;
    color: #eef4ee;
    font-family: 'Space Mono', monospace;
    font-size: 16px;
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
    font-size: 8px;
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
    gap: 8px;
    align-items: center;
    color: #8e9a9c;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .signal {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffb84d;
    box-shadow: 0 0 9px rgba(255, 184, 77, 0.55);
  }
  .signal.online { background: #d2ff37; box-shadow: 0 0 10px rgba(210, 255, 55, 0.6); }

  .hero {
    display: grid;
    grid-template-columns: minmax(360px, 0.82fr) minmax(500px, 1.18fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: center;
    min-height: 0;
    padding: 32px 0;
  }
  .eyebrow {
    margin: 0 0 18px;
    color: #899597;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.13em;
  }
  .eyebrow span { margin-right: 9px; color: #d2ff37; }
  h1 {
    margin: 0;
    color: #f1f5f0;
    font-family: 'Space Mono', monospace;
    font-size: clamp(48px, 5.3vw, 76px);
    line-height: 0.91;
    letter-spacing: -0.075em;
    text-transform: uppercase;
  }
  h1 em { color: transparent; font-style: normal; -webkit-text-stroke: 1px #aebbba; }
  .lede {
    max-width: 470px;
    margin: 22px 0 0;
    color: #a9b4b2;
    font-size: 16px;
    line-height: 1.55;
  }
  .actions {
    display: grid;
    grid-template-columns: auto auto 1fr;
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
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  button.secondary { color: #a5b0ae; border-color: #4e5a5c; background: transparent; }
  button:disabled { cursor: not-allowed; opacity: 0.54; }
  .actions p { margin: 0 0 0 4px; color: #657173; font-size: 11px; line-height: 1.3; }
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
    font-size: 18px;
    font-weight: 700;
  }
  .facts dd { margin: 2px 0 0; color: #718083; font-size: 10px; text-transform: uppercase; }

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
    font-size: 9px;
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
    font-size: 11px;
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
    font: 700 15px 'Space Mono', monospace;
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
    font: 8px 'Space Mono', monospace;
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
  .register-number { color: #657275; font: 8px 'Space Mono', monospace; text-align: left; }
  .registers strong {
    align-self: center;
    color: #d2ff37;
    font: 700 24px 'Space Mono', monospace;
  }
  .registers li > span:nth-of-type(2) {
    overflow: hidden;
    font-size: 9px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .registers small { position: absolute; top: 7px; right: 7px; color: #f2d372; font: 8px 'Space Mono', monospace; }

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
    font: 700 11px 'Space Mono', monospace;
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
    font-size: 20px;
  }
  .join-panel label, .join-panel legend {
    color: #899597;
    font: 9px 'Space Mono', monospace;
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
    font: 700 14px 'Space Mono', monospace;
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
    font-size: 8px;
    text-align: left;
  }
  .robot-options button span { color: #d2ff37; font-size: 9px; }
  .robot-options button.selected {
    border-color: #d2ff37;
    color: #edf3ed;
    background: #1a2418;
  }
  .stream-note, .form-error {
    margin: 0;
    color: #93a09f;
    font-size: 11px;
  }
  .form-error { color: #ffbf69; }

  .lobby {
    display: grid;
    grid-template-columns: minmax(310px, 0.72fr) minmax(520px, 1.28fr);
    gap: clamp(32px, 6vw, 84px);
    align-items: center;
    min-height: 0;
    padding: 32px 0;
  }
  .room-console h1 { font-size: clamp(48px, 5vw, 70px); }
  .room-console h1 em {
    color: #d2ff37;
    font-size: 0.8em;
    letter-spacing: 0.04em;
    -webkit-text-stroke: 0;
  }
  .room-actions { display: flex; gap: 14px; align-items: center; margin-top: 23px; }
  .text-link {
    color: #a9b4b2;
    font: 9px 'Space Mono', monospace;
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
  .room-facts dt { color: #d2ff37; font: 700 18px 'Space Mono', monospace; }
  .room-facts dd {
    margin: 3px 0 0;
    color: #718083;
    font-size: 8px;
    text-transform: uppercase;
  }
  .identity {
    margin: 13px 0 0;
    color: #718083;
    font: 8px 'Space Mono', monospace;
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
  .seat-number { color: #5f6d70; font: 8px 'Space Mono', monospace; }
  .robot-token {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 1px solid #839d2b;
    color: #101510;
    background: #d2ff37;
    font: 700 10px 'Space Mono', monospace;
  }
  .robot-token.empty { border-color: #303b3e; color: #4f5b5e; background: transparent; }
  .seat-name { display: grid; min-width: 0; gap: 3px; }
  .seat-name strong {
    overflow: hidden;
    color: #e7ede8;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seat-name small { color: #718083; font: 7px 'Space Mono', monospace; text-transform: uppercase; }
  .seat-state { color: #637174; font: 7px 'Space Mono', monospace; text-transform: uppercase; }
  .claimed .seat-state { color: #d2ff37; }
  .room-ready {
    margin: 10px 0 0;
    padding: 9px 10px;
    border: 1px solid #354245;
    color: #829093;
    background: #101617;
    font: 8px 'Space Mono', monospace;
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
    font: 8px 'Space Mono', monospace;
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
    font: 9px 'Space Mono', monospace;
  }
  .race-config button, .race-config p { grid-column: 1 / -1; }
  .race-config p {
    margin: 0;
    color: #839194;
    font: 8px/1.4 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .race-config .configuration-lock { color: #d2ff37; }
  .configured-race {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(500px, 1.3fr) minmax(300px, .7fr);
    gap: clamp(20px, 4vw, 54px);
    padding: 20px 0;
  }
  .setup-summary {
    align-self: center;
    min-width: 0;
  }
  .setup-summary h1 { font-size: clamp(42px, 4.6vw, 64px); }
  .setup-summary h1 em { color: #d2ff37; -webkit-text-stroke: 0; }
  .setup-summary .lede strong { color: #eef4ee; font-family: 'Space Mono', monospace; }
  .setup-facts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 17px 0 0;
    border-top: 1px solid #344043;
    border-bottom: 1px solid #344043;
  }
  .setup-facts div { padding: 9px 4px; }
  .setup-facts dt { color: #d2ff37; font: 700 16px 'Space Mono', monospace; }
  .setup-facts dd { margin: 2px 0 0; color: #718083; font-size: 8px; text-transform: uppercase; }
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
  .setup-order li > span { grid-row: 1 / 3; color: #d2ff37; font: 700 10px 'Space Mono', monospace; }
  .setup-order strong { color: #e7ede8; font-size: 11px; }
  .setup-order small { grid-column: 2 / 4; color: #778487; font: 7px 'Space Mono', monospace; text-transform: uppercase; }
  .setup-order em { color: #ffcf4b; font: 7px 'Space Mono', monospace; font-style: normal; text-transform: uppercase; }
  .archive-note {
    margin: 10px 0 0;
    color: #778487;
    font-size: 10px;
    line-height: 1.4;
  }
  .setup-order.compact { max-height: 105px; }
  .setup-order.compact li { padding: 5px 7px; }
  .program-console {
    display: grid;
    gap: 6px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid #344043;
  }
  .program-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .program-head h2 {
    margin: 0;
    color: #eef4ee;
    font: 700 10px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .program-head span { color: #d2ff37; font: 8px 'Space Mono', monospace; text-transform: uppercase; }
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
    font: 7px 'Space Mono', monospace;
  }
  .program-hand strong {
    overflow: hidden;
    font: 700 7px 'Space Mono', monospace;
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
    font: 6px 'Space Mono', monospace;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .chosen-registers span { color: #d2ff37; }
  .preview-note, .submission-state {
    margin: 0;
    color: #778487;
    font-size: 8px;
    line-height: 1.35;
  }
  .conservation {
    margin: 0;
    color: #ffcf4b;
    font: 7px 'Space Mono', monospace;
    text-transform: uppercase;
  }
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
    font: 7px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .opponent-programs strong { color: #eef4ee; }
  .deadline { gap: 7px; border-color: #8b7130; color: #ffcf4b; }
  .deadline button { min-height: 28px; padding: 0 6px; font-size: 7px; }
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
    font: 700 8px 'Space Mono', monospace;
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
    font: 7px 'Space Mono', monospace;
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
  .reentry-policy { margin: 0; color: #778487; font-size: 7px; line-height: 1.3; }
  .board-phase { margin: 0; color: #6e9691; font-size: 7px; line-height: 1.3; }
  .reentry-choice label {
    display: grid;
    gap: 2px;
    color: #ffcf4b;
    font: 7px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .reentry-choice select {
    min-width: 0;
    min-height: 28px;
    border: 1px solid #536164;
    color: #eef4ee;
    background: #11191a;
    font: 8px 'Space Mono', monospace;
  }
  .reentry-choice button { min-height: 28px; padding: 0 6px; font-size: 7px; }
  .reentry-wait { margin: 0; color: #ffcf4b; font-size: 8px; }
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
    font-size: 8px;
    line-height: 1.25;
    animation: trace-in 180ms ease-out both;
    animation-delay: calc(var(--trace-index) * 18ms);
  }
  .resolution-console li span { color: #ffcf4b; font: 7px 'Space Mono', monospace; }
  .full-resolution summary {
    color: #91a09f;
    cursor: pointer;
    font: 7px 'Space Mono', monospace;
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
    font-size: 8px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  footer span:nth-child(2) { color: #95a3a1; }

  @media (max-width: 820px) {
    .shell { grid-template-rows: 58px minmax(0, 1fr) 34px; width: min(100% - 28px, 560px); }
    .masthead { align-items: center; }
    .brand { gap: 9px; font-size: 13px; }
    .brand-mark { grid-template-columns: repeat(3, 4px); gap: 2px; padding: 7px; }
    .brand-mark i { width: 4px; height: 4px; }
    .network { max-width: 125px; margin-left: auto; font-size: 8px; text-align: right; }
    .hero {
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 15px;
      padding: 15px 0 12px;
    }
    .copy { display: grid; grid-template-columns: 1fr auto; align-items: end; }
    .eyebrow { grid-column: 1 / -1; margin-bottom: 9px; font-size: 8px; }
    h1 { font-size: clamp(35px, 11vw, 48px); line-height: 0.9; }
    .lede { align-self: center; max-width: 190px; margin: 0 0 0 16px; font-size: 11px; line-height: 1.35; }
    .actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; margin-top: 13px; }
    .actions p { display: none; }
    button { min-height: 38px; padding: 0 10px; font-size: 9px; }
    .facts { grid-column: 1 / -1; margin-top: 12px; }
    .facts div { padding: 7px 3px 7px 0; }
    .facts dt { font-size: 14px; }
    .facts dd { font-size: 8px; }
    .telemetry { align-self: stretch; min-height: 0; padding: 9px; box-shadow: 10px 12px 0 rgba(0,0,0,.16); }
    .telemetry-head { margin-bottom: 6px; font-size: 7px; }
    .factory { height: calc(100% - 91px); min-height: 150px; }
    .registers { gap: 4px; margin-top: 6px; }
    .registers li { min-height: 75px; padding: 5px; }
    .registers strong { font-size: 17px; }
    .registers li > span:nth-of-type(2) { font-size: 7px; }
    .registers small, .register-number { font-size: 6px; }
    footer span:first-child { display: none; }
    footer { font-size: 7px; }

    .join-panel { grid-column: 1 / -1; gap: 8px; margin-top: 12px; padding: 10px; }
    .robot-options { grid-template-columns: repeat(4, 1fr); }
    .robot-options button { min-height: 35px; font-size: 7px; }
    .lobby {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      padding: 14px 0 10px;
    }
    .room-console {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 12px;
      align-items: end;
    }
    .room-console .eyebrow { grid-column: 1 / -1; }
    .room-console h1 { font-size: 34px; line-height: 0.88; }
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
      grid-template-columns: minmax(0, 1fr) 190px;
      gap: 10px;
      padding: 10px 0;
    }
    .setup-summary .eyebrow { margin-bottom: 7px; }
    .setup-summary h1 { font-size: 28px; }
    .setup-summary .lede { max-width: none; margin: 8px 0 0; font-size: 9px; }
    .setup-facts { margin-top: 8px; }
    .setup-facts div { padding: 5px 2px; }
    .setup-facts dt { font-size: 12px; }
    .setup-order { max-height: 155px; margin-top: 7px; }
    .setup-order.compact { max-height: 76px; }
    .setup-order li { grid-template-columns: 24px minmax(0, 1fr); padding: 5px; }
    .setup-order em { grid-column: 2; }
    .archive-note { margin-top: 6px; font-size: 8px; }
    .program-console { margin-top: 6px; padding-top: 6px; }
    .setup-summary.resolution-active .lede,
    .setup-summary.resolution-active > .archive-note { display: none; }
    .setup-summary.resolution-active .setup-order.compact { display: none; }
    .setup-summary.resolution-active .resolution-console ol { max-height: 70px; }
    .setup-summary.resolution-active.many-robots
      .resolution-console > ol[aria-label='Resolution feed'] li:nth-child(-n + 2) {
      display: none;
    }
    .program-hand { grid-template-columns: repeat(3, 1fr); }
    .program-hand button { min-height: 37px; padding: 10px 2px 2px; }
    .chosen-registers li { min-height: 23px; }
    .seats { grid-template-rows: repeat(4, 1fr); gap: 4px; }
    .seats li {
      min-height: 0;
      grid-template-columns: 17px 31px minmax(0, 1fr);
      gap: 5px;
      padding: 5px;
    }
    .robot-token { width: 29px; height: 29px; font-size: 8px; }
    .seat-name strong { font-size: 10px; }
    .seat-state { display: none; }
    .room-ready { margin-top: 6px; padding: 6px 7px; font-size: 7px; }
  }

  @media (max-height: 720px) and (max-width: 820px) {
    .lede, .facts { display: none; }
    .copy { grid-template-columns: 1fr; }
    .actions { margin-top: 9px; }
  }
  @media (max-width: 560px) {
    .configured-race {
      grid-template-columns: minmax(0, 1fr) 145px;
    }
    .setup-summary h1 { font-size: 22px; }
    .setup-summary .lede { font-size: 8px; }
    .setup-order small { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      transition: none !important;
      animation: none !important;
    }
  }
</style>
