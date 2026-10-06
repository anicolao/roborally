<script lang="ts">
  import { ROBOTS } from '$lib/room-model';
  export let robotId: string;
  const colors: Record<string, string> = { axle: '#65d8ff', bit: '#ffb454', cog: '#ff79c6', dash: '#b993ff', flux: '#72e0c2', gizmo: '#ff887d', hex: '#e8edb5', rivet: '#9ad1ff' };
  $: robot = ROBOTS.find(({ id }) => id === robotId);
</script>
<span class="robot-marker" role="img" aria-label={robot?.name ?? 'Robot'} style={`--robot-color:${colors[robotId] ?? '#d2ff37'}`}><i></i>{robot?.mark}</span>
<style>
  .robot-marker { position: relative; display: grid; width: 23px; height: 20px; place-items: center;
    box-sizing: border-box; border: 2px solid #090d0e; border-radius: 3px;
    color: #0c120d; background: var(--robot-color); font: 700 14px 'Space Mono', monospace; }
  i { position: absolute; top: -7px; left: 8px; width: 4px; height: 7px; background: var(--robot-color); }
</style>
