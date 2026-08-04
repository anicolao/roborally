<script lang="ts">
  import ProgramCardFace from '$lib/components/ProgramCardFace.svelte';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import {
    REGISTER_COUNT,
    draftCardIdsInRegisterOrder,
    type ProgrammingPlayer
  } from '$lib/game/programming';

  export let player: ProgrammingPlayer;
  export let draftSlots: (ProgramCard['id'] | null)[];
  export let pending = false;
  export let heading = 'Program deck';
  export let showHeading = true;
  export let instructionsVisible = true;
  export let submitLabel = 'Submit immutable program';
  export let submittedMessage = 'Program committed. It cannot be inspected or changed.';
  export let previewText = '';
  export let ondraftchange: (slots: (ProgramCard['id'] | null)[]) => void;
  export let onprogramsubmit: () => void | Promise<void>;

  let selectedRegisterIndex: number | null = null;

  $: openRegisterCount = player.registers.filter((register) => !register.locked).length;
  $: selectedCardIds = draftCardIdsInRegisterOrder(player, draftSlots);

  function cardForId(cardId: ProgramCard['id'] | null) {
    return PROGRAM_CARDS.find((card) => card.id === cardId);
  }

  function editableRegister(index: number) {
    return !player.submitted && !player.registers[index]?.locked;
  }

  function updateDraft(nextSlots: (ProgramCard['id'] | null)[]) {
    draftSlots = nextSlots;
    ondraftchange(nextSlots);
  }

  function placeCard(cardId: ProgramCard['id'], registerIndex?: number) {
    if (player.submitted) return;
    const existingIndex = draftSlots.indexOf(cardId);
    const targetIndex = registerIndex ??
      (selectedRegisterIndex !== null && editableRegister(selectedRegisterIndex)
        ? selectedRegisterIndex
        : draftSlots.findIndex((slot, index) => slot === null && editableRegister(index)));
    if (targetIndex < 0 || !editableRegister(targetIndex)) return;

    const nextSlots = [...draftSlots];
    if (existingIndex >= 0 && existingIndex !== targetIndex) nextSlots[existingIndex] = null;
    nextSlots[targetIndex] = cardId;
    selectedRegisterIndex = null;
    updateDraft(nextSlots);
  }

  function tapCard(cardId: ProgramCard['id']) {
    if (player.submitted) return;
    const existingIndex = draftSlots.indexOf(cardId);
    if (existingIndex >= 0) {
      const nextSlots = [...draftSlots];
      nextSlots[existingIndex] = null;
      selectedRegisterIndex = existingIndex;
      updateDraft(nextSlots);
      return;
    }
    placeCard(cardId);
  }

  function tapSlot(registerIndex: number) {
    if (!editableRegister(registerIndex)) return;
    const nextSlots = [...draftSlots];
    const changed = nextSlots[registerIndex] !== null;
    nextSlots[registerIndex] = null;
    selectedRegisterIndex = registerIndex;
    if (changed) updateDraft(nextSlots);
  }

  function startCardDrag(event: DragEvent, cardId: ProgramCard['id']) {
    if (!event.dataTransfer || player.submitted) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-roborally-program-card', cardId);
    event.dataTransfer.setData('text/plain', cardId);
  }

  function allowCardDrop(event: DragEvent, registerIndex: number) {
    if (!editableRegister(registerIndex)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function dropCard(event: DragEvent, registerIndex: number) {
    event.preventDefault();
    const cardId = (event.dataTransfer?.getData('application/x-roborally-program-card') ||
      event.dataTransfer?.getData('text/plain')) as ProgramCard['id'];
    if (!player.hand.includes(cardId)) return;
    placeCard(cardId, registerIndex);
  }

  function clearDraft() {
    selectedRegisterIndex = null;
    updateDraft(Array.from({ length: REGISTER_COUNT }, () => null));
  }
</script>

<section class="program-editor" aria-label="Program editor">
  {#if showHeading}
    <div class="editor-heading">
      <h2>{heading}</h2>
      <span>{selectedCardIds.length}/{openRegisterCount} open</span>
    </div>
  {/if}
  {#if player.submitted}
    <p class="submission-state">{submittedMessage}</p>
  {:else}
    <p class:visually-hidden={!instructionsVisible} class="instructions" id="register-order-help">
      Tap a card for the next empty register, or select a register first. Tap an assigned card or
      filled register to remove it and select that slot. You can also drag cards onto registers.
    </p>
    <div class="program-hand" aria-label="Your Program hand">
      {#each player.hand as cardId}
        {@const card = cardForId(cardId)}
        {@const selectedIndex = draftSlots.indexOf(cardId)}
        <button
          type="button"
          class:selected={selectedIndex >= 0}
          aria-pressed={selectedIndex >= 0}
          aria-label={`${card?.action} priority ${card?.priority}`}
          aria-describedby="register-order-help"
          data-register-index={selectedIndex >= 0 ? selectedIndex + 1 : ''}
          draggable="true"
          ondragstart={(event) => startCardDrag(event, cardId)}
          onclick={() => tapCard(cardId)}
        >
          {#if card}<ProgramCardFace {card} compact variant="adaptive" />{/if}
          {#if selectedIndex >= 0}<span class="register-badge">R{selectedIndex + 1}</span>{/if}
        </button>
      {/each}
    </div>
    <ol class="chosen-registers" aria-label="Chosen registers">
      {#each Array(REGISTER_COUNT) as _, index}
        {@const register = player.registers[index]}
        {@const card = cardForId(register.locked ? register.cardId : draftSlots[index])}
        <li>
          <button
            type="button"
            class:targeted={selectedRegisterIndex === index}
            class:filled={!!card}
            class:locked={register.locked}
            aria-label={`Register ${index + 1}, ${card ? `${card.action} priority ${card.priority}` : 'empty'}${register.locked ? ', locked' : selectedRegisterIndex === index ? ', selected' : ''}`}
            aria-pressed={!register.locked && selectedRegisterIndex === index}
            data-register-slot={index + 1}
            disabled={register.locked}
            draggable={!!card && !register.locked}
            ondragstart={(event) => card && startCardDrag(event, card.id)}
            ondragover={(event) => allowCardDrop(event, index)}
            ondrop={(event) => dropCard(event, index)}
            onclick={() => tapSlot(index)}
          >
            <span>R{index + 1}</span>
            <strong>{card ? `${card.action} ${card.priority}` : 'empty'}</strong>
            {#if register.locked}<small>· locked</small>{/if}
          </button>
        </li>
      {/each}
    </ol>
    {#if previewText}<p class="preview-note">{previewText}</p>{/if}
    <div class="editor-actions">
      <button
        type="button"
        class="submit-program"
        onclick={onprogramsubmit}
        disabled={pending || selectedCardIds.length !== openRegisterCount}
      >{submitLabel}</button>
      {#if selectedCardIds.length > 0}
        <button type="button" class="clear-program" onclick={clearDraft}>Clear register choices</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .program-editor { display: grid; min-width: 0; gap: 8px; }
  .editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; color: #eef4ee; font: 700 20px 'Space Mono', monospace; text-transform: uppercase; }
  .editor-heading span { color: #d2ff37; font: 16px 'Space Mono', monospace; text-transform: uppercase; }
  .instructions { margin: 0; color: #aebbb9; font-size: 16px; line-height: 1.35; }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .program-hand { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
  .program-hand button {
    position: relative;
    display: block;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: visible;
    border: 2px solid transparent;
    border-radius: 4px;
    color: inherit;
    background: transparent;
  }
  .program-hand button.selected {
    border-color: #d2ff37;
    background: #d2ff3720;
    box-shadow: 0 0 10px #d2ff3788;
  }
  .register-badge {
    position: absolute;
    z-index: 5;
    top: -5px;
    right: -5px;
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 2px solid #111819;
    border-radius: 50%;
    color: #111819;
    background: #d2ff37;
    font: 700 13px/1 'Space Mono', monospace;
    box-shadow: 0 2px 6px #0009;
  }
  .chosen-registers {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chosen-registers li { min-width: 0; min-height: 44px; }
  .chosen-registers button {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 44px;
    gap: 2px;
    place-content: center;
    padding: 3px;
    overflow: hidden;
    border: 1px solid #354245;
    color: #788588;
    background: #111819;
    font: 12px 'Space Mono', monospace;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .chosen-registers button.targeted {
    border-color: #d2ff37;
    color: #eef4ee;
    background: #1a2418;
    box-shadow: inset 0 0 0 1px #d2ff37, 0 0 8px #d2ff3766;
  }
  .chosen-registers button.filled { color: #eef4ee; }
  .chosen-registers button.locked:disabled {
    cursor: not-allowed;
    opacity: 1;
    border-color: #ffcf4b;
    color: #ffcf4b;
    background: #211d12;
  }
  .chosen-registers span { color: #d2ff37; }
  .chosen-registers strong {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    font: inherit;
    text-overflow: ellipsis;
  }
  .chosen-registers small { color: #ffcf4b; font-size: 9px; }
  .preview-note, .submission-state { margin: 0; color: #778487; font-size: 16px; line-height: 1.35; }
  .submission-state {
    padding: 9px;
    border: 1px solid #53613b;
    color: #d2ff37;
    background: #151d13;
  }
  .editor-actions { display: grid; gap: 8px; }
  .editor-actions button {
    min-height: 44px;
    padding: 0 19px;
    border: 1px solid #d2ff37;
    color: #101510;
    background: #d2ff37;
    font: 700 16px 'Space Mono', monospace;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .editor-actions button { width: 100%; }
  .editor-actions button:disabled { cursor: not-allowed; opacity: .54; }
  .editor-actions .clear-program { color: #a5b0ae; border-color: #4e5a5c; background: transparent; }

  @media (max-width: 700px) {
    .program-hand { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .register-badge { width: 34px; height: 34px; font-size: 14px; }
    .instructions { font-size: 17px; }
    .editor-actions button { width: 100%; min-height: 48px; }
  }

  @media (max-height: 720px) and (max-width: 820px) {
    .program-editor { gap: 2px; }
    .instructions, .preview-note { display: none; }
    .program-hand { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; }
    .chosen-registers { gap: 2px; }
    .chosen-registers li, .chosen-registers button { min-height: 30px; }
    .chosen-registers button { font-size: 9px; }
    .editor-actions { display: flex; gap: 2px; }
    .editor-actions button { width: auto; min-height: 23px; padding: 0 4px; font-size: 12px; }
    .submission-state { padding: 3px; font-size: 12px; }
  }
</style>
