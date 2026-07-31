<script lang="ts">
  import {
    ALL_BOARD_FACES,
    BOARD_FACES_BY_ID,
    boardElementCounts
  } from '$lib/game/board-catalog';
  import {
    BEGINNER_COURSES,
    EXPERT_COURSES,
    PUBLISHED_COURSES,
    PUBLISHED_COURSES_BY_ID,
    TEAM_COURSES,
    type CourseCategory
  } from '$lib/game/course-catalog';
  import {
    compilePublishedCourse,
    completeRepresentativeRace,
    type RepresentativeRaceAudit
  } from '$lib/game/course-geometry';
  import { publishedCourseRuleProbes } from '$lib/game/course-rules';

  type CatalogView = 'boards' | CourseCategory | 'rules';

  let view = $state<CatalogView>('boards');
  let selectedBoardId = $state('exchange');
  let selectedCourseId = $state('around-the-world');
  let raceAudit = $state<RepresentativeRaceAudit | null>(null);

  const ruleProbes = publishedCourseRuleProbes();
  const selectedBoard = $derived(BOARD_FACES_BY_ID.get(selectedBoardId) ?? ALL_BOARD_FACES[0]);
  const selectedCourse = $derived(
    PUBLISHED_COURSES_BY_ID.get(selectedCourseId) ?? BEGINNER_COURSES[0]
  );
  const compiledCourse = $derived(compilePublishedCourse(selectedCourse));
  const visibleCourses = $derived(
    view === 'beginner'
      ? BEGINNER_COURSES
      : view === 'expert'
        ? EXPERT_COURSES
        : view === 'team'
          ? TEAM_COURSES
          : []
  );

  function elementMark(kinds: readonly string[]) {
    if (kinds.includes('pit')) return '×';
    if (kinds.includes('laser')) return '│';
    if (kinds.includes('conveyor')) return '›';
    if (kinds.includes('pusher')) return 'P';
    if (kinds.includes('gear')) return '↻';
    if (kinds.includes('repair')) return '+';
    if (kinds.includes('dock')) return 'D';
    return '';
  }

  function runRepresentativeRace() {
    raceAudit = completeRepresentativeRace('around-the-world');
  }
</script>

