<script lang="ts">
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { OPTION_CARDS_BY_ID, type OptionCardId } from '$lib/game/option-manifest';
  import { tabletopOptionLayout } from '$lib/tabletop-options';

  export let playerName: string;
  export let cardIds: OptionCardId[] = [];
  export let oninspect: (cardIds: OptionCardId[], selectedCardId: OptionCardId) => void;

  let shelf: HTMLDivElement;
  let measure: HTMLButtonElement;
  let visibleCount = cardIds.length;

  function updateLayout() {
    if (!shelf || !measure) return;
    const style = getComputedStyle(shelf);
    const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
    visibleCount = tabletopOptionLayout(
      shelf.clientWidth,
      measure.getBoundingClientRect().width,
      gap,
      cardIds.length
    ).visibleCount;
  }

  $: cardKey = cardIds.join(':');
  $: if (cardKey) {
    void tick().then(updateLayout);
  }

  onMount(() => {
    const observer = new ResizeObserver(updateLayout);
    observer.observe(shelf);
    observer.observe(measure);
    updateLayout();
    return () => observer.disconnect();
  });
</script>

<div
  class="tabletop-option-shelf"
  aria-label={`${playerName} Options`}
  data-option-count={cardIds.length}
  bind:this={shelf}
>
  {#each cardIds.slice(0, visibleCount) as cardId}
    {@const card = OPTION_CARDS_BY_ID.get(cardId)}
    {#if card}
      <button
        type="button"
        class="option-icon"
        aria-label={`View ${card.name} Option for ${playerName}`}
        title={card.name}
        data-option-icon={card.id}
        onclick={() => oninspect([card.id], card.id)}
      >
        <img src={`${base}/assets/options/${card.id}-poc.webp`} alt="" draggable="false" />
      </button>
    {/if}
  {/each}
  {#if visibleCount < cardIds.length}
    {@const additionalCardIds = cardIds.slice(visibleCount)}
    <button
      type="button"
      class="option-icon option-more"
      aria-label={`View ${additionalCardIds.length} more Options for ${playerName}`}
      data-option-overflow={additionalCardIds.length}
      onclick={() => oninspect(additionalCardIds, additionalCardIds[0])}
    >…</button>
  {/if}
  <button class="option-icon option-measure" type="button" tabindex="-1" aria-hidden="true" bind:this={measure}></button>
</div>

<style>
  .tabletop-option-shelf {
    position: relative;
    display: flex;
    min-width: 0;
    gap: clamp(3px, .35vw, 8px);
    align-items: center;
    overflow: hidden;
  }
  .option-icon {
    display: grid;
    width: clamp(30px, 3vw, 64px);
    height: clamp(30px, 3vw, 64px);
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    padding: 3px;
    border: 2px solid #708083;
    border-radius: 8px;
    color: #d2ff37;
    background: radial-gradient(circle at 50% 35%, #324143, #11191a 74%);
    box-shadow: 0 3px 10px #05070799;
    font: 700 clamp(18px, 1.7vw, 34px) 'Space Mono', monospace;
  }
  .option-icon:hover,
  .option-icon:focus-visible { border-color: #d2ff37; outline: 2px solid #d2ff37; outline-offset: 1px; }
  .option-icon img { display: block; width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 3px #000c); }
  .option-more { border-color: #ffcf4b; color: #ffcf4b; }
  .option-measure { position: absolute; visibility: hidden; pointer-events: none; }
  @media (max-width: 700px) {
    .option-icon { width: 28px; height: 28px; padding: 2px; border-width: 1px; border-radius: 5px; }
  }
</style>
