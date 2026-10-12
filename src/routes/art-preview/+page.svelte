<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import CourseBoard from '$lib/components/CourseBoard.svelte';
  import { ROBOTS } from '$lib/room-model';
  import type { RaceSetup } from '$lib/game/setup';
  import type { Direction } from '$lib/game/course-manifest';

  let turn = $state(0);
  let active = $state('bit');
  let animated = $state(true);
  let boardWidth = $state('full');
  const directions: Direction[] = ['north', 'east', 'south', 'west'];
  const setup: RaceSetup = $derived({
    courseId: 'risky-exchange', startingDamage: 0, powerDownAllowed: true,
    firstPlayerUid: 'axle',
    players: ROBOTS.map((robot, index) => ({
      uid: robot.id, name: robot.name, robotId: robot.id, dock: index + 1,
      originalDockOrder: index, lives: 3,
      position: { x: 3 + (index % 4) * 2, y: index < 4 ? 4 : 7 },
      archive: { x: 3, y: 3 }, facing: directions[(index + turn) % 4]
    }))
  });
</script>

<svelte:head><title>Robot & flag preview</title></svelte:head>

<main>
  <header>
    <h1>Robot & flag preview</h1>
    <button onclick={() => turn += 1}>Rotate robots</button>
    <label>Executing
      <select bind:value={active}>
        <option value="">None</option>
        {#each ROBOTS as robot}<option value={robot.id}>{robot.name}</option>{/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={animated} /> Animated</label>
    <label>Board width
      <select bind:value={boardWidth}>
        <option value="full">Full size</option>
        <option value="680px">Desktop (680px)</option>
        <option value="320px">Phone (320px)</option>
      </select>
    </label>
    <span>Axle is your robot · Neon glow marks the executing robot</span>
  </header>
  <div class="board" style:max-width={boardWidth === 'full' ? '100%' : boardWidth}>
    <CourseBoard {setup} presentationOnly currentPlayerUid="axle"
      activeRobotUid={active} animateRobots={animated} transitionDurationMs={500} />
  </div>
</main>

<style>
  :global(body) { margin: 0; background: #0b1012; color: #eef2e9; font-family: 'Atkinson Hyperlegible', sans-serif; }
  main { height: 100dvh; display: flex; flex-direction: column; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 18px; }
  h1 { font-size: 18px; margin: 0 12px 0 0; }
  header span { font-size: 13px; color: #afbfba; }
  button, select { padding: 7px 10px; color: inherit; background: #243336; border: 1px solid #526460; border-radius: 5px; }
  label { font-size: 14px; }
  .board { width: 100%; box-sizing: border-box; align-self: center; flex: 1; min-height: 0; padding: 0 12px 12px; }
</style>
