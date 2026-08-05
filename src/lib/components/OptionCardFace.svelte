<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/700.css';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import type { OptionCard } from '$lib/game/option-manifest';

  let {
    card,
    variant = 'standard',
    onfitchange
  }: {
    card: OptionCard;
    variant?: 'standard' | 'compact-copy';
    onfitchange?: (fits: boolean) => void;
  } = $props();

  let copyPanel = $state<HTMLDivElement>();
  let continuationPanel = $state<HTMLDivElement>();
  let titlePanel = $state<HTMLSpanElement>();

  const timingLabel = $derived(card.timing.map((timing) => timing.replaceAll('-', ' ')).join(' · '));
  const behaviorLabel = $derived(card.optional ? 'Optional' : 'Automatic');
  const payloadLabel = $derived(card.payload === null ? null : `Capacity ${card.payload}`);

  function reportFit() {
    if (!copyPanel || !titlePanel) return;
    const fits =
      copyPanel.scrollHeight <= copyPanel.clientHeight + 1 &&
      copyPanel.scrollWidth <= copyPanel.clientWidth + 1 &&
      titlePanel.scrollHeight <= titlePanel.clientHeight + 1 &&
      titlePanel.scrollWidth <= titlePanel.clientWidth + 1 &&
      (!continuationPanel ||
        (continuationPanel.scrollHeight <= continuationPanel.clientHeight + 1 &&
          continuationPanel.scrollWidth <= continuationPanel.clientWidth + 1));
    onfitchange?.(fits);
  }

  onMount(() => {
    if (!copyPanel || !titlePanel) return;
    const observer = new ResizeObserver(reportFit);
    observer.observe(copyPanel);
    observer.observe(titlePanel);
    if (continuationPanel) observer.observe(continuationPanel);
    document.fonts.ready.then(reportFit);
    reportFit();
    return () => observer.disconnect();
  });
</script>

<span
  role="img"
  class:compact-copy={variant === 'compact-copy'}
  class="option-card"
  aria-label={`${card.name}. ${card.summary} ${card.kind}. ${timingLabel}. ${behaviorLabel}.`}
  data-card-id={card.id}
