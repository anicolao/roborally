<script lang="ts">
  import type { FirebaseServices } from '$lib/firebase';
  import { addComputerPlayer } from '$lib/computer-controller';
  import type { RoomState } from '$lib/room-model';
  let { state: room, services, roomCode }: { state: RoomState; services?: FirebaseServices; roomCode: string } = $props();
  let pending = $state(false);
  let error = $state('');
  async function add() {
    if (!services || pending) return;
    pending = true; error = '';
    try { await addComputerPlayer(room, services, roomCode); }
    catch { error = 'Unable to add a computer. Please try again.'; }
    finally { pending = false; }
  }
</script>
{#if services?.user.uid === room.hostUid && !room.setup && room.players.length < 8}
  <button type="button" onclick={add} disabled={pending}>{pending ? 'Adding computer…' : 'Add computer'}</button>
  {#if error}<p role="alert">{error}</p>{/if}
{/if}
<style>button { cursor: pointer; padding: .65rem .9rem; border: 1px solid #81927b; background: #17241b; color: #e8f6df; font: inherit; } button:disabled { opacity: .6; }</style>
