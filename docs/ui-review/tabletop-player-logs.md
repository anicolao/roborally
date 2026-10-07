# Tabletop player mats and personal logs

The shared board was obscured by execution and decision overlays. Player mats
were difficult to read from different table edges, and the fixed log arrangement
did not correspond to the people actually playing.

## Changes and rationale

- Hide unused seats after the race starts. Keep square player mats snug against
  the left and right screen edges, leaving the center for the board.
- Orient corners toward the nearby long table edge and middle seats toward their
  short edge. A clockwise control animates each mat and its corresponding log.
- Show the robot in the existing mat header using the board's familiar marker
  appearance. Keep Options below registers so gaining Options cannot move them.
- Render graphical backs while programs are private. Reveal R1 for all players together during the countdown. After each register’s
  execution and factory motion, reveal the next register for everyone together.
  Keep past and current cards visible during decisions, including before-register
  Options; future registers remain face down. Fast replay follows the same sequence.
- Highlight only the executing register and mat in gold. Give the active robot a
  short visual cue before movement; retain the existing board marker appearance.
- Give each occupied seat its own log, collapsed by default. The collapsed view
  includes the complete current action or waiting prompt. Expanding it reveals
  history accumulated so far in the current turn. Logs align with their mat and
  use the available width to the board, including after rotation.
- Keep one polite screen-reader announcement for the current action. Respect
  reduced motion for rotation, card flips, log expansion and robot movement.

## Review and limitations

Review a complete turn, an Option decision, re-entry, and power choices from the
actual seating positions. Check touch accuracy, readability, and the distinction
between a reveal and execution. Compare two players with eight players and view
several Options on a single mat. The race-finish dialog and full Option inspector
still intentionally occupy the shared display.

Rotation and expanded/collapsed preferences are local to the current page and
reset on refresh. The shared tabletop layout targets large landscape displays;
phones should use the private controller or web play view. Logs retain the current turn, not an entire race archive.
Production playback remains two seconds per Program card and one per factory
stage, with accelerated manual replay. Emulator tests retain their faster timing;
the prototype-only slowdown has been removed.

## Bug report audit

| Report | Status in this branch |
| --- | --- |
| [BUG1: Scrambler](../../GUIDO_ALEX_BUG1.md) | Addressed before this layout change: displayed cards use effective playback frames via `programCardIdForPlayback`, with a regression test. Original submissions stay immutable. |
| [BUG2: power-down eligibility](../../GUIDO_ALEX_BUG2.md) | General failure was not reproduced. Ordinary damage and already-powered-down cases are covered. **Open:** zero ordinary damage with a retained Fire Control lock is still excluded by the eligibility predicate; needs a rules decision and focused test. **Open:** no advance notice while programming that a power decision will follow submission. |
| [GA-03–GA-09](../../GUIDO_ALEX_BUG_LIST.md) | Previously resolved: larger join QR codes, destroyed-robot removal, single-square re-entry preview, fast replay, mobile hand fitting, correct powered-down instructions, and a read-only submitted Program. Regression coverage is retained and adapted to the new layout. |

This PR does not change power-down rules. The two open BUG2 follow-ups are not
represented as fixed by the visual redesign.

## Files kept outside the repository

Board-art source experiments (`static/assets/board-tiles/previews`, about 38 MB)
and Finder metadata were moved intact to
`../roborally-dust/tabletop-cleanup-2026-10-06/`. The prior local emulator rooms
were exported to `../roborally-dust/tabletop-emulator-2026-10-06/` before testing.
They are local review material, not application dependencies. `.DS_Store` is now
ignored. The two bug reports and the generated card-back asset/provenance belong
in version control and are included.

## Rendering stability

The tabletop viewport clips rotation overflow without becoming scrollable;
otherwise an edge-card rotation could leave the entire 4K scene shifted by four
pixels. Card flips settle on untransformed faces rather than retaining nested
3D rotations, keeping small priority text crisp and screenshot rendering stable.
Screenshot tolerance remains zero.

## Validation

Scenario 020 covers simultaneous reveal, execution highlights and completed-turn
replay. Scenario 011 covers visible waiting ownership beside the board. Scenario
023 checks 4K Options. Scenario 024 follows a complete tabletop/private race.
New scenario 027 joins eight ordinary phone clients and checks independent logs,
rotation, register/Option ordering, reduced motion and alignment at 1280, 1920
and 3840 pixels. Generated walkthroughs and reviewed screenshots accompany the
implementation. Final local and CI results are recorded in the PR.

The complete local verifier passed on 2026-10-06: static/scenario/workflow
checks, 165 unit tests, 15 Firestore Rules tests, 113 browser cases (three
intentional skips), production build and whitespace validation. All 48 changed
or new macOS screenshots were visually reviewed and passed exact comparison.
The [Linux baseline workflow](https://github.com/anicolao/roborally/actions/runs/37489826877)
also passed all checks and the same browser cases. Its 48 changed/new Linux
screenshots were visually reviewed before committing. Normal PR CI compares
these baselines with updates disabled before deploying the preview.
