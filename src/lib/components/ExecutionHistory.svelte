<script lang="ts">
  import { tick } from 'svelte';
  import type { ProgramResolution } from '$lib/game/movement';

  export let trace: ProgramResolution['trace'] = [];
  let feed: HTMLOListElement;
  let following = true;
  let above = false;
  let below = false;

  function measure() {
    if (!feed) return;
    above = feed.scrollTop > 2;
    below = feed.scrollHeight - feed.clientHeight - feed.scrollTop > 2;
    following = !below;
  }
  function observe(node: HTMLOListElement) {
    const observer = new ResizeObserver(() => {
      if (following) node.scrollTop = node.scrollHeight;
      measure();
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  async function follow(entries: typeof trace) {
    const stick = following;
    await tick();
    if (feed && stick) feed.scrollTop = feed.scrollHeight;
    measure();
  }
  $: follow(trace);
  async function latest() {
    following = true;
    below = false;
    await tick();
    feed.scrollTop = feed.scrollHeight;
    measure();
  }
</script>

<section class="history" aria-label="Running turn log">
  <div class="heading">
    <h3>Turn log</h3>
    <span>{above ? '↑ Earlier moves' : 'From the start'}</span>
    <button type="button" class:unavailable={!below} disabled={!below} onclick={latest}>Latest ↓</button>
  </div>
  <!-- Keyboard users need to scroll the history independently of the controls. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <ol bind:this={feed} use:observe onscroll={measure} tabindex="0" aria-label="Running turn history">
    {#each trace as entry}
      <li><span>{entry.register <= 5 ? `R${entry.register}` : 'Cleanup'}</span> {entry.text}</li>
    {:else}
      <li class="empty">Moves will appear here as the turn plays.</li>
    {/each}
  </ol>
</section>

<style>
  .history { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 5px; }
  .heading { display: flex; align-items: center; gap: 8px; min-height: 26px; }
  .unavailable { visibility: hidden; }
  h3 { margin: 0; font-size: 14px; color: #eef4ee; }
  .heading span { margin-left: auto; color: #aebbb9; font-size: 12px; }
  button { padding: 3px 6px; border: 1px solid #70832f; border-radius: 3px; background: #182219; color: #d2ff37; cursor: pointer; font: inherit; font-size: 12px; }
  ol { overflow-anchor: none; min-height: 0; overflow: auto; scrollbar-width: thin; scrollbar-color: #879a58 #11191a; margin: 0; padding: 0; list-style: none; overscroll-behavior: contain; }
  li { padding: 5px 2px; border-top: 1px solid #293638; color: #bac5c1; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
  li span { color: #ffcf4b; font-size: 11px; font-family: 'Space Mono', monospace; }
  li:last-child { color: #eef4ee; }
  .empty { color: #aebbb9; }
</style>
