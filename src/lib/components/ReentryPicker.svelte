<script lang="ts">
  import type { Direction } from '$lib/game/course-manifest';
  import type { ReentryChoice } from '$lib/game/movement';

  export let choices: readonly ReentryChoice[];
  export let archive: { x: number; y: number };
  export let archiveOccupantName = '';
  export let selectedCell = '';
  export let selectedFacing: Direction | '' = '';
  export let compact = false;
  export let onselectionchange: (cell: string, facing: Direction | '') => void = () => {};

  const directions: readonly { facing: Direction; glyph: string; label: string }[] = [
    { facing: 'north', glyph: '↑', label: 'North' },
    { facing: 'east', glyph: '→', label: 'East' },
    { facing: 'south', glyph: '↓', label: 'South' },
    { facing: 'west', glyph: '←', label: 'West' }
  ];

  $: cellChoices = [...choices.reduce((cells, choice) => {
    const key = `${choice.x},${choice.y}`;
    const existing = cells.get(key);
    if (existing) existing.facings.push(choice.facing);
    else cells.set(key, { key, x: choice.x, y: choice.y, facings: [choice.facing] });
    return cells;
  }, new Map<string, { key: string; x: number; y: number; facings: Direction[] }>()).values()];
  $: archiveCell = `${archive.x},${archive.y}`;
  $: archiveOpen = cellChoices.some(({ key }) => key === archiveCell);
  $: effectiveCell = selectedCell || (cellChoices.length === 1 ? cellChoices[0].key : '');
  $: selectedCellChoice = cellChoices.find(({ key }) => key === effectiveCell);
  $: radius = Math.max(
    0,
    ...cellChoices.map(({ x, y }) => Math.max(Math.abs(x - archive.x), Math.abs(y - archive.y)))
  );
  $: diameter = radius * 2 + 1;
  $: placementCells = Array.from({ length: diameter * diameter }, (_, index) => {
    const dx = index % diameter - radius;
    const dy = Math.floor(index / diameter) - radius;
    const x = archive.x + dx;
    const y = archive.y + dy;
    const key = `${x},${y}`;
    return { key, x, y, choice: cellChoices.find((candidate) => candidate.key === key) };
  });

  function chooseCell(cell: string) {
    onselectionchange(cell, '');
  }

  function chooseFacing(facing: Direction) {
    if (!effectiveCell || !selectedCellChoice?.facings.includes(facing)) return;
    onselectionchange(effectiveCell, facing);
  }
</script>

<div class:compact class="reentry-picker">
  {#if archiveOpen}
    <p class="placement-explanation">
      Archive <strong>({archive.x},{archive.y})</strong> is clear. Choose your facing.
    </p>
  {:else}
    <p class="placement-explanation">
      Archive <strong>({archive.x},{archive.y})</strong> is occupied{archiveOccupantName
        ? ` by ${archiveOccupantName}`
        : ''}.
      {#if radius === 1}
        Choose an adjacent re-entry square.
      {:else}
        No adjacent placement is legal. Choose a square in the nearest legal band,
        {radius} spaces away.
      {/if}
    </p>
    <fieldset class="placement-control">
      <legend>Re-entry square</legend>
      <div
        class="placement-grid"
        style={`--reentry-grid-size: ${diameter}`}
        aria-label="Legal re-entry squares"
      >
        {#each placementCells as cell (cell.key)}
          {#if cell.choice}
            <button
              type="button"
              class:selected={effectiveCell === cell.key}
              aria-label={`Re-entry square (${cell.x},${cell.y})`}
              aria-pressed={effectiveCell === cell.key}
              onclick={() => chooseCell(cell.key)}
            >
              <span>{cell.x},{cell.y}</span>
            </button>
          {:else if cell.key === archiveCell}
            <span
              class="archive-cell"
              aria-label={`Occupied archive (${archive.x},${archive.y})${archiveOccupantName
                ? `, ${archiveOccupantName}`
                : ''}`}
              title={archiveOccupantName || 'Occupied archive'}
            >A</span>
          {:else}
            <span class="unavailable-cell" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset class="facing-control" aria-label="Re-entry facing" disabled={!effectiveCell}>
    <legend>Facing</legend>
    <div>
      {#each directions as direction}
        {@const available = selectedCellChoice?.facings.includes(direction.facing) ?? false}
        <button
          type="button"
          class:selected={selectedFacing === direction.facing}
          disabled={!available}
          aria-label={`Face ${direction.label.toLowerCase()}`}
          aria-pressed={selectedFacing === direction.facing}
          onclick={() => chooseFacing(direction.facing)}
        >
          <span aria-hidden="true">{direction.glyph}</span>
          <small>{direction.label}</small>
        </button>
      {/each}
    </div>
  </fieldset>
</div>

<style>
  .reentry-picker { display: grid; gap: 12px; min-width: 0; }
  .placement-explanation { margin: 0; color: #d7e0dd; line-height: 1.3; }
  .placement-explanation strong { color: #ffcf4b; font-family: 'Space Mono', monospace; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  legend {
    margin-bottom: 6px;
    color: #ffcf4b;
    font: 700 13px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .placement-grid {
    display: grid;
    grid-template-columns: repeat(var(--reentry-grid-size), minmax(0, 1fr));
    gap: 4px;
    width: min(100%, calc(var(--reentry-grid-size) * 52px));
    margin-inline: auto;
  }
  .placement-grid > * { min-width: 0; aspect-ratio: 1; }
  .placement-grid button,
  .archive-cell,
  .unavailable-cell {
    display: grid;
    place-items: center;
    border: 1px solid #536164;
    border-radius: 4px;
  }
  .placement-grid button {
    min-height: 44px;
    padding: 2px;
    color: #eef4ee;
    background: #172224;
    font: 700 12px 'Space Mono', monospace;
  }
  .placement-grid button:hover,
  .placement-grid button:focus-visible { border-color: #ffcf4b; }
  .placement-grid button.selected {
    border-color: #d2ff37;
    color: #101718;
    background: #d2ff37;
    box-shadow: 0 0 0 2px rgb(210 255 55 / 22%);
  }
  .archive-cell {
    color: #101718;
    background: repeating-linear-gradient(135deg, #ffcf4b 0 6px, #b88a15 6px 12px);
    font: 700 18px 'Space Mono', monospace;
  }
  .unavailable-cell { border-style: dashed; opacity: 0.28; background: #0d1314; }
  .facing-control > div { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .facing-control button {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 52px;
    padding: 3px;
    border: 1px solid #536164;
    color: #eef4ee;
    background: #172224;
  }
  .facing-control button > span { font-size: 24px; line-height: 1; }
  .facing-control button small {
    font: 700 10px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  .facing-control button.selected { border-color: #d2ff37; color: #101718; background: #d2ff37; }
  .facing-control button:disabled { opacity: 0.24; }
  .compact { gap: 5px; }
  .compact .placement-explanation { font-size: 14px; }
  .compact legend { margin-bottom: 3px; font-size: 11px; }
  .compact .placement-grid { width: min(100%, calc(var(--reentry-grid-size) * 38px)); gap: 2px; }
  .compact .placement-grid button { min-height: 32px; font-size: 9px; }
  .compact .archive-cell { font-size: 14px; }
  .compact .facing-control > div { gap: 3px; }
  .compact .facing-control button { min-height: 34px; }
  .compact .facing-control button > span { font-size: 18px; }
  .compact .facing-control button small { font-size: 8px; }
</style>
