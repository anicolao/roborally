<script lang="ts">
  import '@fontsource/atkinson-hyperlegible/400.css';
  import '@fontsource/atkinson-hyperlegible/700.css';
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import { onMount } from 'svelte';

  type ConnectionState = 'connecting' | 'synced' | 'error';

  let connectionState: ConnectionState = 'connecting';
  let connectionMessage = 'Connecting to the factory network';
  const buildHash = (import.meta.env.VITE_GIT_HASH ?? 'local-development').slice(0, 8);

  onMount(async () => {
    try {
      const { initializeFirebase } = await import('$lib/firebase');
      await initializeFirebase();
      connectionState = 'synced';
      connectionMessage =
        import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
          ? 'Firebase emulator ready'
          : 'Factory network ready';
    } catch (error) {
      console.error(error);
      connectionState = 'error';
      connectionMessage = 'Firebase configuration required';
    }
  });

  const cards = [
    { label: 'Move 3', priority: '840', mark: '↑↑↑' },
    { label: 'Rotate left', priority: '390', mark: '↶' },
    { label: 'Move 1', priority: '610', mark: '↑' },
    { label: 'Back up', priority: '470', mark: '↓' },
    { label: 'Rotate right', priority: '120', mark: '↷' }
  ];
</script>

<svelte:head>
  <title>Robo Rally — Program the factory</title>
</svelte:head>

