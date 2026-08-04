<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import { base } from '$app/paths';
  import ProgramCardFace from '$lib/components/ProgramCardFace.svelte';
  import { PROGRAM_CARDS, type ProgramAction } from '$lib/game/program-manifest';

  const actions = [
    'u-turn',
    'rotate-left',
    'rotate-right',
    'back-up',
    'move-1',
    'move-2',
    'move-3'
  ] as const satisfies readonly ProgramAction[];
  const showcaseCards = actions.map((action) =>
    PROGRAM_CARDS.find((card) => card.action === action)!
  );
  const actionLabel = (action: ProgramAction) => action.replaceAll('-', ' ');
  let cardStyle = $state<'portrait' | 'square'>('portrait');
</script>

<svelte:head>
  <title>Program card artwork — Robo Rally</title>
  <meta
    name="description"
    content="Review the complete layered raster artwork set for all Robo Rally 2005 Program cards."
  />
  <link rel="preload" as="image" href={`${base}/assets/cards/program-card-background-v1.webp`} />
  <link
    rel="preload"
    as="image"
    href={`${base}/assets/cards/program-card-background-square-v1.webp`}
  />
</svelte:head>

<main>
  <header>
    <p>AVALON HILL 2005 · LAYERED RASTER PROOF</p>
    <h1>Program cards</h1>
    <span>
      Complete 2005 Program deck. Two generated chassis styles and three reusable command symbols
      produce every card below; mirrored and rotated layers keep matching commands exact. Priority,
      title, distance, and accessible description come from the game manifest.
    </span>

    <fieldset class="style-selector">
      <legend>Card style</legend>
      <label>
        <input type="radio" name="card-style" value="portrait" bind:group={cardStyle} />
        <span>Portrait</span>
      </label>
      <label>
        <input type="radio" name="card-style" value="square" bind:group={cardStyle} />
        <span>Square</span>
      </label>
    </fieldset>
  </header>

  <section class="showcase" aria-labelledby="showcase-heading">
    <div class="section-heading">
      <p>ART DIRECTION CHECK</p>
      <h2 id="showcase-heading">One asset system, seven commands</h2>
    </div>
    <div class="showcase-cards">
      {#each showcaseCards as card}
        <ProgramCardFace {card} variant={cardStyle} />
      {/each}
    </div>
  </section>

  <section class="inventory" aria-labelledby="inventory-heading">
    <div class="section-heading inventory-heading">
      <div>
        <p>LIVE MANIFEST INVENTORY</p>
        <h2 id="inventory-heading">All {PROGRAM_CARDS.length} Program cards</h2>
      </div>
      <span>Priorities 10–840</span>
    </div>

    {#each actions as action}
      {@const cards = PROGRAM_CARDS.filter((card) => card.action === action)}
      <section class="card-family" aria-labelledby={`${action}-heading`}>
        <h3 id={`${action}-heading`}>
          {actionLabel(action)} <span>{cards.length} cards</span>
        </h3>
        <ol aria-label={`${actionLabel(action)} card priorities`}>
          {#each cards as card}
            <li><ProgramCardFace {card} compact variant={cardStyle} /></li>
          {/each}
        </ol>
      </section>
    {/each}
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
      linear-gradient(#101719, #090d0f 58rem);
    color: #f1f5ec;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }

  main {
    width: min(100% - 2rem, 92rem);
    margin: 0 auto;
    padding: 3rem 0 6rem;
  }

  header {
    max-width: 52rem;
    margin-bottom: 4rem;
  }

  header p,
  .section-heading p {
    margin: 0 0 0.55rem;
    color: #7de5ef;
    font: 0.75rem/1.4 'Space Mono', monospace;
    letter-spacing: 0.12em;
  }

  h1 {
    margin: 0;
    font-size: clamp(3rem, 8vw, 6.8rem);
    line-height: 0.86;
    text-transform: uppercase;
  }

  header > span {
    display: block;
    max-width: 47rem;
    margin-top: 1.4rem;
    color: #bdc9c7;
    font-size: clamp(1rem, 2vw, 1.25rem);
    line-height: 1.55;
  }

  .style-selector {
    display: inline-flex;
    gap: 0.35rem;
    margin: 1.8rem 0 0;
    padding: 0.3rem;
    border: 1px solid #3a4b4e;
    border-radius: 0.65rem;
    background: rgb(8 13 15 / 72%);
  }

  .style-selector legend {
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

  .style-selector label {
    position: relative;
    cursor: pointer;
  }

  .style-selector input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .style-selector label > span {
    display: block;
    padding: 0.55rem 0.9rem;
    border-radius: 0.42rem;
    color: #aebcba;
    font: 0.78rem/1 'Space Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .style-selector input:checked + span {
    background: #dbe84e;
    color: #101718;
  }

  .style-selector input:focus-visible + span {
    outline: 2px solid #7de5ef;
    outline-offset: 2px;
  }

  section {
    min-width: 0;
  }

  .section-heading {
    margin-bottom: 1.6rem;
  }

  h2,
  h3 {
    margin: 0;
    text-transform: uppercase;
  }

  h2 {
    font-size: clamp(1.75rem, 4vw, 3rem);
  }

  .showcase {
    padding: clamp(1.2rem, 4vw, 3rem);
    border: 1px solid #344346;
    border-radius: 1rem;
    background:
      linear-gradient(135deg, rgb(29 42 45 / 88%), rgb(10 15 17 / 94%)),
      repeating-linear-gradient(90deg, transparent 0 2rem, rgb(125 229 239 / 4%) 2rem 2.05rem);
    box-shadow: 0 2.5rem 6rem rgb(0 0 0 / 30%);
  }

  .showcase-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 15rem));
    justify-content: center;
    gap: clamp(1rem, 3vw, 2rem);
  }

  .inventory {
    margin-top: 5rem;
  }

  .inventory-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .inventory-heading > span,
  h3 span {
    color: #8fa19e;
    font: 0.8rem/1.4 'Space Mono', monospace;
    letter-spacing: 0.05em;
  }

  .card-family {
    padding: 1.5rem 0 2.5rem;
    border-top: 1px solid #2d3a3d;
  }

  h3 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    color: #dce6e2;
    font-size: 1.25rem;
  }

  ol {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: clamp(0.75rem, 1.8vw, 1.35rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
  }

  @media (max-width: 70rem) {
    .showcase-cards {
      grid-template-columns: repeat(3, minmax(0, 14rem));
    }
  }

  @media (max-width: 48rem) {
    main {
      padding-top: 2rem;
    }

    header {
      margin-bottom: 2.5rem;
    }

    .showcase-cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .inventory {
      margin-top: 3rem;
    }

    .inventory-heading {
      align-items: start;
      flex-direction: column;
    }

    ol {
      grid-template-columns: repeat(auto-fill, minmax(6.7rem, 1fr));
    }
  }
</style>
