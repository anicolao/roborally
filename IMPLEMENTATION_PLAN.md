# Robo Rally implementation plan

## Objective

Build the complete **2005 Avalon Hill edition** as a realtime browser game for
two to eight players. The sibling `rebelprincess` and `jaipur` projects are the
implementation model: every gameplay commit starts with a real browser action,
crosses the actual client, deterministic reducer, Firebase emulator, and
rendering layers, and ends in a user-visible result verified by Playwright.

The initial edition ID is `avalon-hill-2005`. The engine must not blend in
mechanics from the 2016, 2021, 2023, or 30th Anniversary releases. Edition
history and source links are recorded in [EDITIONS.md](EDITIONS.md); the
implementation rules are summarized in [RULES.md](RULES.md).
The executable browser-test contract is defined in
[E2E_GUIDE.md](E2E_GUIDE.md).

This milestone is documentation-only. The first implementation slice establishes
the complete development and deployment contract. Later editions can be added
only behind explicit, versioned rules and component manifests.

## Non-negotiable commit contract

Every implementation commit must contain one smallest coherent user-facing
capability and all of its supporting work:

1. event schema, edition/course manifests, and deterministic reducer changes;
2. append-only replay and Firestore Rules coverage;
3. accessible UI at every affected viewport;
4. a tracer-bullet E2E step or scenario through the real UI and emulators;
5. semantic assertions, zero-pixel screenshots, and a generated walkthrough;
6. pure rules tests for edge cases that E2E cannot cover exhaustively; and
7. documentation updates for changed protocols, sources, or invariants.

Do not land a simulation with no product path, a board UI backed by mock state,
or multiplayer behavior without browser proof. Refactors preserve the full E2E
suite. Unreviewed transcriptions stay in explicitly named development fixtures
and cannot appear as official content.

The first slice adds repository-managed verification and Git hooks. From that
point, every commit and push runs the equivalent of:

```sh
nix develop --command bun run check
nix develop --command bun run test:unit
nix develop --command bun run test:rules
nix develop --command bun run test:e2e -- <changed-scenario>
nix develop --command bun run test:e2e
nix develop --command bun run build
nix develop --command git diff --check
```

Do not bypass the verifier with `--no-verify`.

## Fixed technical decisions

- SvelteKit with `@sveltejs/adapter-static`, TypeScript, and Bun.
- Nix is always available and is the mandatory entry point for every local and
  CI tooling or development command. Invoke Bun, Firebase, Playwright,
  TypeScript, formatters, linters, Git tooling, and repository scripts only as
  `nix develop --command <tool> ...`; never rely on host-installed versions.
- Firebase anonymous Authentication and the Cloud Firestore browser SDK.
- One canonical append-only stream at
  `games/{gameId}/events/{eventId}`; no mutable game-state document.
- Authenticated room members can read the entire stream. Security Rules enforce
  identity attribution and immutability, not move legality or secrecy.
- Each event contains `type`, `payload`, `actorUid`, `clientSeq`, `createdAt`,
  `schemaVersion`, and `reducerVersion`.
- Event IDs use `{actorUid}-{zero-padded clientSeq}`. Server timestamp followed
  by document ID supplies a deterministic total order and idempotent retry.
- Setup, Program shuffles, Option shuffles, random timeout fills, and random
  course effects use committed seeds and a versioned PRNG.
- Persist stable edition, course, board instance, cell, robot, Program card,
  Option card, player, turn, register, and effect IDs—never display text.
- Canonical state is a deterministic projection of the event stream. Invalid,
  stale, duplicate, or incompatible events produce diagnostics and never
  partially mutate state.
- Resolution animations are derived presentation. Reloading mid-animation must
  render the same resolved projection immediately.
- Original art and accessible semantics are separate; no rule depends on image
  pixels.

The trusted-client boundary is deliberate. A modified client can inspect dealt
hands and submitted programs in readable events. The ordinary UI masks private
information, while Firestore Rules prevent impersonation, mutation, and
deletion. Cryptographic hidden information and server-authoritative play are
outside this first implementation.

## Source-data gates

The 2005 rulebook describes behavior, but much of the exact game data lives on
physical boards and cards. Implementation begins with reviewed manifests:

