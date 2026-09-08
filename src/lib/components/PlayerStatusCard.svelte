<script lang="ts">
  import ProgramCardFace from './ProgramCardFace.svelte';
  import { PROGRAM_CARDS, type ProgramCard } from '$lib/game/program-manifest';
  import type { ProgramPlaybackFrame, LockedRegisterState } from '$lib/game/movement';
  import { programCardIdForPlayback } from '$lib/playback-presentation';
  export let registers: readonly { cardId: ProgramCard['id'] | null; locked: boolean }[] = [];
  export let playbackFrames: ProgramPlaybackFrame[] = [];
  export let revealThrough = 0;
  import OptionInventory from './OptionInventory.svelte';
  import type { OptionCardId } from '$lib/game/option-manifest';
  export let uid: string;
  export let playerName: string;
  export let robotName: string | undefined;
  export let startingLives: number;
  export let lives: number;
  export let damage: number;
  export let powerMode: string;
  export let touchedFlags: number[];
  export let flags: readonly { number: number }[];
  export let optionCardIds: OptionCardId[];
  export let compact = false;
  export let optionsDisabled = false;
  export let status = 'active';
  export let lockedRegisters: LockedRegisterState[] = [];
  export let archive: { x: number; y: number } | undefined = undefined;
</script>
<div class="player-status" class:compact>
  {#if compact}
    <span class="sr-only">{playerName} {status} · {lives} Lives · {damage} Damage{powerMode === 'down' ? ' · Powered down' : powerMode === 'announced' ? ' · Shutdown announced' : ''}{lockedRegisters.length ? ` · Locked ${lockedRegisters.map(({ register }) => `R${register}`).join('/')}` : ''} · Flags {touchedFlags.length ? touchedFlags.join('→') : 'none'}</span>
  {/if}
          <strong class="player-name">{playerName}</strong>
          <small class="robot-name">{robotName}</small>
          <div
            class="robot-vitals"
            aria-hidden={compact ? true : undefined}
            data-player-vitals={uid}
            aria-label={compact ? undefined : `${playerName}: ${lives} of ${startingLives} lives remaining, ${damage} damage taken and ${10 - damage} damage not yet taken, ${powerMode === "down" ? "powered down" : powerMode === "announced" ? "power down announced" : "active power"}`}
          >
            <div class="life-track" aria-hidden="true">
              <b>LIFE</b>
              {#each Array(startingLives) as _, lifeIndex}
                <i class:remaining={lifeIndex < lives}>◆</i>
              {/each}
            </div>
            <div class="damage-track" aria-hidden="true">
              <b>DMG</b>
              {#each Array(10) as _, damageIndex}
                <i
                  class:taken={damageIndex < damage}
                  class:available={damageIndex >= damage}
                ></i>
              {/each}
            </div>
            <div
              class="flag-track"
              aria-label={`${playerName} touched flags: ${touchedFlags.length ? touchedFlags.join(", ") : "none"}`}
            >
              <b>FLAGS</b>
              {#each flags as flag}
                <i class:touched={touchedFlags.includes(flag.number)}
                  >{flag.number}</i
                >
              {/each}
            </div>
            <div
              class:down={powerMode === "down"}
              class:announced={powerMode === "announced"}
              class="power-state"
            >
              <i></i>
              <span
                >{powerMode === "down"
                  ? "POWERED DOWN"
                  : powerMode === "announced"
                    ? "SHUTDOWN NEXT"
                    : "ACTIVE"}</span
              >
            </div>
          </div>
          {#if optionCardIds.length > 0}
            <OptionInventory {playerName} cardIds={optionCardIds} disabled={optionsDisabled} />
          {/if}
  {#if compact && status !== 'active'}<span class="board-status">{status === 'destroyed' ? 'Awaiting re-entry' : 'Eliminated'}</span>{/if}
          <div
            class="program-cards"
            aria-label={`${playerName} program cards`}
          >
            {#each Array(5) as _, cardIndex}
              {@const revealed = cardIndex + 1 <= revealThrough}
              {@const register = registers[cardIndex]}
              {@const damageLock = lockedRegisters.find(({ register }) => register === cardIndex + 1)}
              {@const locked = register?.locked || !!damageLock}
              {@const cardId = programCardIdForPlayback(
                playbackFrames,
                uid,
                cardIndex + 1,
                damageLock?.cardId ?? register?.cardId ?? null,
              )}
              {@const card = PROGRAM_CARDS.find((entry) => entry.id === cardId)}
              <span
                class:revealed={revealed || locked}
                class:locked
                class="program-card"
                data-register={cardIndex + 1}
                data-locked={locked ? "true" : undefined}
              >
                {#if (revealed || locked) && card}
                  <ProgramCardFace {card} compact variant="square" />
                {:else}
                  <span class="program-card-back" aria-hidden="true">●</span>
                {/if}
                {#if locked}
                  <span
                    class="register-lock"
                    role="img"
                    aria-label={`Register ${cardIndex + 1} locked`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10h1.25A2.25 2.25 0 0 1 20 12.25v6.5A2.25 2.25 0 0 1 17.75 21H6.25A2.25 2.25 0 0 1 4 18.75v-6.5A2.25 2.25 0 0 1 6.25 10zm2 0h5V7.5a2.5 2.5 0 0 0-5 0z"
                      />
                    </svg>
                  </span>
                {/if}
              </span>
            {/each}
          </div>
  {#if archive}<small class="archive">Archive ({archive.x},{archive.y})</small>{/if}
</div>
<style>
  .player-status { display: contents; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
  .player-name {
    overflow: hidden;
    font-size: clamp(14px, 7cqh, 42px);
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .robot-name {
    color: #9caaac;
    font-size: clamp(10px, 3.5cqh, 22px);
  }
  .robot-vitals {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: clamp(3px, 1cqh, 8px) clamp(4px, 1cqw, 12px);
    margin-top: clamp(1px, 0.7cqh, 6px);
    font-family: "Space Mono", monospace;
  }
  .life-track,
  .damage-track {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 3px;
  }
  .life-track {
    grid-column: 1;
  }
  .damage-track {
    grid-column: 1 / -1;
  }
  .flag-track {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .robot-vitals b {
    width: clamp(26px, 5cqw, 54px);
    flex: 0 0 clamp(26px, 5cqw, 54px);
    color: #849294;
    font-size: clamp(8px, 2.4cqh, 15px);
    letter-spacing: 0.08em;
  }
  .life-track i {
    color: #394648;
    font-size: clamp(11px, 3.5cqh, 24px);
    font-style: normal;
    line-height: 1;
  }
  .life-track i.remaining {
    color: #d2ff37;
    filter: drop-shadow(0 0 3px #d2ff3788);
  }
  .damage-track i {
    height: clamp(7px, 2.5cqh, 15px);
    min-width: 4px;
    flex: 1;
    border: 1px solid #4c5a5d;
    border-radius: 2px;
    background: #202b2d;
  }
  .damage-track i.taken {
    border-color: #ff684f;
    background: #ff684f;
    box-shadow: 0 0 3px #ff684f99;
  }
  .flag-track i {
    display: grid;
    width: clamp(16px, 4cqh, 30px);
    height: clamp(16px, 4cqh, 30px);
    place-items: center;
    border: 1px solid #526164;
    border-radius: 50%;
    color: #718083;
    background: #202b2d;
    font:
      700 clamp(8px, 2.2cqh, 14px) "Space Mono",
      monospace;
    font-style: normal;
  }
  .flag-track i.touched {
    border-color: #ffcf4b;
    color: #111718;
    background: #ffcf4b;
    box-shadow: 0 0 6px #ffcf4b99;
  }
  .power-state {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    gap: 5px;
    color: #9ff07f;
    font-size: clamp(8px, 2.2cqh, 14px);
    white-space: nowrap;
  }
  .power-state i {
    width: clamp(8px, 2.5cqh, 16px);
    height: clamp(8px, 2.5cqh, 16px);
    border: 2px solid #263126;
    border-radius: 50%;
    background: #8dff69;
    box-shadow: 0 0 6px #8dff69;
  }
  .power-state.announced {
    color: #ffcf4b;
  }
  .power-state.announced i {
    border-color: #3a3218;
    background: #ffcf4b;
    box-shadow: 0 0 6px #ffcf4b;
  }
  .power-state.down {
    color: #ff887d;
  }
  .power-state.down i {
    border-color: #482522;
    background: #ff684f;
    box-shadow: 0 0 6px #ff684f;
  }

  .compact .player-name { font-size: 18px; color: #eef4ee; }
  .compact .robot-name { font-size: 12px; }
  .compact .robot-vitals { gap: 5px; margin-top: 2px; }
  .compact .robot-vitals b { width: 36px; flex-basis: 36px; font-size: 10px; }
  .compact .life-track i { font-size: 16px; }
  .compact .damage-track i { height: 10px; }
  .compact .flag-track i { width: 20px; height: 20px; font-size: 11px; }
  .compact .power-state { font-size: 10px; }
  .compact .power-state i { width: 10px; height: 10px; }
  .archive, .board-status { color: #9caaac; font: 11px 'Space Mono', monospace; }
  @media (max-width: 700px) {
    .player-status:not(.compact) .player-name { font-size: 14px; }
    .player-status:not(.compact) .robot-name,
    .player-status:not(.compact) .power-state span,
    .player-status:not(.compact) .robot-vitals b { display: none; }
    .player-status:not(.compact) .robot-vitals { display: block; }
    .player-status:not(.compact) .life-track,
    .player-status:not(.compact) .damage-track { margin-top: 3px; }
  }  .program-cards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: clamp(2px, 0.35vw, 7px);
    margin-top: clamp(2px, 0.6cqh, 6px);
  }
  .program-card {
    position: relative;
    display: grid;
    min-width: 0;
    aspect-ratio: 1;
    place-items: center;
    overflow: hidden;
    border: 1px solid #435052;
    border-radius: clamp(2px, 0.25vw, 6px);
    color: #8b999a;
    background: linear-gradient(135deg, #202b2d, #344245);
    font:
      700 clamp(7px, 1cqw, 13px) "Space Mono",
      monospace;
    text-align: center;
    text-transform: uppercase;
  }
  .program-card.revealed {
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }
  .register-lock {
    position: absolute;
    z-index: 4;
    top: -8%;
    right: -8%;
    display: grid;
    width: clamp(16px, 1.55cqw, 25px);
    aspect-ratio: 1;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 62%);
    border-radius: 50%;
    color: #152022;
    background: #d2ff37;
    box-shadow: 0 2px 7px rgb(0 0 0 / 65%);
  }
  .register-lock svg {
    display: block;
    width: 68%;
    height: 68%;
    fill: currentcolor;
  }
  .program-card-back {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    border: 2px solid #4a595c;
    background: repeating-linear-gradient(
      135deg,
      #1a2325 0 5px,
      #263235 5px 10px
    );
  }

</style>
