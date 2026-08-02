<script lang="ts">
  import BoardTile from '$lib/components/BoardTile.svelte';
  import type { BoardFaceManifest } from '$lib/game/course-manifest';

  let { board, compact = false }: { board: BoardFaceManifest; compact?: boolean } = $props();

  const cells = $derived(new Map(board.cells.map((cell) => [`${cell.x},${cell.y}`, cell.elements])));
  const walls = $derived(
    board.walls.reduce<Map<string, typeof board.walls>>((byCell, wall) => {
      const key = `${wall.x},${wall.y}`;
      byCell.set(key, [...(byCell.get(key) ?? []), wall]);
      return byCell;
    }, new Map())
  );
</script>

<div
  class:compact
  class="board-face"
  data-board-face={board.id}
  style={`--board-columns:${board.width};--board-rows:${board.height}`}
  role="grid"
  aria-label={`${board.id.replaceAll('-', ' ')} board face`}
  aria-rowcount={board.height}
  aria-colcount={board.width}
>
  {#each Array(board.width * board.height) as _, index}
    {@const x = (index % board.width) + 1}
    {@const y = Math.floor(index / board.width) + 1}
    <BoardTile
      elements={cells.get(`${x},${y}`) ?? []}
      walls={walls.get(`${x},${y}`) ?? []}
      {x}
      {y}
    />
  {/each}
</div>

<style>
  .board-face {
    display: grid;
    grid-template-columns: repeat(var(--board-columns), minmax(0, 1fr));
    width: min(100%, 620px);
    overflow: hidden;
    border: clamp(2px, 0.45vw, 5px) solid #606d6e;
    border-radius: clamp(0.22rem, 0.7vw, 0.5rem);
    background: #101618;
    box-shadow:
      0 0 0 1px #111,
      0 1.2rem 3.6rem rgb(0 0 0 / 65%),
      0 0 2rem rgb(54 181 196 / 12%);
  }

  .board-face.compact {
    width: 100%;
    border-width: 2px;
    border-radius: 0.25rem;
    box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 48%);
  }
</style>
