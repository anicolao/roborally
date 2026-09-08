# Web and tabletop playability review

This change makes the course the primary web play surface and reuses the existing
tabletop card artwork, player status cards and Option inspector. The intended improvement is less searching
between the board, the hand and the controls needed for the current turn.

## Findings and changes

| Finding | Change | Playability rationale |
| --- | --- | --- |
| Web play allocated roughly one third of desktop width to the board and two thirds to the console. | The console is capped at 380px; the board takes the remaining width. | More room to inspect walls, conveyors, flags and robot positions. |
| Web board cells stretched to fill a tall viewport, with a separate 480px width cap. | Web and tabletop now share aspect-ratio fitting, preserving square cells. The web board always fills its available rectangle at the largest scale that preserves the entire course. Zoom and pan controls are removed; keyboard cell inspection remains available. | The same course has the same proportions in both modes. |
| Phone programming explicitly hid the board. | Portrait phones and tablets show the board above an independently scrolling console; landscape keeps them side by side. The course name moves to the existing footer; the board has no heading, Board details disclosure, or view controls. | Players can refer to the course without leaving programming. |
| Hands used `ProgramCardFace`, but chosen, damage-locked and submitted registers were text boxes. | The shared `ProgramEditor` renders square graphical card faces in all occupied registers, including Dual Processor pairs. | Movement direction and priority stay recognizable from hand to program to tabletop playback. Empty slots and lock status remain explicit text. |
| Recompile discard choices were text-only Option buttons. | The shared editor uses `OptionCardFace` with an explicit discard action. | These choices match the existing damage prevention and destruction discard cards. |
| Owned web Options displayed full cards inside each robot row. | Web uses the tabletop's measured icon shelf with overflow handling. A native modal dialog opens the complete card description. During a required Option decision the shelf is disabled, and the decision panel shows the relevant full card. | Public ownership stays visible without pushing turn controls down a long sidebar. Keyboard users can open, close with Escape, and return focus to the originating icon. |
| Web robot status was a sentence of Life, damage, flag and power values. | `PlayerStatusCard` is extracted from tabletop and used by both views, including Life diamonds, ten damage boxes, flag circles, power indicators, Option icons, graphical registers and lock badges. Web keeps Archive coordinates and a screen-reader summary. | Players recognize the same state at a glance in either mode; unrevealed cards stay masked. The web board keeps its space while cards scroll in the console. |
| Web Option inspection had a separate small-card dialog with a large text close button. | Both views now use `OptionInventory` for the tabletop-style inspector: gold frame, full card, circular close button and illustrated selectors. Native modal focus handling, Escape and focus return work in both modes; compact card typography fits narrow phones. | The same Option has the same inspection interaction and appearance on web and tabletop. |
| Setup order, seed/replay details and card conservation competed with programming. | Seed, replay and conservation diagnostics are removed. “Race details” retains starting Lives, robot/flag counts and original Dock order. | Useful reference information no longer leads the turn flow. |
| A verbose speculative preview sat before submission; recent moves and permanent board rules filled the resolution console. | The redundant speculative preview is removed. “Recent moves & rules” and “Turn history” keep readable moves and useful rules available on demand, without microstep counts or fixture commentary. | Pending decisions, robot state, deadlines, re-entry and next-turn controls receive more attention. |
| Tabletop decision rails could compete with the playback log in the same gutter, and the responding seat had no attention cue. Power choices had no tabletop waiting message. | Waiting rails replace the playback log while a decision is available. Both viewing directions name the responder and say “CHECK YOUR PHONE.” The responding seat has a steady gold glow and “YOUR DECISION” label, including between-turn power choices. | Everyone can see why play paused and which player needs to act. The cue clears or moves when the decision is answered; a steady glow avoids flashing. |

No new raster artwork is required. The existing program chassis, movement arrows,
rotation icons, Option chassis and all Option illustrations supply the visuals.
The private controller also sizes its hand rows to the height remaining after
graphical registers, keeping cards and submission controls inside the screen.
The public tabletop already used graphical playback cards and compact Option
icons, so its overall layout is retained. The tabletop seat layout and waiting glow remain in the table page; its status
contents and inspector are shared with web play. Its private `/hand` view benefits from
the shared register and Recompile changes.

