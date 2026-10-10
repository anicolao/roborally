<script lang="ts">
  import { onMount } from 'svelte';
  import type { FirebaseServices } from '$lib/firebase';
  import type { ProgrammingState } from '$lib/game/programming';
  import { openCourseProgramming } from '$lib/room-service';

  let { services, roomCode, programming }: {
    services: FirebaseServices;
    roomCode: string;
    programming: ProgrammingState;
  } = $props();
  let error = $state('');
  let now = $state(Date.now());
  let opening = $state(false);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    const timer = setInterval(() => { now = Date.now(); }, 250);
    return () => clearInterval(timer);
  });
  async function open() {
    opening = true;
    error = '';
    try { await openCourseProgramming(services.db, services.user, roomCode, programming.turnId); }
    catch { error = 'Unable to start the programming clock.'; }
  }
  $effect(() => {
    if (mounted && programming.courseTimeLimitMs && programming.phase === 'programming' && !programming.deadline && !opening) void open();
  });
</script>

{#if programming.courseTimeLimitMs && programming.phase === 'programming'}
  <p role="timer" aria-label="Course programming clock">
    {#if programming.deadline}
      Everyone has {Math.max(0, Math.ceil((programming.deadline - now) / 1000))} seconds to finish programming.
    {:else}Starting the {programming.courseTimeLimitMs / 1000}-second programming clock…{/if}
  </p>
  {#if error}<p role="alert">{error} <button onclick={open}>Retry</button></p>{/if}
{/if}