<main class="shell" data-e2e-layout>
  <header class="masthead">
    <a class="brand" href="/" aria-label="Robo Rally home">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span><strong>ROBO</strong> RALLY <small>2005</small></span>
    </a>

    <div class="network">
      <span class:online={connectionState === 'synced'} class="signal" aria-hidden="true"></span>
      <span role="status" data-status={connectionState}>{connectionMessage}</span>
    </div>
  </header>

  <section class="hero">
    <div class="copy">
      <p class="eyebrow"><span>01</span> CLASSIC FACTORY CONTROL</p>
      <h1>Program.<br /><em>Collide.</em><br />Survive.</h1>
      <p class="lede">
        Secretly load five registers. Watch every robot execute. Reach the flags while the
        factory—and your rivals—rewrite the route.
      </p>

      <div class="actions" aria-label="Race actions">
        <button disabled>Create race</button>
        <button class="secondary" disabled>Join with code</button>
        <p>Room controls arrive in the next tracer bullet.</p>
      </div>

      <dl class="facts">
        <div><dt>2–8</dt><dd>robots</dd></div>
        <div><dt>84</dt><dd>program cards</dd></div>
        <div><dt>5</dt><dd>registers</dd></div>
        <div><dt>34</dt><dd>courses</dd></div>
      </dl>
    </div>

    <div class="telemetry" role="img" aria-label="Factory course and five programmed registers">
      <div class="telemetry-head">
        <span>EXCHANGE / PRE-RACE</span>
        <span class="live"><i></i> LINKED</span>
      </div>

      <div class="factory">
        <div class="grid-lines"></div>
        <span class="conveyor belt-a">▶ ▶ ▶</span>
        <span class="conveyor belt-b">▲ ▲ ▲</span>
        <span class="pit pit-a"></span>
        <span class="pit pit-b"></span>
        <span class="flag">1</span>
        <span class="robot" aria-hidden="true">
          <i class="antenna"></i><i class="eye left"></i><i class="eye right"></i>
        </span>
        <span class="route route-a"></span>
        <span class="route route-b"></span>
        <span class="coordinate">X:04 / Y:09 / N</span>
      </div>

      <ol class="registers" aria-label="Example register program">
        {#each cards as card, index}
          <li>
            <span class="register-number">R{index + 1}</span>
            <strong>{card.mark}</strong>
            <span>{card.label}</span>
            <small>{card.priority}</small>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <footer>
    <span>Deterministic multiplayer / Avalon Hill 2005 rules target</span>
    <span data-testid="build-marker">Build {buildHash}</span>
    <span>GPL-3.0-only</span>
  </footer>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { height: 100%; background: #0b0f10; }
  :global(body) {
    min-width: 320px;
    height: 100%;
    margin: 0;
    overflow: hidden;
    color: #e9eee9;
    background:
      radial-gradient(circle at 78% 20%, rgba(210, 255, 55, 0.08), transparent 25%),
      linear-gradient(135deg, #12191b 0%, #090c0d 64%);
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }
  :global(button), :global(input) { font: inherit; }

  .shell {
    display: grid;
    grid-template-rows: 68px minmax(0, 1fr) 46px;
    width: min(100% - 48px, 1180px);
    height: 100dvh;
    margin: 0 auto;
  }

  .masthead, footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .masthead { border-bottom: 1px solid #344043; }
  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    color: #eef4ee;
    font-family: 'Space Mono', monospace;
    font-size: 16px;
    letter-spacing: 0.12em;
    text-decoration: none;
  }
  .brand strong { color: #d2ff37; }
  .brand small {
    margin-left: 6px;
    padding: 2px 5px;
    border: 1px solid #5a696c;
    color: #9caaac;
    font-size: 8px;
    letter-spacing: 0.08em;
    vertical-align: 2px;
  }
  .brand-mark {
    display: grid;
    grid-template-columns: repeat(3, 6px);
    gap: 3px;
    padding: 9px;
    border: 1px solid #566265;
    transform: rotate(45deg);
  }
  .brand-mark i { width: 6px; height: 6px; background: #d2ff37; }
  .brand-mark i:nth-child(2) { opacity: 0.45; }

  .network {
    display: flex;
    gap: 8px;
    align-items: center;
    color: #8e9a9c;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .signal {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffb84d;
    box-shadow: 0 0 9px rgba(255, 184, 77, 0.55);
  }
  .signal.online { background: #d2ff37; box-shadow: 0 0 10px rgba(210, 255, 55, 0.6); }

  .hero {
    display: grid;
    grid-template-columns: minmax(360px, 0.82fr) minmax(500px, 1.18fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: center;
    min-height: 0;
    padding: 32px 0;
  }
  .eyebrow {
    margin: 0 0 18px;
    color: #899597;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.13em;
  }
  .eyebrow span { margin-right: 9px; color: #d2ff37; }
  h1 {
    margin: 0;
    color: #f1f5f0;
    font-family: 'Space Mono', monospace;
    font-size: clamp(48px, 5.3vw, 76px);
    line-height: 0.91;
    letter-spacing: -0.075em;
    text-transform: uppercase;
  }
  h1 em { color: transparent; font-style: normal; -webkit-text-stroke: 1px #aebbba; }
  .lede {
    max-width: 470px;
    margin: 22px 0 0;
    color: #a9b4b2;
    font-size: 16px;
    line-height: 1.55;
  }
  .actions {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 10px;
    align-items: center;
    margin-top: 24px;
  }
  button {
    min-height: 44px;
    padding: 0 19px;
    border: 1px solid #d2ff37;
    color: #101510;
    background: #d2ff37;
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  button.secondary { color: #a5b0ae; border-color: #4e5a5c; background: transparent; }
  button:disabled { cursor: not-allowed; opacity: 0.54; }
  .actions p { margin: 0 0 0 4px; color: #657173; font-size: 11px; line-height: 1.3; }
  .facts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 28px 0 0;
    border-top: 1px solid #344043;
    border-bottom: 1px solid #344043;
  }
  .facts div { padding: 12px 8px 12px 0; }
  .facts dt {
    color: #d2ff37;
    font-family: 'Space Mono', monospace;
    font-size: 18px;
    font-weight: 700;
  }
  .facts dd { margin: 2px 0 0; color: #718083; font-size: 10px; text-transform: uppercase; }

  .telemetry {
    position: relative;
    padding: 14px;
    border: 1px solid #435052;
    background: rgba(16, 23, 25, 0.88);
    box-shadow: 20px 24px 0 rgba(0, 0, 0, 0.18);
  }
  .telemetry::before, .telemetry::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: #d2ff37;
  }
  .telemetry::before { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
  .telemetry::after { right: -1px; bottom: -1px; border-right: 2px solid; border-bottom: 2px solid; }
  .telemetry-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    color: #829093;
    font-family: 'Space Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  .live { color: #d2ff37; }
  .live i { display: inline-block; width: 5px; height: 5px; margin-right: 5px; background: #d2ff37; }
  .factory {
    position: relative;
    height: min(32vh, 310px);
    min-height: 220px;
    overflow: hidden;
    border: 1px solid #354245;
    background:
      linear-gradient(45deg, rgba(255,255,255,.025) 25%, transparent 25% 75%, rgba(255,255,255,.025) 75%),
      #182123;
    background-size: 28px 28px;
  }
  .grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(110, 130, 133, 0.14) 1px, transparent 1px),
      linear-gradient(90deg, rgba(110, 130, 133, 0.14) 1px, transparent 1px);
    background-size: 42px 42px;
  }
  .conveyor {
    position: absolute;
    padding: 5px 8px;
    overflow: hidden;
    color: #7dffea;
    border: 1px solid #337c76;
    background: repeating-linear-gradient(90deg, #173c3b 0 15px, #102928 15px 30px);
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    letter-spacing: 7px;
    white-space: nowrap;
  }
  .belt-a { top: 28%; right: 8%; width: 48%; }
  .belt-b { bottom: 12%; left: 19%; width: 34%; transform: rotate(-90deg); transform-origin: left center; }
  .pit { position: absolute; width: 42px; height: 42px; background: #050708; box-shadow: inset 0 0 0 5px #242e30; }
  .pit-a { top: 12%; left: 14%; }
  .pit-b { right: 20%; bottom: 12%; }
  .flag {
    position: absolute;
    top: 13%;
    right: 12%;
    display: grid;
    width: 35px;
    height: 35px;
    place-items: center;
    border-radius: 50%;
    color: #111;
    background: #ffcf4b;
    box-shadow: 0 0 0 5px rgba(255, 207, 75, 0.15);
    font: 700 15px 'Space Mono', monospace;
  }
  .robot {
    position: absolute;
    bottom: 22%;
    left: 42%;
    width: 54px;
    height: 48px;
    border: 4px solid #101617;
    border-radius: 8px 8px 13px 13px;
    background: #d2ff37;
    box-shadow: 0 0 0 2px #839d2b, 0 8px 20px rgba(210, 255, 55, 0.18);
  }
  .robot::before, .robot::after {
    content: '';
    position: absolute;
    top: 10px;
    width: 8px;
    height: 25px;
    background: #647328;
  }
  .robot::before { left: -10px; }
  .robot::after { right: -10px; }
  .antenna { position: absolute; left: 21px; top: -18px; width: 5px; height: 16px; background: #d2ff37; }
  .eye { position: absolute; top: 12px; width: 8px; height: 6px; background: #111; }
  .eye.left { left: 11px; }
  .eye.right { right: 11px; }
  .route { position: absolute; height: 2px; background: #d2ff37; opacity: 0.55; }
  .route-a { left: 10%; bottom: 28%; width: 29%; }
  .route-b { left: 52%; bottom: 40%; width: 30%; transform: rotate(-32deg); transform-origin: left; }
  .coordinate {
    position: absolute;
    right: 8px;
    bottom: 6px;
    color: #687679;
    font: 8px 'Space Mono', monospace;
  }
  .registers {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 7px;
    margin: 9px 0 0;
    padding: 0;
    list-style: none;
  }
  .registers li {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 96px;
    grid-template-rows: auto 1fr auto;
    padding: 8px;
    border: 1px solid #3b484b;
    color: #a4b0ae;
    background: #111719;
    text-align: center;
  }
  .registers li:first-child { border-color: #7e982b; background: #182014; }
  .register-number { color: #657275; font: 8px 'Space Mono', monospace; text-align: left; }
  .registers strong {
    align-self: center;
    color: #d2ff37;
    font: 700 24px 'Space Mono', monospace;
  }
  .registers li > span:nth-of-type(2) {
    overflow: hidden;
    font-size: 9px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .registers small { position: absolute; top: 7px; right: 7px; color: #f2d372; font: 8px 'Space Mono', monospace; }

  footer {
    border-top: 1px solid #344043;
    color: #647174;
    font-family: 'Space Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  footer span:nth-child(2) { color: #95a3a1; }

  @media (max-width: 820px) {
    .shell { grid-template-rows: 58px minmax(0, 1fr) 34px; width: min(100% - 28px, 560px); }
    .masthead { align-items: center; }
    .brand { gap: 9px; font-size: 13px; }
    .brand-mark { grid-template-columns: repeat(3, 4px); gap: 2px; padding: 7px; }
    .brand-mark i { width: 4px; height: 4px; }
    .network { max-width: 125px; font-size: 8px; text-align: right; }
    .hero {
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 15px;
      padding: 15px 0 12px;
    }
    .copy { display: grid; grid-template-columns: 1fr auto; align-items: end; }
    .eyebrow { grid-column: 1 / -1; margin-bottom: 9px; font-size: 8px; }
    h1 { font-size: clamp(35px, 11vw, 48px); line-height: 0.9; }
    .lede { align-self: center; max-width: 190px; margin: 0 0 0 16px; font-size: 11px; line-height: 1.35; }
    .actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; margin-top: 13px; }
    .actions p { display: none; }
    button { min-height: 38px; padding: 0 10px; font-size: 9px; }
    .facts { grid-column: 1 / -1; margin-top: 12px; }
    .facts div { padding: 7px 3px 7px 0; }
    .facts dt { font-size: 14px; }
    .facts dd { font-size: 8px; }
    .telemetry { align-self: stretch; min-height: 0; padding: 9px; box-shadow: 10px 12px 0 rgba(0,0,0,.16); }
    .telemetry-head { margin-bottom: 6px; font-size: 7px; }
    .factory { height: calc(100% - 91px); min-height: 150px; }
    .registers { gap: 4px; margin-top: 6px; }
    .registers li { min-height: 75px; padding: 5px; }
    .registers strong { font-size: 17px; }
    .registers li > span:nth-of-type(2) { font-size: 7px; }
    .registers small, .register-number { font-size: 6px; }
    footer span:first-child { display: none; }
    footer { font-size: 7px; }
  }

  @media (max-height: 720px) and (max-width: 820px) {
    .lede, .facts { display: none; }
    .copy { grid-template-columns: 1fr; }
    .actions { margin-top: 9px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
  }
</style>
