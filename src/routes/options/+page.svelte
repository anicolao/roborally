<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import OptionCardFace from '$lib/components/OptionCardFace.svelte';
  import {
    OPTION_CARD_PRESENTATIONS,
    type OptionCardSize
  } from '$lib/components/option-card-presentation';
  import { OPTION_CARDS } from '$lib/game/option-manifest';

  let cardSize = $state<OptionCardSize>('medium');
  const selectedSize = $derived(
    OPTION_CARD_PRESENTATIONS.find(({ id }) => id === cardSize) ?? OPTION_CARD_PRESENTATIONS[1]
  );
</script>

<svelte:head>
  <title>Option cards — Robo Rally</title>
  <meta
    name="description"
    content="Learn when and how to use every Robo Rally Option card."
  />
</svelte:head>

<main>
  <header>
    <p>ROBO RALLY</p>
    <h1>Option cards</h1>
    <span>
      Learn when and how to use each Option.
    </span>

    <fieldset class="size-selector">
      <legend>Card size</legend>
      {#each OPTION_CARD_PRESENTATIONS as size}
        <label>
          <input
            type="radio"
            name="card-size"
            value={size.id}
            bind:group={cardSize}
          />
          <span>
            <strong>{size.label}</strong>
          </span>
        </label>
      {/each}
    </fieldset>
  </header>

  <section class="inventory" aria-labelledby="inventory-heading">
    <div class="section-heading">
      <div>
        <h2 id="inventory-heading">All {OPTION_CARDS.length} Option cards</h2>
      </div>

    </div>

    <ol
      class:large={cardSize === 'large'}
      class:medium={cardSize === 'medium'}
      class:small={cardSize === 'small'}
      style={`--card-width: ${selectedSize.width}px`}
    >
      {#each OPTION_CARDS as card, index}
        <li>
          <div class="card-heading">
            <span>{String(index + 1).padStart(2, '0')} · {card.name}</span>

          </div>
          <div class="card-stage">
            <OptionCardFace
              {card}
              size={cardSize}
            />
          </div>
        </li>
      {/each}
    </ol>
  </section>

</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    background: #090d0f;
    color-scheme: dark;
  }

  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 50% -12rem, rgb(62 83 87 / 72%) 0, transparent 42rem),
      linear-gradient(#101719, #090d0f 70rem);
    color: #f1f5ec;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }

  main {
    width: min(100% - 2rem, 92rem);
    margin: 0 auto;
    padding: 3rem 0 6rem;
  }

  header {
    max-width: 58rem;
    margin-bottom: 4rem;
  }
  header > p {
    margin: 0 0 0.55rem;
    color: #7de5ef;
    font: 0.75rem/1.4 'Space Mono', monospace;
    letter-spacing: 0.12em;
  }

  h1,
  h2 {
    margin: 0;
    text-transform: uppercase;
  }

  h1 {
    font-size: clamp(3rem, 8vw, 6.8rem);
    line-height: 0.86;
  }

  h2 {
    font-size: clamp(1.75rem, 4vw, 3rem);
  }

  header > span {
    display: block;
    max-width: 54rem;
    margin-top: 1.4rem;
    color: #bdc9c7;
    font-size: clamp(1rem, 2vw, 1.25rem);
    line-height: 1.55;
  }

  .size-selector {
    display: inline-flex;
    gap: 0.35rem;
    margin: 1.8rem 0 0;
    padding: 0.3rem;
    border: 1px solid #3a4b4e;
    border-radius: 0.65rem;
    background: rgb(8 13 15 / 72%);
  }

  .size-selector legend {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .size-selector label {
    position: relative;
    cursor: pointer;
  }

  .size-selector input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .size-selector label > span {
    display: grid;
    min-width: 7rem;
    gap: 0.18rem;
    padding: 0.58rem 0.9rem;
    border-radius: 0.42rem;
    color: #aebcba;
    text-align: center;
    text-transform: uppercase;
  }

  .size-selector strong {
    font: 0.78rem/1 'Space Mono', monospace;
    letter-spacing: 0.06em;
  }

  .size-selector input:checked + span {
    background: #dbe84e;
    color: #101718;
  }

  .size-selector input:focus-visible + span {
    outline: 2px solid #7de5ef;
    outline-offset: 2px;
  }

  .inventory {
    overflow-x: auto;
    padding: clamp(1rem, 4vw, 3rem);
    border: 1px solid #344346;
    border-radius: 1rem;
    background:
      linear-gradient(135deg, rgb(29 42 45 / 88%), rgb(10 15 17 / 94%)),
      repeating-linear-gradient(90deg, transparent 0 2rem, rgb(125 229 239 / 4%) 2rem 2.05rem);
    box-shadow: 0 2.5rem 6rem rgb(0 0 0 / 30%);
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1.5rem;
  }

  ol {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--card-width)), var(--card-width)));
    gap: 3rem 2rem;
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    width: min(100%, var(--card-width));
    min-width: 0;
  }

  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }

  .card-heading > span {
    overflow: hidden;
    color: #dbe3e0;
    font: 0.72rem/1.4 'Space Mono', monospace;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .card-stage {
    width: 100%;
  }

  @media (max-width: 700px) {
    main {
      width: min(100% - 1rem, 92rem);
      padding-top: 2rem;
    }

    .size-selector {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .size-selector label > span {
      min-width: 0;
      padding-inline: 0.35rem;
    }

    .inventory {
      padding-inline: 0.5rem;
    }

    .section-heading {
      display: block;
    }

  }
</style>
