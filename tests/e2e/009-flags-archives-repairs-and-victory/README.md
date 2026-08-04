# Finish a race through flags, archives, repairs, and rematch

Two real clients play ten deterministic turns. Ada archives on a repair site, touches all three flags in order, wins from ordinary Program submissions, and a separately authenticated tabletop creates a fresh rematch room that both connected controllers follow automatically.

## Register 5 reaches a repair site and moves the Archive before cleanup

![Register 5 reaches a repair site and moves the Archive before cleanup](./screenshots/000-repair-site-archives-at-cleanup-desktop.png)

**Verifications:**

- [x] The robot state exposes the new repair-site Archive
- [x] Repair happens once during cleanup, after the per-register Archive update

## Ordered flags persist while another robot completes owner-authored re-entry

![Ordered flags persist while another robot completes owner-authored re-entry](./screenshots/001-first-two-flags-and-reentry-desktop.png)

**Verifications:**

- [x] Ada has Flags 1 and 2 and archives on Flag 2
- [x] Grace re-enters with two damage and both clients converge

## Flag 3 ends the race with a shared immutable summary

![Flag 3 ends the race with a shared immutable summary](./screenshots/002-flag-three-wins-and-freezes-summary-desktop.png)

**Verifications:**

- [x] The final ordered flag ends resolution immediately
- [x] Owner and observer see the same winner summary

## The tabletop unmistakably announces the completed race

![The tabletop unmistakably announces the completed race](./screenshots/003-tabletop-announces-finished-race-desktop.png)

**Verifications:**

- [x] The winner overlay offers rematch configuration and a genuinely fresh game
- [x] The final player panel retains all three touched flags

## Rematch moves the retained racers and controllers to fresh configuration

![Rematch moves the retained racers and controllers to fresh configuration](./screenshots/004-rematch-starts-new-epoch-desktop.png)

**Verifications:**

- [x] The table can choose a new board before the next race
- [x] Both controllers follow the new room while their seats and the six open QR positions persist
