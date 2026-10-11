<script lang="ts">
  import { base } from '$app/paths';
  import { ROBOTS } from '$lib/room-model';
  export let robotId: string;
  export let decorative = false;
  $: robot = ROBOTS.find(({ id }) => id === robotId);
</script>
<img class="robot-marker" src={`${base}/assets/robots/${robot?.id ?? 'axle'}-v2.webp`}
  alt={decorative ? '' : robot?.name ?? 'Robot'} draggable="false" />
<style>
  .robot-marker { display: block; width: var(--robot-art-size, 32px); height: var(--robot-art-size, 32px); object-fit: contain; }
</style>