| Manifest | Completion gate |
| --- | --- |
| Program deck | All 84 physical cards, stable IDs, action, exact numeric priority, and left/right direction verified. |
| Option deck | All 26 physical cards, counts, exact text, timing, choices, duration, discard behavior, and interactions verified. |
| Factory boards | All eight 12×12 faces with every wall edge and board element independently checked. |
| Docking Bay | Both faces, Dock cells, connection edge, and printed features checked. |
| Courses | All 34 diagrams, player counts, board placements/rotations, flags, teams, and special rules checked. |

Every manifest carries `sourceEdition`, `manifestVersion`, provenance notes, and
review status. A golden rendered image and a coordinate listing must agree with
the source before a board or course leaves development status. Two reviewers or
two independent transcription passes should agree on card data.

The first narrow data target is the Program deck plus the Exchange board,
required Docking Bay face, and Risky Exchange course. Option behavior remains
disabled until the complete Option manifest is reviewed.

## Deterministic domain model

### Edition and race configuration

`RaceConfig` contains:

- `editionId: "avalon-hill-2005"`;
- exact reducer, PRNG, Program-deck, Option-deck, board, and course versions;
- course ID;
- initial seed;
- two through eight seated players;
- three lives, or the explicit published four-life option for five or more
  players;
- empty expansion and house-rule ID lists by default; and
- team assignments only for a published team course.

Replaying a race must stop with a clear incompatible-version diagnostic if any
referenced manifest is missing. It must never substitute a current manifest for
an older saved one.

### Board geometry

Use integer world coordinates and cardinal facings. A course manifest places
each board instance at an origin and quarter-turn rotation, then projects local
12×12 cells into world space. Walls are undirected edges between cells, not cell
contents.

Each cell can contain terrain and zero or more compatible elements:

- pit;
- normal or express conveyor direction and optional curve rotation;
- pusher direction and active register set;
- clockwise or counterclockwise gear;
- board-laser emitter, direction, and beam count;
- single-wrench repair site;
- crossed wrench/hammer repair-and-Option site; and
- course overlays such as numbered flags.

Course boundaries distinguish connected board edges from edges that destroy a
robot. Board art is rendered from the same semantic manifest used by the
reducer.

### Card zones and conservation

Each Program card instance is always in exactly one zone:

```text
available draw pile
player hand
unlocked register
locked register
current-turn discard
```

At turn start, all cards except locked-register cards become available, then
the available set is deterministically shuffled. Deal round-robin in original
Dock order. Current hands and register assignments retain card IDs, so every
prefix of the event stream can prove conservation.

The Option deck has draw pile, face-up ownership, and face-up discard zones.
Its precise exhaustion behavior must come from the reviewed cards/rule source;
do not invent a reshuffle.

### Robot state

Each robot records:

- owner and original Dock number;
- board cell or destroyed/eliminated state;
- facing;
- next required flag and touched flags;
- archive cell;
- remaining Lives and current Damage;
- five registers with card ID and lock state;
- powered-down state and next-turn announcement;
- owned face-up Options;
- destruction order within the current turn; and
- pending re-entry choice, if any.

There are no virtual robots in this edition.

## Turn state machine

The reducer projects one exact phase:

```text
continue-power-down decisions
  -> begin power downs and clear their damage
  -> shuffle/deal
  -> simultaneous programming
  -> next-turn power-down announcements
  -> register 1
  -> register 2
  -> register 3
  -> register 4
  -> register 5
  -> repair / Option draws / wipe registers
  -> re-entry choices
  -> next turn or finished
```

Each register resolves deterministic microsteps:

```text
reveal
  -> Program cards, descending unique priority
  -> express conveyors
  -> express plus normal conveyors
  -> active pushers
  -> gears
  -> board and robot lasers with Option modifications
  -> flags and archive updates
```

Most microsteps need no Firestore event. Once all required players submit or
respond, the reducer advances until it reaches a true player choice, a timer
deadline, a win, or the next simultaneous barrier. Animation frames derive from
that resolution trace and are never canonical events.

### Movement solvers

Implement pure, independently tested solvers for:

