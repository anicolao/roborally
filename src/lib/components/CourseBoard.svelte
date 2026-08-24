<script lang="ts">
  import { untrack } from 'svelte';
  import BoardTile from '$lib/components/BoardTile.svelte';
  import type { BoardElement, Direction, Wall } from '$lib/game/course-manifest';
  import { PUBLISHED_COURSES_BY_ID } from '$lib/game/course-catalog';
  import { compilePlayableCourse } from '$lib/game/playable-courses';
  import { ROBOTS } from '$lib/room-model';
  import type { RaceSetup } from '$lib/game/setup';
  import type { RaceRobotPosition, RobotLaserBeam } from '$lib/game/movement';
  import { facingDegrees, nextFacingDegrees } from '$lib/playback-presentation';

  let {
    setup,
    robots,
    currentPlayerUid,
    animateRobots = false,
    transitionDurationMs = 2_000,
    laserBeams = [],
    presentationOnly = false,
    rotatePortrait = false
  }: {
    setup: RaceSetup;
    robots?: RaceRobotPosition[];
    currentPlayerUid?: string;
    animateRobots?: boolean;
    transitionDurationMs?: number;
    laserBeams?: RobotLaserBeam[];
    presentationOnly?: boolean;
    rotatePortrait?: boolean;
  } = $props();

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let activeX = $state(1);
  let activeY = $state(1);
  let playbackRotations = $state<
    Record<string, { facing: RaceRobotPosition['facing']; degrees: number }>
  >({});
  const displayedRobots = $derived(
    robots
      // Destruction frames retain a robot's last coordinates for the resolution
      // record. Status determines whether it is still physically on the course.
      ?.filter(({ status }) => status === 'active')
      .map((robot) => ({
        ...robot,
        name: setup.players.find(({ uid }) => uid === robot.uid)?.name ?? robot.uid,
        position: { x: robot.x, y: robot.y }
      })) ?? setup.players
  );

  const course = $derived(PUBLISHED_COURSES_BY_ID.get(setup.courseId)!);
  const compiledCourse = $derived(compilePlayableCourse(setup.courseId));
  const boardIsRotated = $derived(
    presentationOnly && rotatePortrait && compiledCourse.height > compiledCourse.width
  );
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
      return { x: Number(x), y: Number(y), edge: edge as Direction };
    })
  );
  const wallsByCell = $derived(
    walls.reduce<Map<string, Wall[]>>((byCell, wall) => {
      const key = `${wall.x},${wall.y}`;
      byCell.set(key, [...(byCell.get(key) ?? []), wall]);
      return byCell;
    }, new Map())
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

  $effect(() => {
    const visibleRobots = displayedRobots;
    const isAnimating = animateRobots;
    const previous = untrack(() => playbackRotations);
    playbackRotations = Object.fromEntries(
      visibleRobots.map((robot) => {
        const prior = previous[robot.uid];
        const degrees = isAnimating && prior
          ? nextFacingDegrees(prior.facing, prior.degrees, robot.facing)
          : facingDegrees(robot.facing);
        return [robot.uid, { facing: robot.facing, degrees }];
      })
    );
  });

  function playbackRotation(robot: { uid: string; facing: RaceRobotPosition['facing'] }) {
    return playbackRotations[robot.uid]?.degrees ?? facingDegrees(robot.facing);
  }

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

  function laserBeamStyle(beam: RobotLaserBeam): string {
    const dx = beam.toX - beam.fromX;
    const dy = beam.toY - beam.fromY;
    const distance = Math.abs(dx) + Math.abs(dy);
    const angle = dx < 0 ? 180 : dy > 0 ? 90 : dy < 0 ? -90 : 0;
    const left = ((beam.fromX - compiledCourse.minX + 0.5) / compiledCourse.width) * 100;
    const top = ((beam.fromY - compiledCourse.minY + 0.5) / compiledCourse.height) * 100;
    return `--laser-left:${left}%;--laser-top:${top}%;--laser-length:${distance * 100 / compiledCourse.width}%;--laser-angle:${angle}deg;--laser-duration:${transitionDurationMs}ms`;
  }
</script>

<section
  class:presentation-only={presentationOnly}
  class="course-panel"
  aria-label={presentationOnly ? `${course.name} course` : undefined}
  aria-labelledby={presentationOnly ? undefined : 'course-heading'}
>
  {#if !presentationOnly}
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
  {/if}

  <div class="board-viewport">
    <div
      class:rotated={boardIsRotated}
      class="board-fit"
      style={`--course-aspect:${compiledCourse.width / compiledCourse.height}`}
    >
      <div
        class:animating-robots={animateRobots}
        class="course-board"
        data-tabletop-orientation={presentationOnly ? (boardIsRotated ? 'rotated' : 'natural') : undefined}
        style={`--zoom:${zoom};--pan-x:${panX};--pan-y:${panY};--course-columns:${compiledCourse.width};--course-rows:${compiledCourse.height}`}
        role="grid"
        tabindex="0"
        aria-label={presentationOnly
          ? `${course.name} course board${boardIsRotated ? ', rotated 90 degrees' : ''}`
          : `${course.name} board explorer. Use arrow keys to inspect cells.`}
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
          <BoardTile
            embedded
            elements={manifestCell?.elements ?? []}
            walls={wallsByCell.get(`${position.x},${position.y}`) ?? []}
            x={position.x}
            y={position.y}
          />
          {#if flag}<span class="course-flag">{flag}</span>{/if}
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
            class={`animated-race-robot robot-${player.robotId}`}
            data-playback-robot={player.uid}
            data-facing={player.facing}
            style={`left:${((player.position.x - compiledCourse.minX + 0.5) / compiledCourse.width) * 100}%;top:${((player.position.y - compiledCourse.minY + 0.5) / compiledCourse.height) * 100}%;--playback-duration:${transitionDurationMs}ms;transform:translate(-50%, -50%) rotate(${playbackRotation(player)}deg)`}
          >
            <i></i>{robot?.mark}
          </span>
        {/each}
      {/if}
      {#each laserBeams as beam (beam.id)}
        <span
          aria-hidden="true"
          class:double={beam.beamCount === 2}
          class="robot-laser-beam"
          data-laser-source={beam.sourceUid}
          data-laser-target={beam.targetUid}
          style={laserBeamStyle(beam)}
        ></span>
      {/each}
      </div>
    </div>
  </div>
  {#if !presentationOnly}
    <p class="board-position" aria-live="polite" aria-atomic="true">
      {describeCell(activeX, activeY)}
    </p>

    <details class="text-equivalent">
      <summary>Course text equivalent</summary>
      {#if setup.courseId === 'risky-exchange'}
        <p>
          Coordinates begin at the Exchange board’s upper-left. Docking Bay B occupies rows 13–16.
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
  {/if}
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
  .robot-laser-beam {
    position: absolute;
    z-index: 8;
    top: var(--laser-top);
    left: var(--laser-left);
    width: var(--laser-length);
    height: clamp(3px, 0.42vw, 8px);
    pointer-events: none;
    border-radius: 999px;
    background: #ff3131;
    box-shadow:
      0 0 3px #fff,
      0 0 8px #ff2a2a,
      0 0 18px #ff1010;
    transform: translateY(-50%) rotate(var(--laser-angle)) scaleX(0);
    transform-origin: left center;
    animation: robot-laser-grow var(--laser-duration) cubic-bezier(.2, .75, .25, 1) forwards;
  }
  .robot-laser-beam.double {
    height: clamp(8px, 0.9vw, 15px);
    background: linear-gradient(
      to bottom,
      #ff3131 0 30%,
      transparent 30% 70%,
      #ff3131 70% 100%
    );
  }
  .robot-laser-beam::after {
    position: absolute;
    top: 50%;
    right: 0;
    width: clamp(10px, 1.2vw, 22px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 12px 5px #ff2727, 0 0 28px 10px #ff000088;
    content: '';
    transform: translate(45%, -50%);
  }
  @keyframes robot-laser-grow {
    0% { opacity: .35; transform: translateY(-50%) rotate(var(--laser-angle)) scaleX(0); }
    100% { opacity: 1; transform: translateY(-50%) rotate(var(--laser-angle)) scaleX(1); }
  }
  .course-panel.presentation-only {
    display: block;
    height: 100%;
    padding: 0;
    border: 0;
    background: #090d0e;
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
  .presentation-only .board-viewport {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    container-type: size;
    border: 0;
  }
  .board-fit { display: contents; }
  .presentation-only .board-fit {
    position: relative;
    display: block;
    width: min(100cqw, calc(100cqh * var(--course-aspect)));
    height: min(100cqh, calc(100cqw / var(--course-aspect)));
    container-type: size;
  }
  .presentation-only .board-fit.rotated {
    width: min(100cqw, calc(100cqh / var(--course-aspect)));
    height: min(100cqh, calc(100cqw * var(--course-aspect)));
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
  .presentation-only .course-board {
    width: 100%;
    height: 100%;
    margin: 0;
    transform: none;
  }
  .presentation-only .board-fit.rotated .course-board {
    position: absolute;
    top: 0;
    left: 100%;
    width: 100cqh;
    height: 100cqw;
    transform: rotate(90deg);
    transform-origin: top left;
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
  .course-flag {
    position: absolute; z-index: 3; top: 50%; left: 50%;
    display: grid; width: 18px; height: 18px; place-items: center;
    border-radius: 50%;
    color: #101510; background: #ffcf4b;
    font: 700 18px 'Space Mono', monospace;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 2px #151b1b;
  }
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
    .robot-laser-beam {
      animation: none;
      transform: translateY(-50%) rotate(var(--laser-angle)) scaleX(1);
    }
  }
</style>
