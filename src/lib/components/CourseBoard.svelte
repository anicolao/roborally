<script lang="ts">
  import type { BoardElement, Direction } from '$lib/game/course-manifest';
  import { PUBLISHED_COURSES_BY_ID } from '$lib/game/course-catalog';
  import { compilePlayableCourse } from '$lib/game/playable-courses';
  import { ROBOTS } from '$lib/room-model';
  import type { RaceSetup } from '$lib/game/setup';
  import type { RaceRobotPosition } from '$lib/game/movement';

  let {
    setup,
    robots,
    currentPlayerUid,
    animateRobots = false,
    transitionDurationMs = 2_000
  }: {
    setup: RaceSetup;
    robots?: RaceRobotPosition[];
    currentPlayerUid?: string;
    animateRobots?: boolean;
    transitionDurationMs?: number;
  } = $props();

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let activeX = $state(1);
  let activeY = $state(1);
  const displayedRobots = $derived(
    robots
      ?.filter(({ status }) => status === 'active')
      .map((robot) => ({
        ...robot,
        name: setup.players.find(({ uid }) => uid === robot.uid)?.name ?? robot.uid,
        position: { x: robot.x, y: robot.y }
      })) ?? setup.players
  );

  const course = $derived(PUBLISHED_COURSES_BY_ID.get(setup.courseId)!);
  const compiledCourse = $derived(compilePlayableCourse(setup.courseId));
  const cells = $derived(
    Array.from({ length: compiledCourse.height * compiledCourse.width }, (_, index) => ({
      x: compiledCourse.minX + (index % compiledCourse.width),
      y: compiledCourse.minY + Math.floor(index / compiledCourse.width)
    }))
  );
  const boardCells = $derived(compiledCourse.cells);
  const walls = $derived(
    [...compiledCourse.walls].map((wall) => {
      const [x, y, edge] = wall.split(',');
      return { x: Number(x), y: Number(y), edge };
    })
  );
  const flags = $derived(
    new Map(course.flags.map((flag) => [`${flag.x},${flag.y}`, flag.number]))
  );
  const factoryPlacement = $derived(
    course.boardPlacements.find(({ boardId }) => !boardId.startsWith('docking-bay'))
  );
  const dockingPlacement = $derived(
    course.boardPlacements.find(({ boardId }) => boardId.startsWith('docking-bay'))
  );

  function elementLabel(element: BoardElement): string {
    if (element.kind === 'pit') return 'pit';
    if (element.kind === 'repair') return element.option ? 'repair and Option site' : 'repair site';
    if (element.kind === 'gear') return `${element.rotation} gear`;
    if (element.kind === 'dock') return `Dock ${element.number}`;
    if (element.kind === 'pusher') {
      return `pusher ${element.direction}, registers ${element.activeRegisters.join(' and ')}`;
    }
    if (element.kind === 'laser') return `${element.beamCount}-beam laser ${element.direction}`;
    return `${element.express ? 'express ' : ''}conveyor ${element.direction}`;
  }

  function arrow(direction: Direction): string {
    return { north: '↑', east: '→', south: '↓', west: '←' }[direction];
  }

  function fitCourse() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  function describeCell(x: number, y: number): string {
    const contents = boardCells.get(`${x},${y}`)?.elements.map(elementLabel) ?? [];
    const flag = flags.get(`${x},${y}`);
    const robots = displayedRobots.filter((player) => player.position.x === x && player.position.y === y);
    if (flag) contents.push(`Flag ${flag}`);
    for (const robot of robots) contents.push(`${robot.name}'s ${robot.robotId}, facing ${robot.facing}`);
    return contents.length ? `Column ${x}, row ${y}: ${contents.join(', ')}` : `Column ${x}, row ${y}: floor`;
  }

  function moveBoardCursor(event: KeyboardEvent) {
    const next = { x: activeX, y: activeY };
    if (event.key === 'ArrowLeft') next.x = Math.max(compiledCourse.minX, activeX - 1);
    else if (event.key === 'ArrowRight') next.x = Math.min(compiledCourse.minX + compiledCourse.width - 1, activeX + 1);
    else if (event.key === 'ArrowUp') next.y = Math.max(compiledCourse.minY, activeY - 1);
    else if (event.key === 'ArrowDown') next.y = Math.min(compiledCourse.minY + compiledCourse.height - 1, activeY + 1);
    else if (event.key === 'Home') next.x = compiledCourse.minX;
    else if (event.key === 'End') next.x = compiledCourse.minX + compiledCourse.width - 1;
    else return;
    event.preventDefault();
    activeX = next.x;
    activeY = next.y;
  }
