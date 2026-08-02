<script lang="ts">
  import '@fontsource/space-mono/400.css';
  import { base } from '$app/paths';
  import BoardFace from '$lib/components/BoardFace.svelte';
  import { BOARD_FACES_BY_ID } from '$lib/game/board-catalog';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const board = $derived(BOARD_FACES_BY_ID.get(data.boardId)!);
</script>

<svelte:head>
  <title>{board.id.replaceAll('-', ' ')} board — Robo Rally</title>
  <meta
    name="description"
    content={`Generated raster tile validation view for the ${board.id.replaceAll('-', ' ')} board face.`}
  />
</svelte:head>

<main data-e2e-layout>
  <a class="visually-hidden" href={`${base}/boards/`}>Back to all board faces</a>
  <h1 class="visually-hidden">{board.id.replaceAll('-', ' ')} board face</h1>
  <p class="visually-hidden" role="status" data-status="synced">Raster asset preview ready</p>
  <BoardFace {board} />
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { min-height: 100%; background: #080c0e; color-scheme: dark; }
  :global(body) { min-height: 100vh; margin: 0; background: radial-gradient(circle, #243034 0, #11181a 42rem, #080c0e 100%); }
  main { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
