<script lang="ts">
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
<dialog bind:this={dialog} aria-label={`${playerName} Option details`}>
  <div class="inspection">
    <header>
      <strong>{playerName} · Options</strong>
      <button type="button" onclick={() => dialog.close()}>Close Option details</button>
    </header>
    {#if inspectedIds.length > 1}
      <nav aria-label="Choose an Option to inspect">
        {#each inspectedIds as id}
          <button type="button" aria-pressed={selectedId === id} onclick={() => (selectedId = id)}>
            {OPTION_CARDS_BY_ID.get(id)?.name}
          </button>
        {/each}
      </nav>
    {/if}
    {#if selectedCard}<OptionCardFace card={selectedCard} size="small" />{/if}
  </div>
</dialog>

<style>
  dialog { max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); box-sizing: border-box; padding: 12px; border: 1px solid #708083; color: #eef4ee; background: #111819; }
  dialog::backdrop { background: #050909cc; }
  .inspection { display: grid; gap: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 44px; border: 1px solid #708083; color: #d2ff37; background: #111819; cursor: pointer; }
  button:focus-visible { outline: 2px solid #d2ff37; }
  @media (max-width: 360px) {
    dialog { max-width: 100vw; padding: 0; border: 0; }
    header { padding: 8px; }
  }
</style>