- cardinal stepping across rotated board seams;
- Move 1/2/3 stepwise movement and Back Up;
- chained robot displacement;
- wall-blocked push transactions;
- immediate pit and off-course destruction;
- simultaneous conveyor intents, conflicts, occupancy dependencies, and curve
  rotation;
- pusher activation and displacement;
- gear rotation;
- laser ray casting through walls and robots; and
- legal archive re-entry cells and facings.

For a conveyor substep, compute all intents from the same state, reject
converging destinations and unresolved dependencies, then apply accepted moves
atomically. This implements the published “do not move either robot” fallback
without depending on iteration order.

### Damage and locked-register invariants

Damage zero through nine yields hand sizes nine through zero. Damage five locks
register 5; subsequent damage locks registers 4, 3, 2, then 1. Ten damage
destroys the robot.

The reducer must enforce:

- exactly five total programmed-or-locked registers for an active robot;
- locked cards stay out of every shuffle;
- repairs unlock register 1 toward register 5 as damage falls from nine toward
  four, discarding the newly unlocked card;
- powered-down lock creation draws the next undealt Program card immediately;
- a fully locked robot repeats its stored program; and
- no destroyed or eliminated robot executes later microsteps.

### Pending choices

Resolution pauses with one `pendingEffect` only when a rule needs player input:

- whether a previously powered-down robot remains down;
- power-down announcement when Dock-order knowledge matters;
- immediate Option use or target;
- discarding an Option to prevent one damage;
- choosing the Option lost on destruction;
- re-entry cell and facing;
- whether an announced, destroyed robot re-enters powered down; or
- a course-specific decision.

Each pending effect records an ID, timing window, authorized actor, source,
legal choices, Dock-order position, and default if the published rule permits
one. Only a matching `effect/chosen` resumes. Stale or unauthorized choices
produce a diagnostic.

## Event vocabulary

The initial stable vocabulary should stay small:

| Event | Purpose |
| --- | --- |
| `game/created` | Establish room, host, protocol versions, and game ID. |
| `player/joined` | Claim the next clockwise seat and an unused robot identity. |
| `player/ready` | Confirm readiness for the current configuration. |
| `race/configured` | Commit edition, course, variants, manifest versions, and setup seed. |
| `program/submitted` | Commit exact cards in every open register and declare done. |
| `program/timed-out` | Claim an elapsed canonical deadline; reducer performs the seeded random fill. |
| `power-down/responded` | Announce or decline next-turn power down in the active decision window. |
| `effect/chosen` | Answer one reducer-projected Option, re-entry, or other finite choice. |
| `game/rematched` | Begin a fresh race epoch with the same room members. |

Dock assignment, card deals, robot movement, damage, repairs, Option draws,
destruction, flags, and victory are derived and must not have redundant
“result” events that can contradict their causes.

`race/configured` commits a seed, not pre-shuffled arrays. Setup derives the
first player, clockwise Dock numbers, initial robot/archive positions, Program
shuffle, Option shuffle, and course geometry.

If configuration can be edited in the lobby, a later `race/configured` replaces
the projected proposal only before every player is ready. Any change invalidates
prior ready events. The first complete readiness barrier starts the race.

## Programming concurrency and timer

Programming is simultaneous in product behavior but totally ordered in the
event log. Each active player may have one accepted submission. Once submitted,
the 2005 rules do not permit inspection, rearrangement, or retraction.

When all but one active programmer have submitted, the accepted event's server
timestamp establishes a 30-second deadline. If only one robot is programming,
the deal projection establishes the deadline. After it expires, any connected
client may append `program/timed-out`; the reducer checks the deadline and uses
the versioned PRNG to fill open registers from that player's remaining hand.
Network arrival order cannot select the cards.

Tests use an injectable clock and explicit emulator timestamps, never sleeps.
The UI announces the deadline accessibly and tolerates server-timestamp
resolution before beginning its visual countdown.

Opponent submissions display face down until their register is revealed. The
documentation and room UI must state that this is social, trusted-client
secrecy rather than a security guarantee.

## E2E scenario map

