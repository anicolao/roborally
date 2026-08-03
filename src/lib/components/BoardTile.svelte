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
  const oppositeDirection: Record<Direction, Direction> = {
    north: 'south',
    east: 'west',
    south: 'north',
    west: 'east'
  };
  const cornerWalls: readonly {
    edges: readonly [Direction, Direction];
    rotation: number;
  }[] = [
    { edges: ['north', 'west'], rotation: 0 },
    { edges: ['north', 'east'], rotation: 90 },
    { edges: ['south', 'east'], rotation: 180 },
    { edges: ['south', 'west'], rotation: 270 }
  ];

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
    [...elements]
      .filter((element) => element.kind !== 'laser')
      .sort((left, right) => elementPriority[right.kind] - elementPriority[left.kind])[0]
  );
  const conveyorLayers = $derived.by(() => {
    if (primaryElement?.kind !== 'conveyor') return [];
    if (!primaryElement.incomingDirections) {
      return [
        {
          incomingDirection: primaryElement.direction,
          turn: primaryElement.turn
        }
      ];
    }
    return primaryElement.incomingDirections.map((incomingDirection) => ({
      incomingDirection,
      turn: conveyorTurn(incomingDirection, primaryElement.direction)
    }));
  });
  const laser = $derived(elements.find((element) => element.kind === 'laser'));
  const laserIsSource = $derived(
    !!laser && walls.some((wall) => wall.edge === oppositeDirection[laser.direction])
  );
  const pusher = $derived(elements.find((element) => element.kind === 'pusher'));
  const dock = $derived(elements.find((element) => element.kind === 'dock'));
  const joinedWallCorners = $derived(
    cornerWalls.filter(({ edges }) =>
      edges.every((edge) => walls.some((wall) => wall.edge === edge))
    )
  );

  function assetFor(element: BoardElement): string {
    if (element.kind === 'repair') return element.option ? 'repair-option.webp' : 'repair.webp';
    if (element.kind === 'gear') {
      return element.rotation === 'clockwise'
        ? 'gear-clockwise.webp'
        : 'gear-counterclockwise.webp';
    }
    if (element.kind === 'conveyor') {
      if (element.turn) {
        return element.express ? 'conveyor-express-turn.webp' : 'conveyor-turn.webp';
      }
      return element.express ? 'conveyor-express.webp' : 'conveyor.webp';
    }
    return `${element.kind}.webp`;
  }

  function conveyorTurn(
    from: Direction,
    to: Direction
  ): 'left' | 'right' | undefined {
    if (from === to) return undefined;
    const order: Direction[] = ['north', 'east', 'south', 'west'];
    const difference = (order.indexOf(to) - order.indexOf(from) + 4) % 4;
    return difference === 1 ? 'right' : difference === 3 ? 'left' : undefined;
  }

  function conveyorAsset(express: boolean, turn: 'left' | 'right' | undefined): string {
    if (turn) return express ? 'conveyor-express-turn.webp' : 'conveyor-turn.webp';
    return express ? 'conveyor-express.webp' : 'conveyor.webp';
  }

  function rotationFor(element: BoardElement): number {
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
    const incoming = element.incomingDirections?.join(' and ');
    return `${element.express ? 'express ' : ''}${element.turn ? `${element.turn}-rotation ` : ''}conveyor${incoming ? ` entering ${incoming} and` : ''} exiting ${element.direction}`;
  }

  const label = $derived(
    elements.length
      ? `Column ${x}, row ${y}: ${elements.map(describeElement).join('; ')}`
      : `Column ${x}, row ${y}: floor`
  );
</script>

<div class="board-tile" role="gridcell" aria-label={label} data-coordinate={`${x},${y}`}>
  <img
    class="base-art"
    src={`${base}/assets/board-tiles/floor.webp`}
    alt=""
    draggable="false"
  />

  {#if primaryElement?.kind === 'conveyor'}
    {#each conveyorLayers as layer}
      <img
        class:turn-left={layer.turn === 'left'}
        class="feature-art"
        src={`${base}/assets/board-tiles/${conveyorAsset(primaryElement.express, layer.turn)}`}
        style={`--tile-rotation:${directionDegrees[layer.incomingDirection]}deg`}
        alt=""
        draggable="false"
      />
    {/each}
  {:else if primaryElement}
    <img
      class="feature-art"
      src={`${base}/assets/board-tiles/${assetFor(primaryElement)}`}
      style={`--tile-rotation:${rotationFor(primaryElement)}deg`}
      alt=""
      draggable="false"
    />
  {/if}

  {#if laser}
    <img
      class="laser-art"
      src={`${base}/assets/board-tiles/${laserIsSource ? 'laser-source' : 'laser-beam'}-${laser.beamCount}.png`}
      style={`--feature-rotation:${directionDegrees[laser.direction]}deg`}
      alt=""
      draggable="false"
    />
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

  {#each joinedWallCorners as corner}
    <img
      class="wall-corner-art"
      src={`${base}/assets/board-tiles/wall-corner.png`}
      style={`--wall-corner-rotation:${corner.rotation}deg`}
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
  }

  .base-art,
  .feature-art,
  .laser-art,
  .wall-art,
  .wall-corner-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
  }

  .base-art,
  .feature-art,
  .laser-art {
    object-fit: cover;
  }

  .feature-art {
    z-index: 2;
    transform: rotate(var(--tile-rotation));
  }

  .feature-art.turn-left {
    transform: rotate(var(--tile-rotation)) scaleX(-1);
  }

  .laser-art {
    z-index: 3;
    transform: rotate(var(--feature-rotation));
  }

  .wall-art {
    z-index: 5;
    object-fit: contain;
    transform: rotate(var(--wall-rotation));
  }

  .wall-corner-art {
    z-index: 6;
    object-fit: contain;
    transform: rotate(var(--wall-corner-rotation));
  }

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
