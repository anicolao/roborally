<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import { base } from '$app/paths';
  import BoardFace from '$lib/components/BoardFace.svelte';
  import { ALL_BOARD_FACES, boardElementCounts } from '$lib/game/board-catalog';
</script>

<svelte:head>
  <title>Robo Rally board gallery</title>
  <meta
    name="description"
    content="Review the generated raster artwork for every Robo Rally 2005 board face."
  />
</svelte:head>

<main>
  <header>
    <p>AVALON HILL 2005 · GENERATED RASTER TILE PROOF</p>
    <h1>Factory board gallery</h1>
    <span>Every preview is assembled from the reviewed semantic board manifests.</span>
  </header>

  <ol aria-label="All board face artwork">
    {#each ALL_BOARD_FACES as board}
      {@const counts = boardElementCounts(board)}
      <li>
        <a href={`${base}/boards/${board.id}`} aria-label={`Open ${board.id.replaceAll('-', ' ')} board artwork`}>
          <BoardFace {board} compact />
          <div>
            <h2>{board.id.replaceAll('-', ' ')}</h2>
            <p>{board.width} × {board.height} · {board.walls.length} walls · {Object.values(counts).reduce((sum, count) => sum + count, 0)} features</p>
          </div>
        </a>
      </li>
    {/each}
  </ol>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { background: #0b1012; color-scheme: dark; }
  :global(body) { margin: 0; background: radial-gradient(circle at 50% 0, #253235 0, #0b1012 44rem); color: #f1f5ec; font-family: 'Atkinson Hyperlegible', sans-serif; }

  main { width: min(100% - 2rem, 82rem); margin: 0 auto; padding: 3rem 0 5rem; }
  header { margin-bottom: 2.4rem; }
  header p { margin: 0 0 0.5rem; color: #7de5ef; font: 0.75rem/1.4 'Space Mono', monospace; letter-spacing: 0.12em; }
  h1 { margin: 0; font-size: clamp(2.3rem, 7vw, 5.5rem); line-height: 0.9; text-transform: uppercase; }
  header span { display: block; max-width: 38rem; margin-top: 1rem; color: #b8c7c4; font-size: 1.15rem; }
  ol { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr)); gap: 2rem; margin: 0; padding: 0; list-style: none; }
  a { display: block; padding: 0.8rem; border: 1px solid #344346; border-radius: 0.75rem; background: rgb(11 16 18 / 80%); color: inherit; text-decoration: none; transition: border-color 150ms ease, transform 150ms ease; }
  a:hover, a:focus-visible { border-color: #72dce7; transform: translateY(-0.18rem); outline: none; }
  a > div { padding: 0.85rem 0.35rem 0.2rem; }
  h2 { margin: 0; text-transform: uppercase; }
  li p { margin: 0.25rem 0 0; color: #aab8b6; font-family: 'Space Mono', monospace; font-size: 0.78rem; }
</style>