Each numbered scenario owns its spec, generated `README.md`, and screenshot
directory. Multiplayer cases use one isolated browser context per player and
the real Firebase emulator. Assert the actor view and at least one observer
view before capturing.

```text
001-app-shell-and-deployment
002-create-join-and-replay-room
003-configure-risky-exchange
004-shared-deck-deal-and-program
005-program-priority-movement-and-walls
006-pushing-destruction-lives-and-reentry
007-conveyors-pushers-and-gears
008-lasers-damage-and-locked-registers
009-flags-archives-repairs-and-victory
010-power-down
011-option-card-framework
012-all-option-cards
013-complete-risky-exchange-race
014-all-board-faces-and-beginner-courses
015-expert-and-team-course-catalog
016-reconnect-timers-conflicts-and-versioning
017-responsive-accessible-complete-race
```

Focused child scenarios may extend this map. Every Option card and every
special course rule needs visible browser proof or an explicit passive
non-activation proof, plus exhaustive pure fixtures.

## Implementation sequence

Each item ends in at least one commit satisfying the commit contract. Split a
large item into smaller vertical tracers, not disconnected model/UI/test
commits.

### 1. Application shell, harness, CI, and preview

**Status:** Implemented as the first vertical tracer.

- Scaffold static SvelteKit, Firebase initialization, local fonts, accessible
  shell, and installable metadata.
- Add Vitest, Playwright, Firebase emulators, deterministic Chromium settings,
  zero-pixel screenshots, and walkthrough generation.
- Add Firestore Rules tests for authenticated room reads, own-UID immutable
  event creates, and denial of updates, deletes, and unrelated paths.
- Add repository verifier, hooks, locked Nix/Bun toolchain, and
  `001-app-shell-and-deployment`.
- Add the retained GitHub Pages preview workflow described below.

### 2. Identity, two-to-eight-player rooms, and immutable replay

**Status:** Implemented as the second vertical tracer.

- Sign in anonymously and expose deterministic emulator identities in E2E.
- Implement room codes, create/join links, names, two to eight seats, robot
  uniqueness, event ordering, retries, subscriptions, and replay diagnostics.
- Add `002-create-join-and-replay-room` with multiple contexts, reload,
  unavailable robots, and a full room.

### 3. Reviewed 2005 setup and Risky Exchange

**Status:** Implemented as the third vertical tracer.

- Transcribe and review the 84-card Program manifest, Exchange board, required
  Docking Bay face, and Risky Exchange diagram.
- Implement edition/course versions, seeded first player, original Dock order,
  three/four-Life setup, and automatic facing toward the factory.
- Render semantic geometry with pan, zoom, fit-to-course, robot facing, flags,
  archives, and a text equivalent.
- Add `003-configure-risky-exchange` with a fixed seed and exact golden setup.

### 4. Shared-deck deal, hidden programs, and timer

**Status:** Implemented as the fourth vertical tracer.

- Implement available-card shuffle, round-robin dealing, damage-dependent hand
  size foundation, five register slots, locked-card conservation, submission,
  reveal barriers, and cleanup zones.
- Implement canonical 30-second deadlines and seeded timeout fill.
- Provide non-authoritative path previews that clearly exclude robot
  interference and unrevealed board outcomes.
- Add `004-shared-deck-deal-and-program`, proving exact conservation, ordinary
  UI masking, submission immutability, and timeout behavior.

### 5. Priority movement, rotation, and walls

**Status:** Implemented as the fifth vertical tracer.

- Execute all seven instruction classes and all 84 unique priorities across
  five registers.
- Implement stepwise Move 2/3, Back Up, rotations, walls, course seams, and
  round transition.
- Animate reducer microsteps with reduced-motion support and an accessible
  textual resolution feed.
- Add `005-program-priority-movement-and-walls`.

### 6. Pushing, pits, edges, destruction, and re-entry

**Status:** Implemented as the sixth vertical tracer.

- Implement push chains, transactional wall blocking, pits, off-course
  destruction, Option-loss placeholder, Lives, elimination, and destruction
  order.
- Implement archive-cell and adjacent-cell re-entry, line-of-sight restriction,
  facing choices, and two re-entry damage.
- Add `006-pushing-destruction-lives-and-reentry` from ordinary programs,
  including two robots sharing one archive.

