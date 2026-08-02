<script lang="ts">
  import { base } from '$app/paths';
  import type { BoardElement, Direction, Wall } from '$lib/game/course-manifest';

  let {
    elements,
    walls,
    x,
    y
  }: {
    elements: readonly BoardElement[];
    walls: readonly Wall[];
    x: number;
    y: number;
  } = $props();

  const directionDegrees: Record<Direction, number> = {
    north: 0,
    east: 90,
    south: 180,
    west: 270
  };

  const elementPriority: Record<BoardElement['kind'], number> = {
    pit: 70,
    repair: 60,
    gear: 50,
    conveyor: 40,
    pusher: 30,
    laser: 20,
    dock: 10
  };

  const primaryElement = $derived(
    [...elements].sort((left, right) => elementPriority[right.kind] - elementPriority[left.kind])[0]
  );
  const laser = $derived(elements.find((element) => element.kind === 'laser'));
  const pusher = $derived(elements.find((element) => element.kind === 'pusher'));
  const dock = $derived(elements.find((element) => element.kind === 'dock'));

  function assetFor(element: BoardElement | undefined): string {
    if (!element) return 'floor.webp';
    if (element.kind === 'repair') return element.option ? 'repair-option.webp' : 'repair.webp';
    if (element.kind === 'gear') return 'gear-clockwise.webp';
    if (element.kind === 'conveyor') {
      if (element.turn) {
        return element.express ? 'conveyor-express-turn.webp' : 'conveyor-turn.webp';
      }
      return element.express ? 'conveyor-express.webp' : 'conveyor.webp';
    }
    return `${element.kind}.webp`;
  }

  function rotationFor(element: BoardElement | undefined): number {
    if (
      element?.kind === 'conveyor' ||
      element?.kind === 'pusher' ||
      element?.kind === 'laser'
    ) {
      return directionDegrees[element.direction];
    }
    return 0;
  }

  function describeElement(element: BoardElement): string {
    if (element.kind === 'pit') return 'pit';
    if (element.kind === 'repair') return element.option ? 'repair and Option site' : 'repair site';
    if (element.kind === 'gear') return `${element.rotation} gear`;
    if (element.kind === 'dock') return `Dock ${element.number}`;
    if (element.kind === 'pusher') {
      return `pusher facing ${element.direction}, active on registers ${element.activeRegisters.join(', ')}`;
    }
    if (element.kind === 'laser') {
      return `${element.beamCount}-beam laser facing ${element.direction}`;
    }
    return `${element.express ? 'express ' : ''}${element.turn ? `${element.turn}-turn ` : ''}conveyor facing ${element.direction}`;
  }

  const label = $derived(
    elements.length
      ? `Column ${x}, row ${y}: ${elements.map(describeElement).join('; ')}`
      : `Column ${x}, row ${y}: floor`
  );
</script>

<div class="board-tile" role="gridcell" aria-label={label} data-coordinate={`${x},${y}`}>
  <img
    class:counterclockwise={
      primaryElement?.kind === 'gear' && primaryElement.rotation === 'counterclockwise'
    }
    class:turn-left={
      primaryElement?.kind === 'conveyor' && primaryElement.turn === 'left'
    }
    class="tile-art"
    src={`${base}/assets/board-tiles/${assetFor(primaryElement)}`}
    style={`--tile-rotation:${rotationFor(primaryElement)}deg`}
    alt=""
    draggable="false"
  />

  {#if laser && primaryElement?.kind !== 'laser'}
    <span
      class="laser-overlay"
      class:double={laser.beamCount === 2}
      class:triple={laser.beamCount === 3}
      style={`--feature-rotation:${directionDegrees[laser.direction]}deg`}
      aria-hidden="true"
    ></span>
  {/if}

  {#if laser && laser.beamCount > 1}
    <strong class="beam-count" aria-hidden="true">{laser.beamCount}</strong>
  {/if}

  {#if pusher}
    <strong class="register-badge" aria-hidden="true">{pusher.activeRegisters.join('·')}</strong>
  {/if}

  {#if dock}
    <strong class="dock-number" aria-hidden="true">{dock.number}</strong>
  {/if}

  {#each walls as wall}
    <img
      class="wall-art"
      src={`${base}/assets/board-tiles/wall.png`}
      style={`--wall-rotation:${directionDegrees[wall.edge]}deg`}
      alt=""
      draggable="false"
    />
  {/each}
</div>

<style>
  .board-tile {
    position: relative;
    min-width: 0;
    min-height: 0;
    aspect-ratio: 1;
    overflow: hidden;
    background: #182124;
    box-shadow: inset 0 0 0 0.5px rgb(134 161 164 / 35%);
  }

  .tile-art,
  .wall-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
  }

  .tile-art {
    object-fit: cover;
    transform: rotate(var(--tile-rotation));
  }

  .tile-art.counterclockwise,
  .tile-art.turn-left {
    transform: rotate(var(--tile-rotation)) scaleX(-1);
  }

  .wall-art {
    z-index: 5;
    object-fit: contain;
    transform: rotate(var(--wall-rotation));
  }

  .laser-overlay {
    position: absolute;
    z-index: 3;
    inset: 8% 45%;
    transform: rotate(var(--feature-rotation));
    background: #ff392f;
    box-shadow: 0 0 0.24rem #ff392f, 0 0 0.52rem rgb(255 31 24 / 90%);
  }

  .laser-overlay.double {
    box-shadow:
      -0.16rem 0 #ff392f,
      0.16rem 0 #ff392f,
      0 0 0.42rem #ff392f;
  }

  .laser-overlay.triple {
    box-shadow:
      -0.22rem 0 #ff392f,
      0.22rem 0 #ff392f,
      0 0 0.48rem #ff392f;
  }

  .beam-count,
  .register-badge,
  .dock-number {
    position: absolute;
    z-index: 7;
    display: grid;
    place-items: center;
    color: #f6fbf7;
    font-family: 'Space Mono', monospace;
    line-height: 1;
    text-shadow: 0 1px 2px #000, 0 0 4px #000;
  }

  .beam-count {
    top: 6%;
    right: 6%;
    width: 27%;
    aspect-ratio: 1;
    border: 1px solid #ff726b;
    border-radius: 50%;
    background: #650a08;
    font-size: clamp(0.34rem, 0.8vw, 0.7rem);
  }

  .register-badge {
    right: 4%;
    bottom: 5%;
    min-width: 52%;
    padding: 4%;
    border: 1px solid #f4b543;
    border-radius: 0.18rem;
    background: rgb(22 17 8 / 88%);
    color: #ffd879;
    font-size: clamp(0.38rem, 0.72vw, 0.62rem);
  }

  .dock-number {
    inset: 26%;
    border: 1px solid rgb(255 202 93 / 70%);
    border-radius: 50%;
    background: rgb(8 13 14 / 64%);
    color: #ffd56c;
    font-size: clamp(0.55rem, 1.15vw, 1.05rem);
  }
</style>
