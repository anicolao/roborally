# Web and tabletop playability review

This change makes the course the primary web play surface and reuses the existing
tabletop card artwork and Option shelf. The intended improvement is less searching
between the board, the hand and the controls needed for the current turn.

## Findings and changes

| Finding | Change | Playability rationale |
| --- | --- | --- |
| Web play allocated roughly one third of desktop width to the board and two thirds to the console. | The console is capped at 380px; the board takes the remaining width. | More room to inspect walls, conveyors, flags and robot positions. |
| Web board cells stretched to fill a tall viewport, with a separate 480px width cap. | Web and tabletop now share aspect-ratio fitting, preserving square cells. Zoom, pan and keyboard inspection remain available in web play. | The same course has the same proportions in both modes. |
| Phone programming explicitly hid the board. | Portrait phones and tablets show the board above an independently scrolling console; landscape keeps them side by side. Course headings and view controls take less space. | Players can refer to the course without leaving programming. |
| Hands used `ProgramCardFace`, but chosen, damage-locked and submitted registers were text boxes. | The shared `ProgramEditor` renders square graphical card faces in all occupied registers, including Dual Processor pairs. | Movement direction and priority stay recognizable from hand to program to tabletop playback. Empty slots and lock status remain explicit text. |
| Recompile discard choices were text-only Option buttons. | The shared editor uses `OptionCardFace` with an explicit discard action. | These choices match the existing damage prevention and destruction discard cards. |
| Owned web Options displayed full cards inside each robot row. | Web uses the tabletop's measured icon shelf with overflow handling. A native modal dialog opens the complete card description. During a required Option decision the shelf is disabled, and the decision panel shows the relevant full card. | Public ownership stays visible without pushing turn controls down a long sidebar. Keyboard users can open, close with Escape, and return focus to the originating icon. |
| Setup order, seed/replay details and card conservation competed with programming. | These remain available under “Race details & connection.” | Useful reference information no longer leads the turn flow. |
| A verbose speculative preview sat before submission; recent moves and permanent board rules filled the resolution console. | “Program preview” and “Recent moves & board rules” disclose these on demand. The existing full trace remains available. | Pending decisions, robot state, deadlines, re-entry and next-turn controls receive more attention. |
| Tabletop decision rails could compete with the playback log in the same gutter, and the responding seat had no attention cue. Power choices had no tabletop waiting message. | Waiting rails replace the playback log while a decision is available. Both viewing directions name the responder and say “CHECK YOUR PHONE.” The responding seat has a steady gold glow and “YOUR DECISION” label, including between-turn power choices. | Everyone can see why play paused and which player needs to act. The cue clears or moves when the decision is answered; a steady glow avoids flashing. |

No new raster artwork is required. The existing program chassis, movement arrows,
rotation icons, Option chassis and all Option illustrations supply the visuals.
The private controller also sizes its hand rows to the height remaining after
graphical registers, keeping cards and submission controls inside the screen.
The public tabletop already used graphical playback cards and compact Option
icons, so its overall layout is retained. Its private `/hand` view benefits from
the shared register and Recompile changes.

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
phone board visibility, exact selected card identities and opponent masking.
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
vertical scrolling, and small boards still benefit from zoom and keyboard cell
inspection. Full Option rules require an explicit inspection action. These are
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

The complete `nix develop --command bun run verify:change` passed: 165 unit tests,
15 Firestore rules tests, 112 browser cases (two intentional skips), Svelte checks,
scenario-step validation, workflow lint and the production build. Changed macOS
captures were visually reviewed, including full-size responsive programming and
Option inspection screens.

The [Linux snapshot run](https://github.com/anicolao/roborally/actions/runs/34181189894)
also passed all 112 browser cases (two intentional skips), plus static checks,
unit and rules tests, and the production build. Its 240 changed platform-specific
captures were visually reviewed and committed separately. The normal PR workflow
compares against these reviewed baselines.

The first normal PR comparison subsequently found a 25-pixel difference at the
bottom of an Option icon after a required decision. This blocked the automatic
preview deployment. Disabled icons were changed to a muted border and background
instead of group opacity while investigating. Complete local verification and the
[follow-up Linux snapshot run](https://github.com/anicolao/roborally/actions/runs/34184099128)
passed. Three affected decision screenshots per platform were refreshed and
reviewed, but the 25-pixel difference persisted in normal sharded CI. Two independent
sharded runs produced byte-identical actual images, including the same icon edge;
the post-decision baseline therefore uses that visually reviewed CI artifact.
The disabled-style change did not establish opacity as the cause. The normal PR
comparison gates the preview deployment.

After the tabletop waiting update, complete local Nix verification passed again:
165 unit tests, 15 rules tests, 112 browser cases (two existing skips), static
checks and build. The [tabletop Linux snapshot run](https://github.com/anicolao/roborally/actions/runs/34190064518)
also passed. The new assertions check a single named, highlighted responder,
mutually exclusive waiting/playback rails, cleared attention after a response,
and power-choice handoffs throughout the twelve-turn tabletop race, including a
powered-down robot without a Program hand.
