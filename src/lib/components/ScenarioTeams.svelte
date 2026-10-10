<script lang="ts">
  import { playableCourse } from '$lib/game/playable-courses';
  import { scenarioTeamAssignments, validateScenarioTeams } from '$lib/game/setup';
  let { courseId, players, assignments = $bindable({}), readonly = false }: {
    courseId: string;
    players: readonly { uid: string; name: string }[];
    assignments?: Record<string, string>;
    readonly?: boolean;
  } = $props();
  const course = $derived(playableCourse(courseId));
  const teams = $derived(scenarioTeamAssignments(courseId, players, assignments));
  const teamCount = $derived(course.specialRules.some(({ kind }) => kind === 'team-shared-flag-progress') ? players.length / 2 : 2);
</script>

{#if course.category === 'team'}
  <fieldset>
    <legend>Teams</legend>
    {#each players as player}
      <label>
        {player.name}
        {#if readonly}<strong>{teams[player.uid]?.replace('team-', 'Team ')}</strong>
        {:else}
          <select aria-label={`Team for ${player.name}`} value={teams[player.uid]}
            onchange={(event) => { assignments = { ...teams, [player.uid]: event.currentTarget.value }; }}>
            {#each Array.from({ length: teamCount }, (_, index) => index + 1) as number}
              <option value={`team-${number}`}>Team {number}</option>
            {/each}
          </select>
        {/if}
      </label>
    {/each}
    {#if !validateScenarioTeams(courseId, teams)}<p role="status">Choose equal teams before configuring the race.</p>{/if}
  </fieldset>
{/if}

<style>
  fieldset { border: 1px solid #53616b; padding: .5rem; display: grid; gap: .5rem; }
  label { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
</style>
