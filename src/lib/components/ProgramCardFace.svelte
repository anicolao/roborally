<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import type { ProgramAction, ProgramCard } from '$lib/game/program-manifest';

  const actionPresentation: Record<
    ProgramAction,
    { label: string; icon: 'move-arrow-v1.webp' | 'rotate-left-v1.webp' | 'u-turn-v1.webp' }
  > = {
    'u-turn': { label: 'U-turn', icon: 'u-turn-v1.webp' },
    'rotate-right': { label: 'Rotate right', icon: 'rotate-left-v1.webp' },
    'rotate-left': { label: 'Rotate left', icon: 'rotate-left-v1.webp' },
    'back-up': { label: 'Back up', icon: 'move-arrow-v1.webp' },
    'move-1': { label: 'Move 1', icon: 'move-arrow-v1.webp' },
    'move-2': { label: 'Move 2', icon: 'move-arrow-v1.webp' },
    'move-3': { label: 'Move 3', icon: 'move-arrow-v1.webp' }
  };

  let {
    card,
    compact = false,
    variant = 'portrait'
  }: {
    card: ProgramCard;
    compact?: boolean;
    variant?: 'portrait' | 'square';
  } = $props();

  const presentation = $derived(actionPresentation[card.action]);
  const moveDistance = $derived(
    card.action.startsWith('move-') ? Number(card.action.slice('move-'.length)) : null
  );
  const mirrored = $derived(card.action === 'rotate-right');
  const reversed = $derived(card.action === 'back-up');
</script>

<article
  class:compact
  class:square={variant === 'square'}
  class="program-card"
  aria-label={`${presentation.label}, priority ${card.priority}`}
  data-card-id={card.id}
>
  <img
    class="chassis"
    src={`${base}/assets/cards/${variant === 'square' ? 'program-card-background-square-v1.webp' : 'program-card-background-v1.webp'}`}
    alt=""
    draggable="false"
  />

  {#if variant === 'portrait'}
    <img
      class="corner-command"
      class:mirrored
      class:reversed
      src={`${base}/assets/cards/${presentation.icon}`}
      alt=""
      draggable="false"
    />
  {/if}

  <span class="priority" aria-label={`Priority ${card.priority}`}>{card.priority}</span>

  <img
    class="main-command"
    class:mirrored
    class:reversed
    src={`${base}/assets/cards/${presentation.icon}`}
    alt=""
    draggable="false"
  />
  {#if moveDistance !== null}
    <span class="move-count" aria-hidden="true">{moveDistance}</span>
  {/if}

  <span class:long-title={presentation.label.length > 8} class="title">{presentation.label}</span>
</article>

<style>
  .program-card {
    container-type: inline-size;
    position: relative;
    isolation: isolate;
    aspect-ratio: 1014 / 1424;
    overflow: hidden;
    border-radius: 0.8cqw;
    color: #f7ec79;
    filter: drop-shadow(0 1.6rem 1.8rem rgb(0 0 0 / 48%));
    user-select: none;
  }

  .program-card.compact {
    filter: drop-shadow(0 0.75rem 0.8rem rgb(0 0 0 / 42%));
  }

  .program-card.square {
    aspect-ratio: 1;
    border-radius: 0.4cqw;
  }

  img,
  span {
    position: absolute;
    display: block;
  }

  img {
    pointer-events: none;
  }

  .mirrored {
    transform: scaleX(-1);
  }

  .reversed {
    transform: rotate(180deg);
  }

  .chassis {
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .corner-command {
    z-index: 1;
    top: 9.25%;
    left: 14.8%;
    width: 14.5%;
    height: auto;
  }

  .priority {
    z-index: 2;
    display: flex;
    top: 8.2%;
    left: 53%;
    width: 34.8%;
    height: 11.5%;
    align-items: center;
    justify-content: center;
    color: #ecf36b;
    font: 700 10.4cqw/1 'Space Mono', monospace;
    letter-spacing: -0.09em;
    text-align: center;
    text-shadow: 0 0 0.32em rgb(222 245 75 / 48%);
  }

  .main-command {
    z-index: 1;
    top: 31.25%;
    left: 16.4%;
    width: 67.2%;
    height: auto;
  }

  .move-count {
    z-index: 2;
    top: 50.8%;
    left: 36.35%;
    width: 27.3%;
    color: #f5df35;
    font: 700 25cqw/1 'Atkinson Hyperlegible', sans-serif;
    text-align: center;
    text-shadow:
      0 0.045em 0 #1b1300,
      0 0 0.16em rgb(255 216 39 / 55%);
  }

  .title {
    z-index: 2;
    top: 77.5%;
    left: 15.4%;
    width: 69.2%;
    color: #f6df3d;
    font: 700 9.7cqw/1 'Atkinson Hyperlegible', sans-serif;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
    text-shadow: 0 0.07em 0 #1d1200, 0 0 0.16em rgb(248 218 54 / 40%);
  }

  .title.long-title {
    top: 78.1%;
    font-size: 7.4cqw;
  }

  .square .priority {
    top: 8.8%;
    left: 12.7%;
    width: 74.6%;
    height: 13.1%;
    font-size: 10.5cqw;
    letter-spacing: -0.04em;
  }

  .square .main-command {
    top: 27%;
    left: 22%;
    width: 56%;
  }

  .square .move-count {
    top: 48.2%;
    left: 36%;
    width: 28%;
    font-size: 22cqw;
  }

  .square .title {
    top: 81.8%;
    left: 14%;
    width: 72%;
    font-size: 8.2cqw;
  }

  .square .title.long-title {
    top: 82.2%;
    font-size: 6.5cqw;
  }

</style>
