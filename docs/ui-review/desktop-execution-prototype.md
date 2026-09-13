# Desktop execution column prototype

The movement banner and countdown covered the board just when players needed to
watch it. The right column repeated submitted Programs above the graphical player
cards, while move history required opening a disclosure and scrolling away from
play.

This prototype keeps the existing board allocation and uses the top of the right
column for execution. The current register, actor, instruction and priority wrap
within that panel. The countdown appears there too, leaving the board visible.
Below the current step, an always-open turn log accumulates the frames already
shown. It reveals no future moves during the countdown. At completion, the log
includes cleanup and subsequent decisions from the resolved turn.

The log follows new entries while the reader is at the latest move. Scrolling
back pauses that following; “Latest” returns to the live end. An “Earlier moves”
cue indicates entries above the viewport. The log is keyboard-scrollable.

Player cards and decisions occupy the remaining column. Redundant submitted
Program controls, opponent summaries and the duplicate execution heading are
hidden during resolution; the shared graphical player cards retain the revealed
registers. The older history disclosure is replaced by the same always-open log on smaller
screens. The duplicate recent-move list is removed. Rules and race details
remain available.

Scrolling is still allowed. A small strip above the controls indicates when the
reader has scrolled and offers “Back to top” and “More below” only when those
actions apply. These controls and the execution panel remain visible while the
player-card area scrolls. This avoids controls overlaying either the board or
other buttons.

## Scope and tradeoffs

- The new arrangement applies above 1000px width and 560px height. Phone, tablet
  and short landscape layouts keep their existing board arrangement, with an
  always-open log in the controls. Tabletop is unchanged.
- The execution area uses 180–260px of column height. Two-player desktop play
  needs less scrolling after redundant controls are removed. More players,
  shorter windows, expanded rules and long decision forms can still scroll.
- The log retains the current turn. Starting another turn replaces it with that
  turn's moves; this prototype does not introduce a whole-race archive.
- This is a layout prototype, not a change to playback timing or game rules.

## Review in play

1. Lock two Programs and watch the countdown and first register. Check that the
   board is unobstructed and the current step is easy to read beside it.
2. Watch several moves accumulate. Scroll the log back during playback, then use
   “Latest” to resume following.
3. Resize a desktop window to 1280 × 650. Use “More below” and “Back to top” in
   the controls; the execution panel should remain visible throughout.
4. Finish a turn, resolve a decision, and begin another. Check that active
   programming controls return and unrevealed registers stay masked.
5. Compare two-player and larger races. Decide whether the log's share of the
   column leaves enough space for player cards and decisions.

Scenario 005 exercises these behaviors through two real emulator-backed clients,
with a controlled playback clock. It checks countdown privacy, board separation,
accumulated history, keyboard history navigation and shorter-window scroll cues.
Its generated walkthrough includes countdown and execution screenshots.

## Prototype screenshots

- [Countdown beside the board](../../tests/e2e/005-program-priority-movement-and-walls/screenshots/000-countdown-beside-board-desktop.png)
- [Current instruction and running history](../../tests/e2e/005-program-priority-movement-and-walls/screenshots/001-execution-and-running-log-desktop.png)
- [Completed turn with player cards](../../tests/e2e/005-program-priority-movement-and-walls/screenshots/002-priority-movement-resolved-desktop.png)

## Local validation

The complete Nix `bun run verify:change` passes: static/scenario/workflow checks,
165 unit tests, 15 Firestore Rules tests, 112 browser cases (two intentional
skips), production build and whitespace validation. The 39 changed macOS images
were visually reviewed and then passed exact comparison with updates disabled.

## Board-clear dialogs

Option decisions, the Option catalog and owned-card inspection are positioned
within the web controls' bounds. On desktop this is the right column; on a phone
it is the controls area below the board. Long panels scroll within those bounds.
The Option inspector keeps its keyboard focus handling and Escape dismissal,
while its backdrop is transparent so the board remains readable. The shared
tabletop inspector retains its large-card presentation.

Scenario 011 checks that decision and inspection panels stay within the controls
and never overlap the board, including at 320px width. Scenario 026 adds the same
geometry checks for the catalog at all four responsive viewports. The PR's
validation section records the final local and Linux results.

The dialog and expanded-log follow-up also passes the complete local verifier
with the same test counts. Its 53 changed macOS screenshots were visually
reviewed, then compared with updates disabled. Linux baselines are generated by
the manual workflow and reviewed before the normal PR comparison run.