### 7. Board elements

**Status:** Implemented as the seventh vertical tracer.

- Implement atomic express and normal conveyors, curves, convergence and
  occupancy conflicts, register-numbered pushers, and gears.
- Add geometry and movement fixtures for every such element on Exchange and
  the selected Docking Bay.
- Add `007-conveyors-pushers-and-gears`, including an express-to-normal curve
  and an ambiguous conveyor collision that leaves both robots still.

The reviewed Exchange and Docking Bay A manifests contain no curved conveyors
and no pushers. Scenario 007 therefore proves the printed straight
express-to-normal handoff, gear activation, and ambiguous occupancy fallback
through ordinary play, while exhaustive semantic fixtures prove both curve
directions and register-gated pushers without inventing course geometry.

### 8. Lasers, damage, and locked registers

**Status:** Implemented as the eighth vertical tracer.

- Implement board beams, robot line of sight, walls/robot blocking, one
  post-board-element targeting snapshot for unmodified base lasers, and
  per-hit damage.
- Complete the entire damage table, locked-card retention, repeated programs,
  repair-unlock ordering foundation, powered-down random locks, and tenth-damage
  destruction.
- Add `008-lasers-damage-and-locked-registers`, proving owner/observer views,
  locked-card conservation, and a fully locked repeated program.

Scenario 008 reaches six damage through ordinary simultaneous robot fire and
proves public owner/observer lock state. Exhaustive reducer fixtures cover
board-beam blocking, the entire damage/lock table, exact locked-card retention,
tenth-damage destruction, and execution of a fully locked five-card Program;
the later complete-race tracer will exercise that repetition across live turns.

### 9. Flags, archives, repairs, and victory

**Status:** Implemented as the ninth vertical tracer.

- Add ordered flag progress, per-register archive updates, single-wrench
  repair, crossed-site repair, and the Option-draw placeholder.
- Add terminal winner and optional runners-up mode, immutable summary, and
  rematch epoch.
- Add `009-flags-archives-repairs-and-victory`.

Scenario 009 plays ten ordinary, immutable turns through both browser clients:
it archives on a repair site, reaches all three flags in order, pauses for an
owner-authored re-entry, publishes a frozen winner summary, and begins rematch
epoch 2 while retaining epoch 1. Pure fixtures cover out-of-order flags,
same-checkpoint runners-up, crossed-site Option placeholders, and exact
register-1-to-register-5 repair unlock order.

### 10. Complete power down

**Status:** Implemented as the tenth vertical tracer.

- Add next-turn announcements in original Dock order, beginning-of-turn damage
  removal, skipped programming, continued board vulnerability, consecutive
  power downs, and destroyed-announcer re-entry decisions.
- Exercise damage and new register locks acquired while powered down.
- Add `010-power-down`.

Scenario 010 plays eight ordinary turns through two browser clients. A damaged
robot announces after the earlier eligible Docks are skipped, powers down for
two consecutive turns, clears its prior damage and lock state at each start,
skips Programs and robot fire, takes five board-laser hits per turn, receives
an exact top-card register lock from each turn's shared deck, and powers up with
the second lock retained. The same slice makes eligible power-down responses a
strict replay barrier and covers the destroyed-announcer re-entry decision with
focused reducer and room-protocol fixtures.

### 11. Option framework

**Status:** Implemented as the eleventh vertical tracer.

- Finish and review the complete 26-card manifest before enabling draws.
- Add face-up draws/ownership/discards, Dock-order decision windows, one-Option
  damage prevention, Option loss on destruction, and general effect targeting.
- Specify finite timing windows for any tabletop phrase that depends on live
  interruption; never use animation duration or network race as a rules clock.
- Add `011-option-card-framework` with concurrent choices and deterministic
  order.

Scenario 011 plays five ordinary turns in two browser contexts. Both robots
reach the crossed repair site on successive turns, expose two without-
replacement draws, then close the next shared Option plan in original Dock
order. The same slice replaces the transcription placeholder with a versioned
26-card deck, face-up ownership/discards, immutable finite choices, one-card
damage prevention, and mandatory destruction loss before re-entry.