</script>

<section class="course-panel" aria-labelledby="course-heading">
  <header>
    <div>
      <p>
        {setup.courseId === 'risky-exchange'
          ? 'COURSE 01 / MEDIUM / 2–8'
          : `${course.category} / ${course.length} / ${course.players[0]}–${course.players.at(-1)}`}
      </p>
      <h2 class:long-title={course.name.length > 14} id="course-heading">{course.name}</h2>
    </div>
    <div class="board-controls" aria-label="Board view controls">
      <button type="button" onclick={() => (zoom = Math.max(0.75, zoom - 0.25))} aria-label="Zoom out">−</button>
      <output aria-label="Board zoom">{Math.round(zoom * 100)}%</output>
      <button type="button" onclick={() => (zoom = Math.min(1.75, zoom + 0.25))} aria-label="Zoom in">+</button>
      <button type="button" onclick={() => (panX -= 1)} aria-label="Pan left">←</button>
      <button type="button" onclick={() => (panX += 1)} aria-label="Pan right">→</button>
      <button type="button" onclick={fitCourse}>Fit course</button>
    </div>
  </header>

  <div class="board-viewport">
    <div
      class:animating-robots={animateRobots}
      class="course-board"
      style={`--zoom:${zoom};--pan-x:${panX};--pan-y:${panY};--course-columns:${compiledCourse.width};--course-rows:${compiledCourse.height}`}
      role="grid"
      tabindex="0"
      aria-label={`${course.name} board explorer. Use arrow keys to inspect cells.`}
      aria-rowcount={compiledCourse.height}
      aria-colcount={compiledCourse.width}
      aria-activedescendant={`board-cell-${activeX}-${activeY}`}
      onkeydown={moveBoardCursor}
    >
      {#each cells as position}
        {@const manifestCell = boardCells.get(`${position.x},${position.y}`)}
        {@const flag = flags.get(`${position.x},${position.y}`)}
        <div
          class:dock-bay={manifestCell?.boardId.startsWith('docking-bay')}
          class:active-cell={position.x === activeX && position.y === activeY}
          class="board-cell"
          id={`board-cell-${position.x}-${position.y}`}
          data-coordinate={`${position.x},${position.y}`}
          role="gridcell"
          aria-label={describeCell(position.x, position.y)}
          aria-selected={position.x === activeX && position.y === activeY}
        >
          {#each manifestCell?.elements ?? [] as element}
            {#if element.kind === 'pit'}
              <span class="pit">PIT</span>
            {:else if element.kind === 'repair'}
              <span class:option={element.option} class="repair">{element.option ? '⚒' : '⌁'}</span>
            {:else if element.kind === 'conveyor'}
              <span class:express={element.express} class="conveyor">{arrow(element.direction)}</span>
            {:else if element.kind === 'dock'}
              <span class="dock">D{element.number}</span>
            {:else if element.kind === 'gear'}
              <span class="gear">{element.rotation === 'clockwise' ? '↻' : '↺'}</span>
            {:else if element.kind === 'laser'}
              <span class="laser">{arrow(element.direction)}</span>
            {:else if element.kind === 'pusher'}
              <span class="pusher">{element.activeRegisters.join('/')}</span>
            {/if}
          {/each}
          {#if flag}<span class="course-flag">{flag}</span>{/if}
          {#each walls.filter((wall) => wall.x === position.x && wall.y === position.y) as wall}
            <span class={`wall ${wall.edge}`}></span>
          {/each}
          {#each displayedRobots.filter((player) => player.position.x === position.x && player.position.y === position.y) as player}
            {@const robot = ROBOTS.find((entry) => entry.id === player.robotId)}
            <span
              class:current-player={player.uid === currentPlayerUid}
              class={`race-robot robot-${player.robotId} facing-${player.facing}`}
              title={`${player.name}, ${robot?.name}, facing ${player.facing}`}
            >
              <i></i>{robot?.mark}
            </span>
          {/each}
        </div>
      {/each}
      {#if animateRobots}
        {#each displayedRobots as player (player.uid)}
          {@const robot = ROBOTS.find((entry) => entry.id === player.robotId)}
          <span
            aria-hidden="true"
            class:current-player={player.uid === currentPlayerUid}
            class={`animated-race-robot robot-${player.robotId} facing-${player.facing}`}
            data-playback-robot={player.uid}
            style={`left:${((player.position.x - compiledCourse.minX + 0.5) / compiledCourse.width) * 100}%;top:${((player.position.y - compiledCourse.minY + 0.5) / compiledCourse.height) * 100}%;--playback-duration:${transitionDurationMs}ms`}
          >
            <i></i>{robot?.mark}
          </span>
        {/each}
      {/if}
    </div>
  </div>
  <p class="board-position" aria-live="polite" aria-atomic="true">
    {describeCell(activeX, activeY)}
  </p>

  <details class="text-equivalent">
    <summary>Course text equivalent</summary>
    {#if setup.courseId === 'risky-exchange'}
      <p>
        Coordinates begin at the Exchange board’s upper-left. Docking Bay A occupies rows 13–16.
        Robots face north, toward the factory. A cell omitted from the list is ordinary floor.
      </p>
    {:else}
      <p>
        Coordinates begin at the {factoryPlacement?.boardId.replaceAll('-', ' ')} board’s upper-left.
        {dockingPlacement?.boardId.replaceAll('-', ' ')} supplies the starting docks.
        Robots face north, toward the factory. A cell omitted from the list is ordinary floor.
      </p>
    {/if}
    <ul>
      {#each cells.filter(({ x, y }) => describeCell(x, y) !== `Column ${x}, row ${y}: floor`) as position}
        <li>{describeCell(position.x, position.y)}</li>
      {/each}
    </ul>
  </details>
</section>

<style>
  .course-panel {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 8px;
    overflow: hidden;
    padding: 12px;
    border: 1px solid #435052;
    background: rgba(16, 23, 25, 0.96);
  }
  header { display: flex; min-width: 0; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
  header > div:first-child { min-width: 0; }
  p { margin: 0; color: #7f8d8f; font: 16px 'Space Mono', monospace; letter-spacing: .08em; }
  h2 { margin: 2px 0 0; overflow-wrap: break-word; color: #eef4ee; font: 700 36px 'Space Mono', monospace; text-transform: uppercase; }
  .board-controls {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    align-items: center;
  }
  button {
    min-width: 32px;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid #566366;
    color: #d2ff37;
    background: #11191a;
    font: 700 18px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  output { min-width: 38px; color: #a7b2b1; font: 18px 'Space Mono', monospace; text-align: center; }
  .board-viewport {
    min-height: 0;
    overflow: hidden;
    border: 1px solid #344144;
    background: #090d0e;
  }
  .course-board {
    position: relative;
    display: grid;
    width: min(100%, 480px);
    height: 100%;
    min-height: 0;
    grid-template-columns: repeat(var(--course-columns), 1fr);
    grid-template-rows: repeat(var(--course-rows), 1fr);
    margin: 0 auto;
    transform: translate(calc(var(--pan-x) * 16px), calc(var(--pan-y) * 16px)) scale(var(--zoom));
    transform-origin: center;
    transition: transform 120ms ease;
  }
  .course-board:focus-visible {
    outline: 3px solid #d2ff37;
    outline-offset: 2px;
  }
  .board-cell {
    position: relative;
    min-width: 0;
    border-right: 1px solid #344346;
    border-bottom: 1px solid #344346;
    background: #182224;
  }
  .board-cell:nth-child(12n + 1) { border-left: 1px solid #344346; }
  .board-cell:nth-child(-n + 12) { border-top: 1px solid #344346; }
  .board-cell.dock-bay { background: #222a2b; }
  .course-board:focus .board-cell.active-cell { box-shadow: inset 0 0 0 2px #d2ff37; }
  .pit {
    position: absolute; inset: 4px;
    display: grid; place-items: center;
    color: #788184; background: #030505;
    font: 12px 'Space Mono', monospace;
  }
  .repair, .gear, .conveyor, .dock, .laser, .pusher {
    position: absolute; inset: 1px;
    display: grid; place-items: center;
    color: #8ddad0;
    font: 700 22px 'Space Mono', monospace;
  }
  .repair { color: #ffcf4b; }
  .repair.option { color: #ee8bff; }
  .gear { color: #ff9a6a; }
  .laser { color: #ff6961; background: linear-gradient(90deg, transparent 42%, #ff6961 42% 58%, transparent 58%); }
  .pusher { color: #ffcf4b; }
  .conveyor { background: repeating-linear-gradient(135deg, #133936 0 3px, #102b2a 3px 6px); }
  .conveyor.express { color: white; box-shadow: inset 0 0 0 2px #337c76; }
  .dock { color: #91a0a2; font-size: 16px; }
  .course-flag {
    position: absolute; z-index: 3; top: 50%; left: 50%;
    display: grid; width: 18px; height: 18px; place-items: center;
    border-radius: 50%;
    color: #101510; background: #ffcf4b;
    font: 700 18px 'Space Mono', monospace;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 2px #151b1b;
  }
  .wall { position: absolute; z-index: 2; background: #ff7c63; box-shadow: 0 0 4px #ff7c63; }
  .wall.north, .wall.south { right: 0; left: 0; height: 2px; }
  .wall.north { top: -1px; } .wall.south { bottom: -1px; }
  .wall.east, .wall.west { top: 0; bottom: 0; width: 2px; }
  .wall.east { right: -1px; } .wall.west { left: -1px; }
  .race-robot {
    position: absolute; z-index: 4; top: 50%; left: 50%;
    display: grid; width: 23px; height: 20px; place-items: center;
    border: 2px solid #090d0e; border-radius: 3px;
    color: #0c120d; background: var(--robot-color, #d2ff37);
    font: 700 14px 'Space Mono', monospace;
    transform: translate(-50%, -50%);
  }
  .course-board.animating-robots .race-robot { opacity: 0; }
  .animated-race-robot {
    position: absolute;
    z-index: 5;
    display: grid;
    width: 23px;
    height: 20px;
    place-items: center;
    border: 2px solid #090d0e;
    border-radius: 3px;
    color: #0c120d;
    background: var(--robot-color, #d2ff37);
    font: 700 14px 'Space Mono', monospace;
    transform: translate(-50%, -50%);
    transition:
      left var(--playback-duration) ease-in-out,
      top var(--playback-duration) ease-in-out,
      transform var(--playback-duration) ease-in-out;
  }
  .race-robot i, .animated-race-robot i {
    position: absolute; top: -7px; left: 8px;
    width: 4px; height: 7px; background: var(--robot-color, #d2ff37);
  }
  .robot-axle { --robot-color: #65d8ff; }
  .robot-bit { --robot-color: #ffb454; }
  .robot-cog { --robot-color: #ff79c6; }
  .robot-dash { --robot-color: #b993ff; }
  .robot-flux { --robot-color: #72e0c2; }
  .robot-gizmo { --robot-color: #ff887d; }
  .robot-hex { --robot-color: #e8edb5; }
  .robot-rivet { --robot-color: #9ad1ff; }
  .race-robot.current-player, .animated-race-robot.current-player {
    --robot-color: #d2ff37;
    box-shadow: 0 0 0 2px #d2ff37, 0 0 12px rgba(210, 255, 55, .9);
  }
  .facing-east { transform: translate(-50%, -50%) rotate(90deg); }
  .facing-south { transform: translate(-50%, -50%) rotate(180deg); }
  .facing-west { transform: translate(-50%, -50%) rotate(270deg); }
  .text-equivalent {
    max-height: 90px;
    overflow: auto;
    color: #9da9a8;
    font-size: 20px;
  }
  .board-position {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  summary { color: #d2ff37; cursor: pointer; font: 18px 'Space Mono', monospace; text-transform: uppercase; }
  details:not([open]) > p, details:not([open]) > ul { display: none; }
  .text-equivalent p { margin: 8px 0; font: 20px/1.4 'Atkinson Hyperlegible', sans-serif; }
  ul { margin: 0; padding-left: 18px; }
  @media (max-width: 720px) {
    header { align-items: flex-start; }
    h2 { font-size: 28px; }
    h2.long-title { font-size: 20px; }
  }
  @media (max-height: 560px) and (orientation: landscape) {
    .course-panel {
      gap: 3px;
      padding: 4px;
    }
    header { flex-wrap: wrap; gap: 4px; }
    header p { display: none; }
    h2 { margin: 0; font-size: 20px; }
    .board-controls {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(5, minmax(23px, 1fr)) auto;
    }
    button {
      min-width: 23px;
      min-height: 23px;
      padding: 0 4px;
      font-size: 12px;
    }
    output {
      min-width: 27px;
      font-size: 12px;
    }
    .course-board { min-height: 0; }
    .text-equivalent { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .course-board { transition: none; }
    .animated-race-robot { transition: none; }
  }
</style>
