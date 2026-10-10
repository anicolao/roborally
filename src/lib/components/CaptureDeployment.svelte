<script lang="ts">
  import type { FirebaseServices } from '$lib/firebase';
  import type { RoomState } from '$lib/room-model';
  import { chooseCaptureSetup } from '$lib/room-service';
  import { captureDeploymentCells, captureDeployingTeam, type CaptureSetupChoice } from '$lib/game/capture-deployment';
  import { compilePlayableCourse } from '$lib/game/playable-courses';
  import type { Direction } from '$lib/game/course-manifest';
  import BoardTile from './BoardTile.svelte';
  let { state: room, services, roomCode }: { state: RoomState; services: FirebaseServices; roomCode: string } = $props();
  const course = compilePlayableCourse('capture-the-flag');
  const capture = $derived(room.setup?.capture);
  const player = $derived(room.setup?.players.find(({ uid }) => uid === services.user.uid));
  const team = $derived(room.setup ? captureDeployingTeam(room.setup) : null);
  const boardId = $derived(player?.teamId ? capture?.homeBoards[player.teamId] : undefined);
  const cells = $derived(boardId ? captureDeploymentCells(boardId).filter((cell) => !room.setup?.players.some((robot) =>
    capture?.deployedUids.includes(robot.uid) && robot.position.x === cell.x && robot.position.y === cell.y)) : []);
  let selected = $state('');
  let facing: Direction = $state('north');
  let pending = $state(false);
  let error = $state('');
  async function choose(choice: CaptureSetupChoice) {
    pending = true;
    error = '';
    try { await chooseCaptureSetup(services.db, services.user, roomCode, choice); }
    catch { error = 'Unable to save your deployment. Please try again.'; }
    finally { pending = false; }
  }
</script>

{#if capture && !room.programming}
  <section aria-label="Capture the Flag deployment">
    <h2>Choose your home turf</h2>
    {#if !Object.keys(capture.homeBoards).length}
      <p>{capture.coinWinner.replace('team-', 'Team ')} won the toss and chooses a home board first.</p>
      {#if player?.teamId === capture.coinWinner}
        {#each course.course.boardPlacements as board}
          <button disabled={pending} onclick={() => choose({ kind: 'home-board', boardInstanceId: board.instanceId })}>Choose {board.boardId === 'vault' ? 'Vault' : 'Chop Shop'}</button>
        {/each}
      {/if}
    {:else if player && player.teamId === team && !capture.deployedUids.includes(player.uid)}
      <p>Choose a starting space in your home board’s back six rows, then a facing.</p>
      <div class="deployment-grid" aria-label="Starting spaces">
        {#each cells as cell}
          <button class:selected={selected === `${cell.x},${cell.y}`} style:grid-column={(cell.x - 1) % 6 + 1} style:grid-row={cell.y}
            aria-label={`Start at ${cell.x}, ${cell.y}`} aria-pressed={selected === `${cell.x},${cell.y}`}
            onclick={() => { selected = `${cell.x},${cell.y}`; }} disabled={pending}>
            <BoardTile x={cell.x} y={cell.y} elements={cell.elements} walls={['north', 'east', 'south', 'west'].filter((edge) => course.walls.has(`${cell.x},${cell.y},${edge}`)).map((edge) => ({ x: cell.x, y: cell.y, edge: edge as Direction }))} />
          </button>
        {/each}
      </div>
      <label>Facing <select bind:value={facing}><option value="north">North ↑</option><option value="east">East →</option><option value="south">South ↓</option><option value="west">West ←</option></select></label>
      <button disabled={pending || !cells.some(({ x, y }) => `${x},${y}` === selected)} onclick={() => {
        const [x, y] = selected.split(',').map(Number);
        void choose({ kind: 'deployment', x, y, facing });
      }}>Place my robot</button>
    {:else}<p>Waiting for {team?.replace('team-', 'Team ')} to place their robots.</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .deployment-grid { display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(12, 1fr); width: min(100%, 300px); aspect-ratio: 1 / 2; gap: 1px; background: #151c20; }
  .deployment-grid button { padding: 0; border: 0; position: relative; cursor: pointer; overflow: hidden; }
  .deployment-grid button.selected { outline: 3px solid #ffcf4b; outline-offset: -3px; z-index: 1; }
  .deployment-grid button:focus-visible { outline: 3px solid white; z-index: 2; }
  label { display: block; margin: .5rem 0; }
</style>