### 12. Every Option card

**Status:** Implemented as the twelfth vertical tracer.

- Implement each card's movement, weapon, priority, damage, persistent, and
  discard effects strictly from the reviewed 2005 card text.
- Cover interactions between Options, ordinary lasers, pushing, destruction,
  repair sites, power down, and course variants.
- Extend `012-all-option-cards` until every card has visible proof and focused
  pure fixtures.

Scenario 012 inspects all 26 edition-specific cards from the in-product
manifest. An exhaustive keyed fixture executes every active behavior and
explicit non-activation cases, while integration fixtures cover Extra Memory,
movement modifiers, factory rotation immunity, armor, doubled/rear/penetrating
lasers, Mechanical Arm flag reach, Circuit Breaker shutdown, and Superior
Archive Copy re-entry. Scenario 011 supplies the real multiplayer ownership and
decision proof.

### 13. Complete Risky Exchange race

**Status:** Implemented as the thirteenth vertical tracer.

- Play a production-size race through repeated turns, collisions, damage,
  power down, Options, all three flags, winner, summary, and rematch.
- Drive `013-complete-risky-exchange-race` entirely through ordinary UI actions
  in real browser clients without reducer shortcuts.

Scenario 013 plays twelve deterministic turns through two ordinary browser
clients. Ada carries a face-up Option, reaches Flags 1 and 2, announces a
shutdown in original Dock order, is destroyed by the live factory while powered
down, discards the Option, re-enters through the owner-authored decision window,
and reaches Flag 3. The tracer then verifies the immutable winner summary and a
retained-summary rematch; its Program sequence was found against the same pure
event replay used by the product and is executed only through visible controls.

### 14. All board faces and beginner courses

**Status:** Implemented as the fourteenth vertical tracer.

- Transcribe and review Island, Chop Shop, Spin Zone, Maelstrom, Chess, Cross,
  and Vault plus the second Docking Bay face.
- Encode all ten beginner course diagrams and metadata.
- Add course previews and `014-all-board-faces-and-beginner-courses`, with
  golden geometry for every face and one complete representative race on a
  multi-board course.

All eight 12×12 faces and both Docking Bay faces are pinned by semantic hashes.
The ten beginner diagrams use explicit printed transforms and flag cells.
Scenario 014 selects every face and beginner course, then compiles Around the
World and completes a safe ordered route from Dock 1 through Flags 1–3 across
both factory faces.

### 15. Expert and team catalog

**Status:** Implemented as the fifteenth vertical tracer.

- Encode all 19 expert and five team courses.
- Implement each published exception, including timed programming, moving
  flags, altered laser damage, Option/repair changes, disabled power down,
  multiple controlled robots, SuperBot, teams, duplicated virtual board
  instances, and alternative victory conditions.
- Add `015-expert-and-team-course-catalog` and focused scenarios for every
  special rule. Do not generalize a special rule from its title.

The 19 expert and five team diagrams are explicit reviewed fixtures, including
duplicated physical-face instances and nonstandard Docking Bay placement.
Fourteen named reducer probes execute every exception family, and scenario 015
selects all 34 entries before asserting every probe in the ordinary catalog UI.

### 16. Reconnect, conflicts, timers, and versions

**Status:** Implemented as the sixteenth vertical tracer.

- Rehydrate from cache plus cursor and replay from scratch.
- Handle retries, duplicate IDs, stale submissions, simultaneous barriers,
  timeout claims, network loss, re-entry interrupts, and incompatible
  manifests or reducer versions.
- Add `016-reconnect-timers-conflicts-and-versioning`, proving convergence when
  clients disconnect during programming and pending resolution.

Scenario 016 disconnects one real browser after its Program is server-confirmed
and lets the connected peer close the simultaneous barrier. The offline client
retains its versioned prefix, then catches up from the ordered Firestore cursor,
reloads from cache, and completes owner-authored re-entry in destruction order.
Focused fixtures prove cache invalidation, pending-timestamp handling,
idempotent page merging, deterministic timestamp ties, incompatible versions,
and recovery after a domain-invalid event consumes its actor sequence.

### 17. Responsive and accessibility completion

