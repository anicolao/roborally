<script lang="ts">
  import { onMount } from 'svelte';
  import { initializeComputerFirebase, type FirebaseServices } from '$lib/firebase';
  import { nextComputerAction } from '$lib/computer-controller';
  import type { RoomState } from '$lib/room-model';
  let { state: room, services, roomCode, synced, playbackComplete }: { state: RoomState; services?: FirebaseServices; roomCode: string; synced: boolean; playbackComplete?: boolean } = $props();
  let error = $state('');
  let working = false;
  const attempted = new Set<string>();
  let previousRoom = '';
  onMount(() => {
    const timer = setInterval(async () => {
      if (!services || room.hostUid !== services.user.uid || !synced || working || error) return;
      if (previousRoom !== roomCode) { attempted.clear(); previousRoom = roomCode; }
      for (const player of room.players.filter((player) => player.computerOwnerUid === services!.user.uid)) {
        const action = nextComputerAction(room, player, playbackComplete);
        if (!action || attempted.has(action.key)) continue;
        working = true;
        attempted.add(action.key);
        try {
          const computer = await initializeComputerFirebase(services.user.uid, player.robotId);
          if (computer.user.uid !== player.uid) throw new Error('Keep the browser that added the computer players open to control them.');
          await action.run(computer, roomCode);
        } catch (cause) {
          attempted.delete(action.key);
          console.error(cause);
          error = cause instanceof Error && cause.message.startsWith('Keep the browser')
            ? cause.message
            : 'The computer could not finish its turn. Check the connection and retry.';
        } finally { working = false; }
        break;
      }
    }, 350);
    return () => clearInterval(timer);
  });
</script>
{#if error}<aside class="computer-error" role="alert">{error} <button onclick={() => { error = ''; }}>Retry computer</button></aside>{/if}
<style>.computer-error { position: fixed; z-index: 100; bottom: 12px; left: 12px; right: 12px; padding: 12px; background: #3c211b; color: white; border: 1px solid #e59469; }</style>
