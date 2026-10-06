<script lang="ts">
  import ExecutionHistory from './ExecutionHistory.svelte';
  import type { ProgramResolution } from '$lib/game/movement';
  export let rotation = 0;
  export let playerName: string;
  export let trace: ProgramResolution['trace'] = [];
  export let heading: string;
  export let detail: string;
  export let waiting = false;
  export let announce = false;
  let expanded = false;
  let collapsedHeight = 50;
  function measureHeader(node: HTMLElement) {
    const measure = () => { collapsedHeight = node.offsetHeight + 2; };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return { destroy: () => observer.disconnect() };
  }
</script>

<section class="log-slot" aria-label={`${playerName}'s game log`}>
  <div class="reader" class:sideways={rotation % 180 !== 0} style={`transform:translate(-50%, -50%) rotate(${rotation}deg)`}>
    <div class="log-card" class:expanded style={`--collapsed-height:${collapsedHeight}px`}>
      <header class:waiting use:measureHeader>
        <button class="toggle-log" type="button" aria-expanded={expanded}
          aria-label={expanded ? `Hide ${playerName}'s turn log` : `Show ${playerName}'s turn log`}
          onclick={() => expanded = !expanded}><span aria-hidden="true">▸</span></button>
        <div class="current-action" role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>
          <strong>{heading}</strong>
          <p>{detail}</p>
        </div>
      </header>
      {#if expanded}
        <div class="log-body"><ExecutionHistory {trace} /></div>
      {/if}
    </div>
  </div>
</section>

<style>
  .log-slot { position: relative; container-type: size; min-width: 0; min-height: 0; width: calc(100% + max(0px, 100cqw - 100cqh)); height: min(100cqw, 100cqh); }
  .reader {
    position: absolute; top: 50%; left: 50%;
    width: 100cqw; height: 100cqh; box-sizing: border-box;
    transition: transform 350ms ease-in-out;
  }
  .reader.sideways { width: 100cqh; height: 100cqw; }
  .log-card {
    display: grid; grid-template-rows: auto minmax(0, 1fr);
    width: 100%; height: min(100%, var(--collapsed-height)); box-sizing: border-box;
    overflow: hidden; border: 1px solid #3c5050; border-radius: 10px; background: #101919;
    transition: height 350ms ease-in-out;
  }
  .log-card.expanded { height: 100%; }
  .log-body { display: grid; grid-template-rows: minmax(0, 1fr); min-height: 0; overflow: hidden; padding: 0 8px 8px; border-top: 1px solid #4b6033; }
  .toggle-log { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; flex: 0 0 auto;
    border: none; color: #d2ff37; background: transparent; cursor: pointer; font-size: 22px; }
  .toggle-log span { transition: transform 350ms ease-in-out; }
  .expanded .toggle-log span { transform: rotate(90deg); }
  .toggle-log:focus-visible { outline: 2px solid #ffcf4b; outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { .reader, .log-card, .toggle-log span { transition: none; } }
  header { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 4px; padding: 4px; }
  .current-action { min-width: 0; }
  strong { color: #d2ff37; font: 700 clamp(11px, 0.8vw, 22px) 'Space Mono', monospace; }
  p { overflow-wrap: anywhere; margin: 4px 0; color: #c2cecc; font-size: clamp(11px, 0.75vw, 20px); line-height: 1.25; }
  .waiting strong { color: #ffcf4b; }
  .reader :global(.heading) { flex-wrap: wrap; gap: 2px 6px; }
  .reader :global(.unavailable) { display: none; }
  .reader :global(.heading span) { margin-left: 0; font-size: 10px; }
  .reader :global(.history li) { font-size: clamp(11px, 0.75vw, 20px); }
  .reader :global(.history h3) { font-size: clamp(11px, 0.8vw, 22px); }
</style>