**Status:** Implemented as the seventeenth and final vertical tracer.

- Finish keyboard and touch register ordering, focus flow, board navigation,
  live resolution announcements, non-color cues, reduced motion, safe areas,
  countdown alternatives, and reconnection affordances.
- Keep board, hand, registers, player state, and decisions usable at phone
  portrait/landscape, tablet, and desktop sizes.
- Add `017-responsive-accessible-complete-race` and audit every earlier
  baseline.

Scenario 017 repeats the production twelve-turn race in ordinary two-client
browser sessions at phone portrait, phone landscape, tablet, and desktop
viewports. It proves focus transfer into programming, arrow-key semantic board
navigation, keyboard and pointer register reordering, a textual countdown,
non-color submission cues, polite resolution announcements, reduced motion,
safe-area-aware layouts, and the same immutable Flag 3 winner at every size.
All earlier E2E baselines remain covered by the repository-wide verifier.

## Testing strategy

Maintain:

- golden manifest tests for all 84 Program cards and 26 Options;
- golden board tests for every cell, edge, and element;
- golden course tests for board transforms, flags, and special rules;
- table tests for priorities, stepwise movement, and every Option effect;
- push-chain and line-of-sight tests across walls, seams, pits, and edges;
- atomic conveyor conflict and dependency property tests;
- Program-card conservation tests across deals, locks, repairs, power down, and
  destruction;
- state invariants for at most one robot per cell and legal archive placements;
- event-prefix and cache-plus-cursor replay equivalence;
- PRNG golden vectors and version-mismatch rejection;
- visibility selectors for each player's private hand and program;
- injected-clock timer tests with no real-time sleeping; and
- Firestore emulator tests for the exact trusted-client boundary.

Pure tests supplement rather than replace browser tracers.

## GitHub Pages preview design

The first slice adds `.github/workflows/ci-and-deploy.yml`, following the
sibling games' retained-preview approach:

1. check out the exact head SHA;
2. install Nix, then run every remaining tooling command through the locked
   `nix develop` environment;
3. install frozen Bun dependencies and pinned Playwright Chromium through that
   environment;
4. run check, unit, Rules, full E2E, and build verification;
5. build at `/roborally/pr<PR number>` for same-repository PRs or `/roborally`
   for `main`;
6. publish `build/` to the matching retained directory on `gh-pages`;
7. create or update one PR comment linking the preview; and
8. use per-ref deployment concurrency with cancellation.

Production Firebase browser configuration is provided through Actions secrets.
It is public client configuration, not an authorization secret. Never expose
deployment credentials to fork or Dependabot code, and never use
`pull_request_target` to build untrusted code.

The app applies its computed base path to assets, navigation, manifest URLs, and
service-worker scope. Main deployment preserves retained PR directories.

## Asset plan

Create an original visual system for:

- eight distinct robot identities and four cardinal facings;
- all terrain, walls, conveyors, pushers, gears, lasers, and repair symbols;
- seven Program instruction classes with prominent numeric priority;
- registers, shared draw/discard zones, Damage, Lives, power down, flags,
  archives, and Options;
- course previews and board backgrounds; and
- movement, pushing, conveyance, rotation, laser, damage, locking, destruction,
  re-entry, repair, and victory feedback.

Official materials guide inventory and information hierarchy, but do not copy
the logo, illustrations, robot sculpts, board art, card frames, or trade dress.
Rules-critical names, priorities, directions, and status remain accessible HTML
backed by versioned manifests.

## Definition of complete

The 2005 implementation is complete when:

- all 84 Program cards, 26 Option cards, eight board faces, two Docking Bay
  faces, and 34 courses have reviewed versioned manifests;
- every base rule, Option, and course exception has deterministic reducer
  behavior and focused tests;
- two through eight clients converge through retries, reloads, timing windows,
  and disconnects;
- every tracer passes against real Firebase emulators with zero pixel
  differences;
- production Firestore Rules match their boundary tests;
- a complete race is keyboard- and touch-playable at every target viewport;
  and
- the exact commit is playable at both its retained PR preview and production
  GitHub Pages URL.

Support for another edition begins only after this definition is met or through
a separately approved, explicitly versioned implementation track.