## Player-facing copy audit

The audit covered `/`, `/tt`, `/hand`, `/cards`, `/options`, `/boards`, individual
board pages, and shared card, course, programming and Option-inspection components.

| Surface | Removed or rewritten | Why |
| --- | --- | --- |
| Web header/footer | Compact brand, room/connection state and the course name during play (rules edition before a race); no visible build hash or infrastructure branding. | More vertical room for the board; connection problems remain visible. |
| Lobby and setup | No seed input, identity IDs, event totals, replay diagnostics, append-only explanation or readiness-barrier copy. | Players choose a course, Lives and readiness, not storage behavior. |
| Programming/results | “Lock program,” “Your program is locked,” and “Play again”; no conservation, epoch, microstep or speculative-preview diagnostics. | Labels describe what players can do and what happens next. |
| Tabletop and phone | Friendly connection/retry/save errors; no raw service errors or animation-recording details. Tabletop keeps named waiting rails and seat glow. | Players can identify a stalled connection or the person who must act. |
| Course catalog | No executable probes, geometry-auditor race, provenance, instance IDs or placement coordinates. Special rules use sentences. | The catalog helps players choose and learn courses. |
| Card/board galleries | No raster-proof, manifest, generated-layer, pixel-size or FITS/OVERFLOWS diagnostics. | The galleries serve as card and board references. |

Actual rules, priorities, register numbers, board coordinates, damage, Lives,
flag progress and readable move history remain: they help players make decisions.
Fixed browser-test deals use an emulator-only URL fixture. Cache/build/count
metadata remains in non-announced data attributes for verification; it is not
visible copy or accessible narration.

## Visual review

The before images are preserved from the original scenario 004 baselines. The
after links point to the same scenario and seeded state after the layout changes.

