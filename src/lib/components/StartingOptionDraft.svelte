<script lang="ts">
  import type { FirebaseServices } from '$lib/firebase';
  import { scenarioOptionDraft, type RoomState } from '$lib/room-model';
  import { selectScenarioOption } from '$lib/room-service';
  import { OPTION_CARDS_BY_ID, type OptionCardId } from '$lib/game/option-manifest';
  import OptionCardFace from './OptionCardFace.svelte';
  let { state: room, services, roomCode }: { state: RoomState; services: FirebaseServices; roomCode: string } = $props();
  const drafts = $derived(scenarioOptionDraft(room));
  const uid = $derived(services.user.uid);
  const waiting = $derived(room.players.filter(({ uid }) => drafts[uid] && !room.scenarioOptions?.[uid]));
  let pending = $state(false);
  let error = $state('');
  async function choose(cardId: OptionCardId) {
    pending = true;
    try { await selectScenarioOption(services.db, services.user, roomCode, cardId); }
    catch { error = 'Unable to save your starting Option. Please try again.'; }
    finally { pending = false; }
  }
</script>

{#if !room.programming && waiting.length}
  <section aria-label="Starting Option selection">
    <h2>Choose your starting Option</h2>
    {#if drafts[uid] && !room.scenarioOptions?.[uid]}
      <p>Keep one. The other two return to the bottom of the deck.</p>
      <div class="choices">
        {#each drafts[uid] as cardId}
          {@const card = OPTION_CARDS_BY_ID.get(cardId)!}
          <button aria-label={`Keep ${card.name}`} onclick={() => choose(cardId)} disabled={pending}>
            <OptionCardFace {card} size="small" />
          </button>
        {/each}
      </div>
    {:else}<p>Waiting for {waiting.map(({ name }) => name).join(', ')} to choose an Option.</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .choices { display: flex; flex-wrap: wrap; gap: .5rem; }
  button { padding: 0; border: 0; background: transparent; cursor: pointer; }
  button:focus-visible { outline: 3px solid #ffcf4b; outline-offset: 3px; }
</style>