<details class="catalog" aria-label="2005 board and course catalog">
  <summary>10 board faces · 34 published courses · executable exceptions</summary>
  <section class="catalog-body">
    <header>
      <div>
        <p>AVALON HILL 2005 / REVIEWED TWO-PASS</p>
        <h2>Factory &amp; course catalog</h2>
      </div>
      <dl>
        <div><dt>{ALL_BOARD_FACES.length}</dt><dd>faces</dd></div>
        <div><dt>{BEGINNER_COURSES.length}</dt><dd>beginner</dd></div>
        <div><dt>{EXPERT_COURSES.length}</dt><dd>expert</dd></div>
        <div><dt>{TEAM_COURSES.length}</dt><dd>team</dd></div>
      </dl>
    </header>

    <nav aria-label="Catalog sections">
      {#each [
        ['boards', 'Board faces'],
        ['beginner', 'Beginner'],
        ['expert', 'Expert'],
        ['team', 'Team'],
        ['rules', 'Rule probes']
      ] as section}
        <button
          type="button"
          aria-pressed={view === section[0]}
          onclick={() => (view = section[0] as CatalogView)}
        >
          {section[1]}
        </button>
      {/each}
    </nav>

    {#if view === 'boards'}
      <div class="board-catalog" aria-label="All reviewed board faces">
        <ol class="face-grid">
          {#each ALL_BOARD_FACES as face}
            {@const semantic = new Map(
              face.cells.map(({ x, y, elements }) => [
                `${x},${y}`,
                elements.map(({ kind }) => kind)
              ])
            )}
            <li data-board-id={face.id}>
              <button
                type="button"
                class:selected={selectedBoardId === face.id}
                aria-label={`Preview ${face.id}`}
                onclick={() => (selectedBoardId = face.id)}
              >
                <span
                  class="face-mini"
                  style={`--face-columns:${face.width};--face-rows:${face.height}`}
                  aria-hidden="true"
                >
                  {#each Array(face.width * face.height) as _, index}
                    {@const x = (index % face.width) + 1}
                    {@const y = Math.floor(index / face.width) + 1}
                    {@const kinds = semantic.get(`${x},${y}`) ?? []}
                    <i class:feature={kinds.length > 0} class:pit={kinds.includes('pit')}>
                      {elementMark(kinds)}
                    </i>
                  {/each}
                </span>
                <strong>{face.id.replaceAll('-', ' ')}</strong>
                <small>{face.width}×{face.height} · {face.walls.length} walls</small>
              </button>
            </li>
          {/each}
        </ol>

        <article class="face-facts" data-testid="selected-board-preview">
          <div>
            <p>SELECTED FACE</p>
            <h3>{selectedBoard.id.replaceAll('-', ' ')}</h3>
          </div>
          <ul>
            {#each Object.entries(boardElementCounts(selectedBoard)).sort() as [kind, count]}
              <li><strong>{count}</strong> {kind}</li>
            {/each}
            <li><strong>{selectedBoard.walls.length}</strong> wall edges</li>
          </ul>
          <small>{selectedBoard.provenance.join(' · ')}</small>
        </article>
      </div>
    {:else if view === 'rules'}
      <section class="rule-probes" aria-label="Published course rule probes">
        <div class="probe-summary">
          <strong>{ruleProbes.filter(({ passed }) => passed).length}/{ruleProbes.length}</strong>
          <span>exception families execute deterministically</span>
        </div>
        <ol>
          {#each ruleProbes as probe}
            <li data-rule-probe={probe.id} data-passed={probe.passed}>
              <span aria-hidden="true">{probe.passed ? '✓' : '!'}</span>
              <div><strong>{probe.label}</strong><small>{probe.evidence}</small></div>
            </li>
          {/each}
        </ol>
      </section>
    {:else}
      <div class:race-focus={raceAudit !== null} class="course-catalog">
        <ol class="course-list" aria-label={`${view} courses`}>
          {#each visibleCourses as course}
            <li data-course-id={course.id}>
              <button
                type="button"
                class:selected={selectedCourseId === course.id}
                onclick={() => {
                  selectedCourseId = course.id;
                  raceAudit = null;
                }}
              >
                <span>P{course.manualPage} · {course.players.join('/')}</span>
                <strong>{course.name}</strong>
                <small>{course.length} · {course.flags.length} flags · {course.boardPlacements.length} pieces</small>
              </button>
            </li>
          {/each}
        </ol>

        <article class="course-preview" data-course-preview={selectedCourse.id}>
          <header>
            <div>
              <p>{selectedCourse.category} / PAGE {selectedCourse.manualPage}</p>
              <h3>{selectedCourse.name}</h3>
            </div>
            <span>{selectedCourse.players.join('/')} racers · {selectedCourse.length}</span>
          </header>
          <div
            class="compiled-course"
            style={`--course-columns:${compiledCourse.width};--course-rows:${compiledCourse.height}`}
            role="img"
            aria-label={`${selectedCourse.name}: ${selectedCourse.boardPlacements.length} placed board pieces and ${selectedCourse.flags.length} flags`}
          >
            {#each Array(compiledCourse.width * compiledCourse.height) as _, index}
              {@const x = compiledCourse.minX + (index % compiledCourse.width)}
              {@const y = compiledCourse.minY + Math.floor(index / compiledCourse.width)}
              {@const cell = compiledCourse.cells.get(`${x},${y}`)}
              {@const flag = selectedCourse.flags.find((entry) => entry.x === x && entry.y === y)}
              {@const kinds = cell?.elements.map(({ kind }) => kind) ?? []}
              <i
                class:void={!cell}
                class:feature={kinds.length > 0}
                class:pit={kinds.includes('pit')}
                title={cell ? `${cell.boardInstanceId} · ${x},${y}` : 'outside course'}
              >
                {#if flag}<b>{flag.number}</b>{:else}{elementMark(kinds)}{/if}
              </i>
            {/each}
          </div>
          <p>{selectedCourse.description}</p>
          <ul class="placements">
            {#each selectedCourse.boardPlacements as placement}
              <li>
                {placement.instanceId} @ {placement.origin.join(',')} · {placement.rotation * 90}°
              </li>
            {/each}
          </ul>
          <ul class="special-rules">
            {#if selectedCourse.specialRules.length === 0}
              <li>Standard 2005 race rules</li>
            {:else}
              {#each selectedCourse.specialRules as rule}<li>{rule.kind}</li>{/each}
            {/if}
          </ul>
          {#if selectedCourse.id === 'around-the-world'}
            <button type="button" class="race-audit" onclick={runRepresentativeRace}>
              Run complete multi-board race
            </button>
            {#if raceAudit}
              <output class="race-result" aria-live="polite">
                <strong>Race complete · Flags {raceAudit.touchedFlags.join(' → ')}</strong>
                <span>
                  {raceAudit.route.length - 1} safe moves ·
                  {raceAudit.crossedBoardInstances.join(' → ')} · winner geometry-auditor
                </span>
              </output>
            {/if}
          {/if}
        </article>
      </div>
    {/if}
  </section>
</details>

<style>
  .catalog {
    margin-top: 12px;
    border: 1px solid #435052;
    background: #101719;
    color: #eef4ee;
  }
  .catalog:not([open]) .catalog-body { display: none; }
  :global(.lobby:has(.catalog[open]) .seat-console),
  :global(.room-console:has(.catalog[open]) > :not(.catalog)),
  :global(body:has(.catalog[open]) footer) {
    visibility: hidden;
  }
  details[open] .catalog-body {
    position: fixed;
    z-index: 40;
    inset: 68px max(12px, calc((100vw - 1180px) / 2)) 12px;
    max-height: none;
    border: 1px solid #59676a;
    background: #101719;
    box-shadow: 0 18px 80px rgba(0, 0, 0, .78);
  }
  summary {
    cursor: pointer;
    padding: 11px 13px;
    color: #d2ff37;
    font: 700 10px 'Space Mono', monospace;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .catalog-body {
    display: grid;
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    max-height: min(76vh, 780px);
    padding: 14px;
    overflow: hidden;
  }
  header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  p { margin: 0; color: #91a0a2; font: 9px 'Space Mono', monospace; }
  h2, h3 { margin: 3px 0 0; font: 700 18px 'Space Mono', monospace; text-transform: uppercase; }
  header dl { display: flex; gap: 10px; margin: 0; }
  header dl div { min-width: 48px; text-align: right; }
  dt { color: #d2ff37; font: 700 17px 'Space Mono', monospace; }
  dd { margin: 0; color: #7f8d8f; font: 8px 'Space Mono', monospace; text-transform: uppercase; }
  nav { display: flex; flex-wrap: wrap; gap: 5px; }
  button {
    min-height: 34px;
    border: 1px solid #4a5759;
    color: #d5ddda;
    background: #151d1f;
    font: 700 9px 'Space Mono', monospace;
    text-transform: uppercase;
  }
  nav button { padding: 0 12px; }
  button[aria-pressed='true'], button.selected { border-color: #d2ff37; color: #d2ff37; }
  ol, ul { margin: 0; padding: 0; list-style: none; }
  .board-catalog { min-height: 0; overflow: auto; }
  .face-grid { display: grid; grid-template-columns: repeat(5, minmax(112px, 1fr)); gap: 7px; }
  .face-grid button { display: grid; width: 100%; gap: 4px; padding: 7px; text-align: left; }
  .face-grid small, .course-list small, .course-list span, .course-preview span, .face-facts small {
    color: #849294;
    font: 8px 'Space Mono', monospace;
  }
  .face-mini {
    display: grid;
    aspect-ratio: calc(var(--face-columns) / var(--face-rows));
    grid-template-columns: repeat(var(--face-columns), 1fr);
    grid-template-rows: repeat(var(--face-rows), 1fr);
    border: 1px solid #536063;
    background: #1d282a;
  }
  .face-mini i, .compiled-course i {
    display: grid; min-width: 0; place-items: center;
    border-right: 1px solid rgba(110, 130, 132, .25);
    border-bottom: 1px solid rgba(110, 130, 132, .25);
    color: #8ddad0; font: 5px 'Space Mono', monospace;
  }
  .face-mini i.feature, .compiled-course i.feature { background: #183735; }
  .face-mini i.pit, .compiled-course i.pit { color: #9ba3a4; background: #050707; }
  .face-facts {
    display: grid; grid-template-columns: 160px 1fr; gap: 8px 20px;
    margin-top: 9px; padding: 10px; border: 1px solid #334144;
  }
  .face-facts ul { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .face-facts li { color: #aeb9b7; font: 9px 'Space Mono', monospace; }
  .face-facts li strong { color: #d2ff37; }
  .face-facts > small { grid-column: 1 / -1; }
  .course-catalog {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(190px, .72fr) minmax(300px, 1.28fr);
    gap: 10px;
    overflow: hidden;
  }
  .course-catalog.race-focus { grid-template-columns: 1fr; }
  .course-catalog.race-focus .course-list { display: none; }
  .course-list { display: grid; min-height: 0; align-content: start; gap: 4px; overflow: auto; }
  .course-list button { display: grid; width: 100%; gap: 2px; padding: 7px 9px; text-align: left; }
  .course-list strong { font-size: 10px; }
  .course-preview {
    display: grid; min-width: 0; min-height: 0; align-content: start; gap: 8px;
    padding: 11px; overflow: auto; border: 1px solid #344144;
  }
  .course-preview header > span { text-align: right; }
  .compiled-course {
    display: grid;
    width: min(100%, 520px);
    max-height: 360px;
    aspect-ratio: calc(var(--course-columns) / var(--course-rows));
    grid-template-columns: repeat(var(--course-columns), minmax(0, 1fr));
    grid-template-rows: repeat(var(--course-rows), minmax(0, 1fr));
    margin: 0 auto;
    border: 1px solid #536063;
    background: #182224;
  }
  .compiled-course i.void { border: 0; background: #0b1011; }
  .compiled-course b {
    display: grid; width: 12px; height: 12px; place-items: center;
    border-radius: 50%; color: #111; background: #ffcf4b;
    font: 700 7px 'Space Mono', monospace;
  }
  .placements, .special-rules { display: flex; flex-wrap: wrap; gap: 5px; }
  .placements li, .special-rules li {
    padding: 3px 5px; border: 1px solid #354346;
    color: #9faeac; font: 8px 'Space Mono', monospace;
  }
  .special-rules li { color: #ffcf4b; }
  .race-audit { padding: 0 12px; border-color: #d2ff37; color: #d2ff37; }
  .race-result { display: grid; gap: 3px; padding: 8px; border-left: 3px solid #d2ff37; background: #18221b; }
  .race-result strong { color: #d2ff37; font: 700 10px 'Space Mono', monospace; }
  .rule-probes {
    display: grid; min-height: 0; grid-template-columns: 180px 1fr;
    gap: 12px; overflow: hidden;
  }
  .probe-summary { display: grid; align-content: start; gap: 4px; padding: 12px; border: 1px solid #344144; }
  .probe-summary strong { color: #d2ff37; font: 700 28px 'Space Mono', monospace; }
  .probe-summary span { color: #93a19f; font: 9px 'Space Mono', monospace; text-transform: uppercase; }
  .rule-probes ol {
    display: grid; min-height: 0; grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px; overflow: auto;
  }
  .rule-probes li { display: flex; gap: 8px; padding: 8px; border: 1px solid #354346; }
  .rule-probes li > span { color: #d2ff37; font-weight: 700; }
  .rule-probes li div { display: grid; gap: 2px; }
  .rule-probes li strong { font: 700 9px 'Space Mono', monospace; }
  .rule-probes li small { color: #8d9b9c; font: 8px 'Space Mono', monospace; }

  @media (max-width: 720px) {
    details[open] .catalog-body { inset: 58px 7px 7px; }
    .catalog-body { padding: 10px; }
    .catalog-body > header { display: grid; }
    header dl { width: 100%; justify-content: space-between; }
    .face-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .face-facts, .rule-probes { grid-template-columns: 1fr; }
    .rule-probes { grid-template-rows: auto minmax(0, 1fr); }
    .course-catalog { grid-template-columns: 1fr; grid-template-rows: 180px minmax(0, 1fr); }
    .course-catalog.race-focus { grid-template-rows: minmax(0, 1fr); }
    .rule-probes ol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rule-probes li { gap: 4px; padding: 5px; }
    .rule-probes li strong { font-size: 7px; }
    .rule-probes li small { font-size: 6px; }
    .compiled-course { max-height: 300px; }
  }
</style>
