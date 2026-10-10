# Published 2005 scenarios: review guide

The course browser already described 34 courses, but race setup offered only
Risky Exchange, Factory Rejects, and Option World. This change makes every
published course selectable and implements the setup and turn rules needed to
play the expert and team variants through the web, tabletop, and private phone
controllers.

The reference is the Avalon Hill 2005 course manual, printed pages 13–32,
included in the [2005 rulebook](https://desktopgames.com.ua/games/381/roborally_rules_en.pdf).
This is the 2005 edition, not the later editions' course collections.

## Courses included

| Group | Courses |
| --- | --- |
| Standard | Risky Exchange; Checkmate; Dizzy Dash; Island Hop; Chop Shop Challenge; Twister; Bloodbath Chess; Around the World; Death Trap; Pilgrimage; Vault Assault; Whirlwind Tour; Lost Bearings; Robot Stew; Oddest Sea; Against the Grain; Island King |
| Expert | Tricksy; Moving Targets; Set to Kill; Factory Rejects; Option World; Ball Lightning; Tight Collar; Day of the SuperBot; Interference; Flag Fry |
| Optional expert | Frenetic Factory; Marathon Madness |
| Team | Tandem Carnage; All for One or One for All?; Capture the Flag; Toggle Boggle; War Zone |

## What changes during play

- **Joining:** a private phone enables its seat claim only after sign-in and
  room synchronization, preventing a fast tap from silently doing nothing.
- **Layouts:** board orientations and flags were compared with all 20 course
  manual diagram pages. Several catalog previews had incorrect orientations;
  Around the World also had two flag coordinates wrong. Docked robots now face
  into the factory, including courses with a Docking Bay on the left or right.
- **Starting Options:** Tricksy privately offers three graphical Options and
  waits for everyone to keep one. Flag Fry, Marathon Madness, and War Zone deal
  their starting Option. Owned Options remain inspectable from controllers.
- **Programming clocks:** Ball Lightning gives everyone 30 seconds; Tight Collar
  gives everyone 60. Expiry fills empty registers from the remaining hand while
  preserving cards already placed. Interference starts its ordinary clock when
  only one owner is still programming, even if that owner has two unfinished hands.
- **Interference:** each owner switches between a racer and blocker with separate
  hands, drafts, programs, and execution decisions. Both robots have distinct
  board art and tabletop mats. Blockers cannot earn flag credit.
- **Changing boards:** Moving Targets carries flags on conveyors and retains
  attached Archives and earned flag credit. Frenetic Factory records seeded
  coin flips and board rotations without rotating robot or flag coordinates.
  Playback shows the changing board; re-entry uses its current orientation.
- **Combat:** Set to Kill doubles robot laser damage. Day of the SuperBot tracks
  the title, extra laser damage, flag eligibility, damage cleanup, and transfer
  to the last attacker. Factory Rejects retains its initial damage and prohibition
  on powering down.
- **Teams:** hosts can assign balanced teams. Tandem Carnage shares ordered flag
  progress; All for One awards a team win when one teammate finishes. War Zone
  wins by eliminating the opposing team's Lives. Toggle Boggle persists flag
  ownership and requires a full turn out after destruction.
- **Capture the Flag:** a seeded coin toss decides who chooses home turf, followed
  by team deployment in the back six rows. Robots carry and drop flags, defenders
  can send invaders home without costing a Life, and a team wins by bringing the
  enemy flag home at turn end. Re-entry exposes the legal home-board spaces.
- **Option World:** flag rewards occur at turn end, including a flag already
  visited, rather than only upon first earning ordered flag credit.

## Safari connection fix

Firebase initialization now uses the same workaround as Jaipur: desktop Safari
and iOS browsers disable Firestore Fetch Streams and use XHR. This addresses
delayed reads and listener updates described in
[Firebase issue #9789](https://github.com/firebase/firebase-js-sdk/issues/9789).
Other browsers retain Fetch Streams. This changes the client transport only;
it does not change saved games or Firestore rules. Existing tabs need a reload
after the preview deploys to pick up the fix.

## Compatibility

The corrected course catalog has a new manifest version. Existing Factory
Rejects rooms retain their original layout. Existing Option World rooms retain
their previous flag-award timing. Risky Exchange's established playable geometry
and existing reducer versions remain supported. Dynamic scenario state is
reconstructed from room events and copied into playback frames; it is not a
separate mutable server record.

## Review focus

1. Configure a small standard course and a large multi-board course; compare the
   board, Docking Bay orientation, and flags with the manual.
2. Try Tricksy on separate phones and confirm each owner sees only their own
   three starting choices in the ordinary UI.
3. Try Interference with two people. Switch hands after placing a card, inspect
   both robot mats on the table, and let the last owner's clock expire.
4. Try Capture the Flag with four people: choose teams and home turf, deploy,
   carry a flag, get pushed by a defender, and re-enter.
5. Watch Moving Targets and Frenetic Factory in playback. Check that the board
   and log describe the same current state, including after reloading.
6. Compare team labels and flag ownership colors at phone and tabletop sizes.

The new browser walkthrough in
[scenario 029](../tests/e2e/029-published-scenario-play/README.md) selects all 34
courses through real room controls, completes the special setup choices, checks
separate Interference hands and both published clocks, and executes a Moving
Targets turn. [Scenario 030](../tests/e2e/030-tabletop-scenario-controllers/README.md)
exercises the private-phone and tabletop setup paths. Pure tests cover the combinatorial special rules. This does not
amount to a complete multi-turn victory playthrough for every course; long team
matches and unusual combinations of Options remain useful manual review targets.

## Existing bug notes

The earlier resolved entries in `GUIDO_ALEX_BUG_LIST.md` and
`GUIDO_ALEX_BUG1.md` remain resolved. `GUIDO_ALEX_BUG2.md` still records the
power-down investigation, including zero ordinary damage with Fire Control
register locks. That investigation is outside this course expansion.

Temporary rulebook downloads and emulator backups are outside the repository;
the saved local emulator data is in `../roborally-dust`.

## Preview backend

The GitHub Pages preview deploys the client only. The included Firestore rules
add the published course IDs, starting-choice events, and owner-attributed
Interference robot IDs. A backend still using the previous rules rejects those
new actions; the rules must be deployed to the preview's Firebase project to
play the new scenarios there. Local emulators load the new rules automatically.
