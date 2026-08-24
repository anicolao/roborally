<script lang="ts">
  import BoardTile from '$lib/components/BoardTile.svelte';
  import type { Direction, Wall } from '$lib/game/course-manifest';
  import type { ReentryChoice } from '$lib/game/movement';
  import {
    compilePlayableCourse,
    type PlayableCourseId
  } from '$lib/game/playable-courses';

  export let choices: readonly ReentryChoice[];
  export let courseId: PlayableCourseId;
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
  $: compiledCourse = compilePlayableCourse(courseId);
  $: wallsByCell = [...compiledCourse.walls].reduce<Map<string, Wall[]>>((byCell, wallKey) => {
    const [x, y, edge] = wallKey.split(',');
    const key = `${x},${y}`;
    byCell.set(key, [
      ...(byCell.get(key) ?? []),
      { x: Number(x), y: Number(y), edge: edge as Direction }
    ]);
    return byCell;
  }, new Map());
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
    return {
      key,
      x,
      y,
      choice: cellChoices.find((candidate) => candidate.key === key),
      manifestCell: compiledCourse.cells.get(key),
      walls: wallsByCell.get(key) ?? []
    };
  });

  function chooseCell(cell: string) {
    if (cell === effectiveCell) return;
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
  {/if}

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
            class="placement-cell"
            class:selected={effectiveCell === cell.key}
            aria-label={`Re-entry square (${cell.x},${cell.y})`}
            aria-pressed={effectiveCell === cell.key}
            onclick={() => chooseCell(cell.key)}
          >
            <BoardTile
              embedded
              elements={cell.manifestCell?.elements ?? []}
              walls={cell.walls}
              x={cell.x}
              y={cell.y}
            />
            <span class="tile-coordinate">{cell.x},{cell.y}</span>
          </button>
        {:else if cell.key === archiveCell}
          <span
            class="archive-cell"
            aria-label={`Occupied archive (${archive.x},${archive.y})${archiveOccupantName
              ? `, ${archiveOccupantName}`
              : ''}`}
            title={archiveOccupantName || 'Occupied archive'}
          >
            <BoardTile
              embedded
              elements={cell.manifestCell?.elements ?? []}
              walls={cell.walls}
              x={cell.x}
              y={cell.y}
            />
            <span class="archive-marker" aria-hidden="true">A</span>
            <span class="tile-coordinate">{cell.x},{cell.y}</span>
          </span>
        {:else}
          <span
            class:outside-course={!cell.manifestCell}
            class="unavailable-cell"
            aria-hidden="true"
          >
            {#if cell.manifestCell}
              <BoardTile
                embedded
                elements={cell.manifestCell.elements}
                walls={cell.walls}
                x={cell.x}
                y={cell.y}
              />
              <span class="tile-coordinate">{cell.x},{cell.y}</span>
            {/if}
          </span>
        {/if}
      {/each}
    </div>
  </fieldset>

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
    width: min(100%, calc(var(--reentry-grid-size) * 68px));
    margin-inline: auto;
  }
  .placement-grid > * { min-width: 0; aspect-ratio: 1; }
  .placement-grid button,
  .archive-cell,
  .unavailable-cell {
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    border: 1px solid #536164;
    border-radius: 4px;
  }
  .placement-grid button {
    min-height: 44px;
    padding: 0;
    color: #eef4ee;
    background: #172224;
    font: 700 12px 'Space Mono', monospace;
  }
  .placement-grid button:hover,
  .placement-grid button:focus-visible { border-color: #ffcf4b; }
  .placement-grid button.selected {
    border-color: #d2ff37;
    box-shadow: inset 0 0 0 3px #d2ff37, 0 0 0 2px rgb(210 255 55 / 22%);
  }
  .archive-cell {
    border-color: #ffcf4b;
    box-shadow: inset 0 0 0 2px #ffcf4b;
  }
  .archive-marker {
    position: relative;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 52%;
    aspect-ratio: 1;
    border: 2px solid #ffe69b;
    border-radius: 50%;
    color: #101718;
    background: rgb(255 207 75 / 92%);
    font: 700 18px 'Space Mono', monospace;
    box-shadow: 0 2px 7px rgb(0 0 0 / 72%);
  }
  .tile-coordinate {
    position: absolute;
    z-index: 3;
    right: 2px;
    bottom: 2px;
    padding: 1px 3px;
    border-radius: 2px;
    color: #fff;
    background: rgb(5 9 10 / 82%);
    font: 700 9px 'Space Mono', monospace;
    line-height: 1.15;
    text-shadow: 0 1px 2px #000;
  }
  .placement-grid button.selected .tile-coordinate { color: #101718; background: #d2ff37; }
  .unavailable-cell { opacity: 0.38; background: #0d1314; }
  .unavailable-cell.outside-course { border-style: dashed; }
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
  .compact .placement-grid { width: min(100%, calc(var(--reentry-grid-size) * 48px)); gap: 2px; }
  .compact .placement-grid button { min-height: 32px; font-size: 9px; }
  .compact .archive-marker { font-size: 14px; }
  .compact .tile-coordinate { right: 1px; bottom: 1px; padding: 0 2px; font-size: 7px; }
  .compact .facing-control > div { gap: 3px; }
  .compact .facing-control button { min-height: 34px; }
  .compact .facing-control button > span { font-size: 18px; }
  .compact .facing-control button small { font-size: 8px; }
</style>