>
  <img
    class="chassis"
    src={`${base}/assets/options/${variant === 'compact-copy' ? 'option-card-compact-chassis-poc.webp' : 'option-card-chassis-poc.webp'}`}
    alt=""
    draggable="false"
  />

  <span class="title" bind:this={titlePanel}>{card.name}</span>

  <span class="illustration-well" aria-hidden="true">
    <img
      class="illustration"
      src={`${base}/assets/options/${card.id}-poc.webp`}
      alt=""
      draggable="false"
    />
  </span>

  <div class="copy" bind:this={copyPanel}>
    {#if variant === 'standard'}
      <p>{card.summary}</p>
      <dl>
        <div>
          <dt>System</dt>
          <dd>{card.kind}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{timingLabel}</dd>
        </div>
        <div>
          <dt>Use</dt>
          <dd>{behaviorLabel}</dd>
        </div>
        {#if payloadLabel}
          <div>
            <dt>Storage</dt>
            <dd>{payloadLabel}</dd>
          </div>
        {/if}
      </dl>
    {:else}
      <dl>
        <div>
          <dt>System</dt>
          <dd>{card.kind}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{timingLabel}</dd>
        </div>
        <div>
          <dt>Use</dt>
          <dd>{behaviorLabel}</dd>
        </div>
        {#if payloadLabel}
          <div>
            <dt>Storage</dt>
            <dd>{payloadLabel}</dd>
          </div>
        {/if}
      </dl>
    {/if}
  </div>

  {#if variant === 'compact-copy'}
    <div class="continuation" bind:this={continuationPanel}>
      <p>{card.summary}</p>
    </div>
  {/if}

  <span class="footer-kind">{card.kind}</span>
  <span class="footer-timing">{timingLabel}</span>
</span>

<style>
  .option-card {
    container-type: inline-size;
    position: relative;
    display: block;
    isolation: isolate;
    width: 100%;
    aspect-ratio: 3 / 2;
    overflow: hidden;
    border-radius: 1.2cqw;
    color: #f5f5e9;
    filter: drop-shadow(0 1.2rem 1.5rem rgb(0 0 0 / 46%));
    user-select: none;
  }

  img,
  span,
  div {
    box-sizing: border-box;
  }

  img,
  .title,
  .illustration-well,
  .copy,
  .continuation,
  .footer-kind,
  .footer-timing {
    position: absolute;
    display: block;
  }

  img {
    pointer-events: none;
  }

  .chassis {
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .title {
    z-index: 2;
    top: 5.4%;
    left: 5.1%;
    display: flex;
    width: 89.8%;
    height: 12.8%;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #f5df38;
    font: 700 clamp(14px, 4.15cqw, 34px)/1 'Atkinson Hyperlegible', sans-serif;
    letter-spacing: 0.045em;
    text-align: center;
    text-overflow: clip;
    text-shadow:
      0 0.05em 0 #241b00,
      0 0 0.2em rgb(255 218 45 / 38%);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .illustration-well {
    z-index: 1;
    top: 23%;
    left: 4.4%;
    width: 32.4%;
    height: 64.6%;
    overflow: hidden;
  }

  .illustration {
    inset: 3%;
    width: 94%;
    height: 94%;
    object-fit: contain;
    filter: drop-shadow(0 0.8cqw 1.1cqw rgb(0 0 0 / 64%));
  }

  .copy {
    z-index: 2;
    top: 24.4%;
    left: 43.2%;
    display: flex;
    width: 50.4%;
    height: 62.3%;
    flex-direction: column;
    overflow: hidden;
    color: #f2f2e7;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }

  .compact-copy .illustration-well {
    top: 23%;
    left: 4.5%;
    width: 23.8%;
    height: 26.8%;
  }

  .compact-copy .illustration {
    inset: 1%;
    width: 98%;
    height: 98%;
  }

  .compact-copy .copy {
    top: 22.8%;
    left: 30.5%;
    display: block;
    width: 63.2%;
    height: 28.5%;
  }

  .compact-copy .copy dl {
    margin: 0;
    padding-top: 0;
  }

  .continuation {
    z-index: 2;
    top: 54.4%;
    left: 5.1%;
    width: 89.1%;
    height: 32.8%;
    overflow: hidden;
    color: #f2f2e7;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }

  .compact-copy p {
    font-size: clamp(12px, 2.45cqw, 18px);
    line-height: 1.12;
  }

  .compact-copy .footer-kind,
  .compact-copy .footer-timing {
    display: none;
  }

  p {
    margin: 0;
    font-size: clamp(13px, 2.6cqw, 20px);
    font-weight: 700;
    line-height: 1.18;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(3px, 0.75cqw, 7px) clamp(6px, 1.2cqw, 11px);
    margin: auto 0 0;
    padding-top: clamp(8px, 1.8cqw, 15px);
  }

  dl div {
    min-width: 0;
  }

  dt {
    margin: 0 0 0.12em;
    color: #f0ca32;
    font: 700 clamp(9px, 1.25cqw, 11px)/1 'Space Mono', monospace;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #cbd2cf;
    font-size: clamp(11px, 1.8cqw, 15px);
    line-height: 1.1;
    text-transform: capitalize;
  }

  .footer-kind,
  .footer-timing {
    z-index: 2;
    top: 92.55%;
    height: 2.5%;
    overflow: hidden;
    color: #f4cb2d;
    font: 700 clamp(7px, 1.05cqw, 9px)/1 'Space Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .footer-kind {
    left: 9.6%;
    width: 24%;
  }

  .footer-timing {
    right: 9.5%;
    width: 47%;
    text-align: right;
  }
</style>
