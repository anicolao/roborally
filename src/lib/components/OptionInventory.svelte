<script lang="ts">
  import { base } from '$app/paths';
  let viewportWidth = 1280;
  $: narrow = viewportWidth <= 600;
  import OptionCardFace from '$lib/components/OptionCardFace.svelte';
  import TabletopOptionShelf from '$lib/components/TabletopOptionShelf.svelte';
  import { OPTION_CARDS_BY_ID, type OptionCardId } from '$lib/game/option-manifest';

  export let playerName: string;
  export let disabled = false;
  export let cardIds: OptionCardId[];
  let dialog: HTMLDialogElement;
  let inspectedIds: OptionCardId[] = [];
  let selectedId: OptionCardId | undefined;
  $: selectedCard = selectedId ? OPTION_CARDS_BY_ID.get(selectedId) : undefined;
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<TabletopOptionShelf
  {playerName}
  {disabled}
  {cardIds}
  oninspect={(ids, selected) => {
    inspectedIds = ids;
    selectedId = selected;
    dialog.showModal();
  }}
/>
<dialog bind:this={dialog} class="option-inspector" aria-label={`${playerName} Option inspection`}>
  <section>
    <header>
      <div><small>OPTIONS</small><h2>{playerName}</h2></div>
      <button type="button" aria-label="Close Option inspection" onclick={() => dialog.close()}>×</button>
    </header>
    {#if inspectedIds.length > 1}
      <nav class="option-inspector-tabs" aria-label={`${playerName} additional Options`}>
        {#each inspectedIds as id}
          {@const card = OPTION_CARDS_BY_ID.get(id)}
          {#if card}
            <button type="button" class:selected={selectedId === id} aria-pressed={selectedId === id}
              aria-label={`Inspect ${card.name}`} onclick={() => (selectedId = id)}>
              <img src={`${base}/assets/options/${id}-poc.webp`} alt="" /><span>{card.name}</span>
            </button>
          {/if}
        {/each}
      </nav>
    {/if}
    {#if selectedCard}<OptionCardFace card={selectedCard} size={narrow ? 'small' : 'large'} />{/if}
  </section>
</dialog>
<style>
  .option-inspector {
    position: fixed;
    z-index: 58;
    inset: 0;
    display: grid;
    padding: clamp(16px, 4vw, 100px);
    place-items: center;
    background: #050909e8;
  }
  .option-inspector > section {
    display: grid;
    width: min(92vw, 1200px);
    max-height: 94vh;
    gap: clamp(10px, 1.4vh, 24px);
    justify-items: center;
    overflow: auto;
    padding: clamp(14px, 2vw, 36px);
    border: 3px solid #ffcf4b;
    border-radius: 18px;
    background: radial-gradient(circle at top, #26383a, #0c1213 72%);
    box-shadow: 0 0 80px #ffcf4b33;
  }
  .option-inspector header {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .option-inspector header div {
    display: grid;
    gap: 3px;
  }
  .option-inspector header small {
    color: #ffcf4b;
    font:
      700 clamp(11px, 0.8vw, 18px) "Space Mono",
      monospace;
    letter-spacing: 0.12em;
  }
  .option-inspector h2 {
    margin: 0;
    font:
      700 clamp(28px, 3vw, 58px) / 1 "Space Mono",
      monospace;
    text-transform: uppercase;
  }
  .option-inspector header > button {
    width: clamp(44px, 3vw, 70px);
    height: clamp(44px, 3vw, 70px);
    flex: 0 0 auto;
    border: 2px solid #ffcf4b;
    border-radius: 50%;
    color: #ffcf4b;
    background: #11191a;
    font:
      700 clamp(28px, 2vw, 48px) / 1 "Atkinson Hyperlegible",
      sans-serif;
  }
  .option-inspector :global(.option-card) {
    width: min(76vw, 1080px);
    height: auto;
    aspect-ratio: 3 / 2;
  }
  .option-inspector-tabs {
    display: flex;
    width: 100%;
    gap: clamp(6px, 0.7vw, 14px);
    overflow-x: auto;
    padding: 4px;
  }
  .option-inspector-tabs button {
    display: grid;
    width: clamp(88px, 8vw, 150px);
    flex: 0 0 auto;
    grid-template-columns: clamp(30px, 3vw, 54px) minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    padding: 5px;
    border: 2px solid #59686a;
    border-radius: 8px;
    color: #eef4ee;
    background: #11191a;
    font:
      700 clamp(11px, 0.8vw, 16px) / 1.05 "Atkinson Hyperlegible",
      sans-serif;
    text-align: left;
  }
  .option-inspector-tabs button.selected {
    border-color: #d2ff37;
    color: #d2ff37;
    box-shadow: 0 0 12px #d2ff3744;
  }
  .option-inspector-tabs img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }
  .option-inspector-tabs span {
    overflow-wrap: anywhere;
  }

  dialog.option-inspector { width: min(94vw, 1200px); max-width: calc(100vw - 12px); max-height: calc(100dvh - 12px); height: fit-content; margin: auto; padding: 0; border: 0; color: #eef4ee; background: transparent; }
  dialog:not([open]) { display: none; }
  dialog::backdrop { background: #050909e8; }
  .option-inspector > section { width: 100%; max-height: calc(100dvh - 12px); box-sizing: border-box; }
  button { cursor: pointer; min-height: 44px; }
  button:focus-visible { outline: 3px solid #d2ff37; outline-offset: 2px; }
  @media (max-width: 600px) {
    dialog.option-inspector { width: calc(100vw - 12px); }
    .option-inspector > section { padding: 6px; gap: 8px; border-width: 1px; border-radius: 10px; }
    .option-inspector header { gap: 8px; padding: 2px; box-sizing: border-box; }
    .option-inspector h2 { font-size: 24px; overflow-wrap: anywhere; }
    .option-inspector :global(.option-card) { width: 100%; }
  }
</style>
