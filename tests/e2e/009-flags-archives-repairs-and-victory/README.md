# Finish a race through flags, archives, repairs, and rematch

Two real clients play ten deterministic turns. Ada archives on a repair site, touches all three flags in order, wins from ordinary Program submissions, retains an immutable summary, and starts a fresh race epoch.

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

## The host starts a fresh epoch without mutating the retained summary

![The host starts a fresh epoch without mutating the retained summary](./screenshots/003-rematch-starts-new-epoch-desktop.png)

**Verifications:**

- [x] Both clients receive a fresh Turn 1 hand
- [x] The completed race remains counted as an immutable prior summary