| Screen | Before | After |
| --- | --- | --- |
| Desktop programming | [Before](web-before-desktop.png) | [After](../../tests/e2e/004-shared-deck-deal-and-program/screenshots/000-opponent-program-masked-desktop.png) |
| Phone programming | [Before](web-before-phone.png) | [After](../../tests/e2e/004-shared-deck-deal-and-program/screenshots/000-opponent-program-masked-phone.png) |
| Tabletop waiting for a damage decision | [Before](https://github.com/anicolao/roborally/blob/bfde35d/tests/e2e/011-option-card-framework/screenshots/002-tabletop-identifies-damage-decision-desktop.png) | [After](../../tests/e2e/011-option-card-framework/screenshots/002-tabletop-identifies-damage-decision-desktop.png) |

[Scenario 026](../../tests/e2e/026-board-first-shared-cards/README.md) shows the
board, graphical selection and committed registers at phone, desktop, tablet and
phone landscape sizes. Its assertions check square cells, desktop board emphasis,
phone board visibility, the course title in the footer, a board viewport filling its
panel without redundant text, exact selected card identities and opponent masking.
Direct views: [phone](../../tests/e2e/026-board-first-shared-cards/screenshots/001-graphical-registers-phone.png),
[phone landscape](../../tests/e2e/026-board-first-shared-cards/screenshots/001-graphical-registers-mobile-landscape.png),
[tablet](../../tests/e2e/026-board-first-shared-cards/screenshots/001-graphical-registers-tablet.png),
and [desktop](../../tests/e2e/026-board-first-shared-cards/screenshots/001-graphical-registers-desktop.png).

[Scenario 011](../../tests/e2e/011-option-card-framework/README.md) also captures
the Option inspector at ordinary and 320px phone widths and verifies Escape/focus
return and complete, unclipped card text.

## Review during a real race

1. Program a turn while checking a nearby wall or conveyor. Can you read the board
   and distinguish Move 1/2/3, Back Up and rotation cards without opening reference
   material?
2. Replace a selected register and inspect a locked program. Does the repeated
   artwork help confirm the intended movement and priority?
3. Open an owned Option, read its effect, close it with Escape and make a decision.
   Are the compact icons recognizable enough, or would short names help?
4. Try phone portrait and landscape. Does keeping the board visible justify the
   additional scrolling in the programming panel?
5. Follow a destruction/re-entry and start the next turn. Confirm that the next
   required action is easier to find with the replay material collapsed.
6. On the tabletop, pause for an Option, damage, re-entry or power choice. From
   either side, confirm that the gutters name the responsible player, their seat
   is highlighted, and the message disappears or transfers after they respond.

The tabletop waiting message was not removed by the original web layout change:
`src/routes/tt/+page.svelte` was unchanged at that point. The follow-up makes the
decision and playback panels mutually exclusive, preventing the later-rendered
playback log from covering a decision at the same stacking level. Presentation
gating still prevents future decisions being announced before playback reaches
them. Power choices appear once the relevant program is submitted (or the robot
has no hand because it is powered down) and playback has settled. The shared
board remains unobscured between the gutter rails.

## Tradeoffs

The narrower console reduces hand-card size on desktop. Phone controls can require
vertical scrolling. Small boards retain accessible cell labels and keyboard cell inspection
for reading individual cells, but no longer support zoom or pan. The redundant Board details
disclosure is removed, and the course name occupies the existing footer so the board
uses the entire panel apart from its thin border and padding. Full Option rules require an explicit inspection action. These are
reviewable design choices; browser checks cannot establish that players prefer
them. Multi-board courses use the available space while preserving their aspect
ratio, so especially tall courses may still leave horizontal space unused.

## Remaining opportunities

The public tabletop remains organized around seats, while web play concentrates on
the local player. Common Life/damage/status rows and a shared Option decision panel
are useful next candidates for consolidation. The compact numeric opponent status
remains a summary; graphical registers are shown in the owner's editor and public
tabletop playback without revealing private programs early.

## Validation

The copy audit adds a regression check across screenshot steps and card/board
reference pages. Scenario 026 checks that the web board reaches the maximum fitted
width and height at phone, landscape, tablet and desktop sizes, with square cells
and no zoom/pan controls. Existing races continue to cover keyboard inspection,
card ordering, private hands, reconnect, Options, power decisions and tabletop
attention cues.

Verification also uncovered a screenshot-helper bug: replacing timer text nodes
could disconnect Svelte’s live countdown updates. Captures now preserve those
nodes, and both phone and desktop timeout scenarios pass without changing their
screenshots.

The complete `nix develop --command bun run verify:change` passed after this audit:
165 unit tests, 15 Firestore rules tests, 112 browser cases (two intentional skips),
Svelte/scenario/workflow checks and the production build. All 117 changed local
screenshots were visually reviewed. The timeout scenarios also passed separately
against their existing baselines after the screenshot-helper correction.

The [Linux snapshot run](https://github.com/anicolao/roborally/actions/runs/34194744549)
also passed all 112 browser cases (two intentional skips), static checks, unit and
rules tests, and the production build. All 117 changed Linux captures were
visually reviewed. The normal PR workflow compares these reviewed baselines
before publishing the preview.

The board-space refinement also passed the complete local verifier and the
[Linux run](https://github.com/anicolao/roborally/actions/runs/34222357055), including
all 112 browser cases on each platform. Its 87 changed screenshots per platform
were visually reviewed. Scenario 026 checks the footer course title and that the
board viewport fills its panel, apart from the border and padding, at all four
viewports. Scenario 003 checks accessible cell labels in place of the removed
Board details disclosure.

The shared player-card follow-up checks Life/damage/flag tracks and five graphical
registers in scenario 011. Existing damage-lock and tabletop scenarios cover
public lock badges and hidden future registers. Option inspection checks cover
readable rules at desktop, phone and 320px widths, Escape/focus return, and the
large card on a 4K tabletop. The tabletop inspector and web inspector now use the
same component rather than separate markup and styles.
