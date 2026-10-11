# Simple computer player

Hosts can use **Add computer** in the web lobby or tabletop course controls.
Each computer occupies an ordinary seat and automatically readies when the host
configures the race. The host must keep the browser that added the computers
open. Reloading that browser resumes control; moving to another browser cannot
recover its private computer identities.

## How it plays

The driver searches a bounded set of five-register programs using only its own
hand, current public position, and board. It favors reaching the next numbered
flag, then shortening the safe route to it. It simulates walls, pits, conveyors,
pushers, gears, and locked registers, and breaks ties deterministically. It
never consults another player's hand or unrevealed program.

This is a straightforward flag-seeker, not an expert opponent. It does not
predict other robots' movements, laser damage, future board rotations, or
advanced Option combinations. Team combat and Capture the Flag strategy are
not optimized. It declines voluntary execution Options, normally takes damage
instead of discarding an Option, picks a legal re-entry facing toward the next
flag, and stays powered up. Starting Option choices and Capture deployment are
automatic so those setups do not require an extra phone. Interference's two
robots are programmed separately.

## Persistence and permissions

Computers sign in under separate, persisted anonymous Firebase identities.
Their joins, readiness, programs, and decisions use the same events and security
rules as human players. The room records which host browser manages them;
rematches preserve that ownership. No Firestore-rule deployment is needed.
A disconnected or unavailable host pauses its computers; this is not a server
bot service. If control fails, the host gets a retry message.

## Review

1. Create a web race, add a computer, configure a course, and ready yourself.
   The computer should lock its program while you choose yours.
2. Add two computers from a tabletop, configure Risky Exchange, and watch
   several rounds. Reload the tabletop during a turn; both should continue.
3. Try a wall or conveyor course and compare its choices with a direct route.
4. Check damage, Option, and re-entry pauses: a computer should resolve its own
   choice only after playback reaches it; human choices remain on their phones.

Planner tests cover flag seeking, pit avoidance, locked registers, deterministic
choices, conveyors, and input immutability. Controller tests cover the decision
barrier and ownership. Browser scenario 031 covers real web/tabletop creation,
automatic readiness/programming, reload, and a second turn using emulators.

Browser walkthroughs: [web play](../tests/e2e/031-computer-player/WEB_PLAY.md)
and [tabletop](../tests/e2e/031-computer-player/README.md).

### Web decision playback

Web play now releases computer decisions when its local playback finishes;
tabletop play continues to require its shared frame acknowledgements. This fixes
computers waiting indefinitely on damage, Option, or re-entry choices in web
rooms that never emit tabletop checkpoints. The [web decision regression](../tests/e2e/031-computer-player/WEB_DECISIONS.md) covers
waiting during playback, automatically taking laser damage, and finishing the
turn. Existing games resume after reloading the host browser.
