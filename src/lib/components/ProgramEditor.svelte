<script lang="ts">
  import ProgramCardFace from '$lib/components/ProgramCardFace.svelte';
  import { OPTION_CARDS_BY_ID, type OptionCardId } from '$lib/game/option-manifest';
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
  export let viewportFit = false;
  export let submitLabel = 'Submit immutable program';
  export let submittedMessage = 'Program committed. It cannot be inspected or changed.';
  export let previewText = '';
  export let ondraftchange: (slots: (ProgramCard['id'] | null)[]) => void;
  export let onprogramsubmit: () => void | Promise<void>;
  export let recompileOptionCardIds: OptionCardId[] = [];
  export let recompileUsed = false;
  export let onrecompile: (choiceId: string) => void | Promise<void> = () => {};

  let selectedRegisterIndex: number | null = null;
  let pointerDrag:
    | {
        cardId: ProgramCard['id'];
        pointerId: number;
        startX: number;
        startY: number;
        targetIndex: number | null;
        moved: boolean;
      }
    | undefined;
  let suppressCardClick: ProgramCard['id'] | null = null;
  let choosingRecompile = false;

  $: openRegisterCount = player.registers.filter((register) => !register.locked).length;
  $: selectedCardIds = draftCardIdsInRegisterOrder(player, draftSlots);
  $: canRecompile = recompileOptionCardIds.includes('recompile') && !recompileUsed;
  $: if (recompileUsed) choosingRecompile = false;

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
    if (suppressCardClick === cardId) {
      suppressCardClick = null;
      return;
    }
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

  function registerIndexAtPoint(clientX: number, clientY: number) {
    const slot = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-register-slot]');
    const registerIndex = Number(slot?.dataset.registerSlot ?? 0) - 1;
    return registerIndex >= 0 && editableRegister(registerIndex) ? registerIndex : null;
  }

  function startPointerDrag(event: PointerEvent, cardId: ProgramCard['id']) {
    if (event.pointerType === 'mouse' || player.submitted) return;
    pointerDrag = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetIndex: null,
      moved: false
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not always create a capturable active pointer.
    }
  }

  function movePointerDrag(event: PointerEvent) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const moved =
      pointerDrag.moved ||
      Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) > 8;
    pointerDrag = {
      ...pointerDrag,
      moved,
      targetIndex: moved ? registerIndexAtPoint(event.clientX, event.clientY) : null
    };
    if (moved) event.preventDefault();
  }

  function finishPointerDrag(event: PointerEvent) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const completedDrag = pointerDrag.moved;
    const { cardId, targetIndex } = pointerDrag;
    pointerDrag = undefined;
    if (completedDrag) {
      suppressCardClick = cardId;
      requestAnimationFrame(() => {
        if (suppressCardClick === cardId) suppressCardClick = null;
      });
      event.preventDefault();
      if (targetIndex !== null) placeCard(cardId, targetIndex);
    }
  }

  function cancelPointerDrag(event: PointerEvent) {
    if (pointerDrag?.pointerId === event.pointerId) pointerDrag = undefined;
  }

  function clearDraft() {
    selectedRegisterIndex = null;
    updateDraft(Array.from({ length: REGISTER_COUNT }, () => null));
  }
</script>

<section class:viewport-fit={viewportFit} class="program-editor" aria-label="Program editor">
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
          onpointerdown={(event) => startPointerDrag(event, cardId)}
          onpointermove={movePointerDrag}
          onpointerup={finishPointerDrag}
          onpointercancel={cancelPointerDrag}
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
            class:pointer-targeted={pointerDrag?.targetIndex === index}
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
      {#if canRecompile}
        <button
          type="button"
          class="recompile-program"
          onclick={() => (choosingRecompile = !choosingRecompile)}
          disabled={pending}
        >Recompile hand</button>
      {/if}
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
    {#if choosingRecompile}
      <div class="recompile-choice" aria-label="Recompile damage choice">
        <strong>Resolve Recompile damage</strong>
        <p>Redeal this hand, then choose whether to take one damage or discard an Option.</p>
        {#each recompileOptionCardIds as optionCardId}
          <button
            type="button"
            disabled={pending}
            onclick={() => onrecompile(`discard:${optionCardId}`)}
          >Discard {OPTION_CARDS_BY_ID.get(optionCardId)?.name ?? optionCardId} to prevent this damage</button>
        {/each}
        <button type="button" disabled={pending} onclick={() => onrecompile('take-damage')}>
          Take this damage
        </button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .program-editor { display: grid; min-width: 0; gap: 8px; }
  .recompile-choice {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid #d2ff37;
    background: #111819;
  }
  .recompile-choice p { margin: 0; }
  .program-editor.viewport-fit {
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    overflow: hidden;
  }
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
    touch-action: none;
  }
  .viewport-fit .program-hand {
    min-height: 0;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: none;
    grid-auto-rows: max-content;
    align-content: center;
    overflow: hidden;
  }
  .viewport-fit .program-hand button {
    width: 100%;
    aspect-ratio: 1014 / 1424;
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
    touch-action: none;
  }
  .chosen-registers button.targeted {
    border-color: #d2ff37;
    color: #eef4ee;
    background: #1a2418;
    box-shadow: inset 0 0 0 1px #d2ff37, 0 0 8px #d2ff3766;
  }
  .chosen-registers button.pointer-targeted {
    border-color: #ffcf4b;
    color: #eef4ee;
    background: #2b2514;
    box-shadow: inset 0 0 0 1px #ffcf4b, 0 0 8px #ffcf4b66;
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
  .viewport-fit .editor-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .viewport-fit .editor-actions button { min-height: 44px; padding: 0 8px; font-size: 14px; }
  .viewport-fit .editor-actions button:only-child { grid-column: 1 / -1; }

  @media (max-width: 700px) {
    .program-hand { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .register-badge { width: 34px; height: 34px; font-size: 14px; }
    .instructions { font-size: 17px; }
    .editor-actions button { width: 100%; min-height: 48px; }
    .viewport-fit .program-hand {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-rows: max-content;
      align-content: center;
      gap: 4px;
    }
    .viewport-fit .program-hand button:last-child:nth-child(4n + 1) { grid-column: 2; }
    .viewport-fit .editor-actions button { min-height: 44px; }
  }

  @media (max-height: 720px) and (max-width: 820px) and (orientation: portrait) {
    .program-editor { gap: 2px; }
    .instructions, .preview-note { display: none; }
    .program-hand { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px; }
    .viewport-fit .program-hand {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(0, 1fr));
      grid-auto-rows: auto;
      align-content: stretch;
    }
    .viewport-fit .program-hand button {
      width: auto;
      height: 100%;
      max-width: 100%;
      justify-self: center;
      aspect-ratio: 1014 / 1424;
    }
    .chosen-registers { gap: 2px; }
    .chosen-registers li, .chosen-registers button { min-height: 38px; }
    .chosen-registers button { font-size: 10px; }
    .editor-actions { display: flex; gap: 2px; }
    .editor-actions button {
      flex: 1 1 0;
      width: auto;
      min-height: 44px;
      padding: 0 4px;
      font-size: 12px;
    }
    .submission-state { padding: 3px; font-size: 12px; }
  }

  @media (max-width: 359px) and (orientation: portrait) {
    .program-hand,
    .viewport-fit .program-hand { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .viewport-fit .program-hand button:last-child:nth-child(4n + 1) { grid-column: auto; }
  }

  @media (max-height: 720px) and (orientation: landscape) {
    .program-editor.viewport-fit {
      grid-template-columns: minmax(0, 3fr) minmax(190px, 2fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 3px 8px;
    }
    .viewport-fit .editor-heading { grid-column: 1 / -1; }
    .viewport-fit .instructions, .viewport-fit .preview-note { display: none; }
    .viewport-fit .program-hand {
      grid-column: 1;
      grid-row: 2 / 4;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-rows: auto;
      align-content: stretch;
      gap: 2px;
    }
    .viewport-fit .program-hand button {
      width: auto;
      height: 100%;
      max-width: 100%;
      justify-self: center;
      aspect-ratio: 1014 / 1424;
    }
    .viewport-fit .chosen-registers {
      grid-column: 2;
      grid-row: 2;
      grid-template-columns: 1fr;
      gap: 2px;
    }
    .viewport-fit .chosen-registers li,
    .viewport-fit .chosen-registers button { min-height: 30px; }
    .viewport-fit .chosen-registers button { font-size: 9px; }
    .viewport-fit .editor-actions {
      display: flex;
      grid-column: 2;
      grid-row: 3;
      gap: 2px;
    }
    .viewport-fit .editor-actions button {
      flex: 1 1 0;
      width: 0;
      min-height: 44px;
      padding: 0 4px;
      font-size: 12px;
    }
    .viewport-fit .submission-state { padding: 3px; font-size: 12px; }
  }
</style>
