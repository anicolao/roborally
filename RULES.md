# Robo Rally rules: Avalon Hill 2005

This is an implementation-oriented summary of the 2005 Avalon Hill edition.
It is not a replacement for the
[published rulebook and course manual][rules-2005]. Other releases differ
substantially; see [EDITIONS.md](EDITIONS.md).

Normative keywords have their usual meaning:

- **must** is a published rule or an explicit interoperability requirement;
- **should** is the intended implementation behavior; and
- **digital policy** identifies a deterministic choice where the tabletop
  rules rely on people, physical randomness, or “if it is not clear.”

Course rules and Option-card text override the general rules. No modern-edition
mechanic—personal Program decks, priority antenna, Energy, SPAM, Haywire,
Shutdown, Reboot, Damage cards, or Upgrade cards—belongs in a 2005 race.

## Goal

Each player controls one robot. The first robot to touch every flag in numeric
order wins immediately. The players may instead agree to continue after the
winner finishes to determine runners-up.

Touching a later flag early gives no progress. A robot must survive through the
laser step before it can touch a flag during that register.

## Components in scope

The 2005 box contains:

- one two-sided Docking Bay board;
- four two-sided 12×12 Factory Floor boards;
- eight robots, eight Archive markers, and eight Program Sheets;
- 84 Program cards;
- 26 Option cards;
- 60 Damage tokens, 40 Life tokens, and eight Power Down tokens;
- eight numbered flags;
- a 30-second sand timer; and
- two Factory Floor Guides.

The factory-board faces are:

| Physical board | Faces |
| --- | --- |
| 1 | Island / Chop Shop |
| 2 | Spin Zone / Maelstrom |
| 3 | Chess / Cross |
| 4 | Vault / Exchange |

Every board, card, course, and robot requires a stable manifest ID. Published
art is reference material, not a runtime source of geometry or card rules.

## Program deck

All players draw from the same 84-card deck:

| Instruction | Count | Effect |
| --- | ---: | --- |
| Move 1 | 18 | Move forward one space. |
| Move 2 | 12 | Move forward two spaces, one step at a time. |
| Move 3 | 6 | Move forward three spaces, one step at a time. |
| Back Up | 6 | Move backward one space without changing facing. |
| Rotate Right | 18 | Turn 90° clockwise in place. |
| Rotate Left | 18 | Turn 90° counterclockwise in place. |
| U-Turn | 6 | Turn 180° in place. |

Each physical card has one unique numeric priority. Higher numbers execute
first. All 84 instances now have reviewed stable IDs, exact priorities, and
directions in the initial
[manifest review](docs/data/avalon-hill-2005-step3-review.md); action counts
alone are not treated as a sufficient manifest.

Cards in locked registers remain out of the available deck. At the start of
each turn, shuffle the available Program cards and deal the required hands face
down. Undealt cards, discarded hand cards, and unlocked register cards return
to the available deck for the next shuffle.

## Setup

1. Choose a published course and follow its diagram, board orientation, flags,
   player count, and special rules.
2. Each player chooses an unused robot and takes its Archive marker and Program
   Sheet.
3. Each player begins with three Life tokens. The published optional rule gives
   four Life tokens to each player in a five-or-more-player game.
4. Shuffle the Program and Option decks.
5. Choose the first player randomly. That player places both robot and Archive
   marker on Dock 1, facing the factory. Continue clockwise through Dock 2,
   Dock 3, and so on.

The original Dock assignment remains the fixed ordering whenever a power-down
or Option decision needs player priority. It does not change after destruction
or re-entry.

**Digital policy:** `race/configured` commits one seed and an explicit choice
for the optional four-life rule. The versioned PRNG derives the first player,
deck shuffles, and every later random fill. Deal cards round-robin in original
Dock order so every client consumes randomness identically.

Readiness is configuration-scoped. Replacing a lobby configuration invalidates
every prior ready event. The first event prefix in which all currently seated
players are ready closes the barrier and derives the immutable setup. A race
cannot be reconfigured or joined after that point.

## Replay, conflicts, and reconnects

The rules projection is a pure replay of the room's immutable events, ordered
by server timestamp and then event ID. Event IDs include the actor UID and
monotonic client sequence. Exact duplicate IDs are ignored; stale sequences,
incompatible schema/reducer versions, and illegal actions produce diagnostics
without partially changing game state.

A syntactically valid next sequence is consumed even when its domain action is
illegal. This keeps a rejected stale choice or simultaneous-barrier loser from
permanently blocking that actor's later legal events. Same-actor browser writes
are serialized, while events from different actors remain deterministically
ordered by the canonical stream.

For reconnects, a client may first project a version-compatible,
server-confirmed cached prefix, then merge the Firestore cursor delta by stable
event ID. This transport optimization does not alter game rules:
cache-plus-cursor replay and a scratch read of the entire stream must produce
exactly the same state and diagnostics.

## Turn overview

Each turn follows this sequence:

1. powered-down robots decide whether to remain powered down;
2. begin scheduled power downs and remove their existing damage;
3. shuffle and deal Program cards to active robots;
4. active players program their open registers;
5. damaged robots may announce a power down for the next turn;
6. complete registers 1 through 5; and
7. clean up, repair, draw Options, discard unlocked Program cards, and re-enter
   destroyed robots.

Steps 1 and 2 make explicit the rulebook's “before cards are dealt” decisions.
A robot scheduled to power down does not receive cards that turn.

## Deal and program

An active robot receives `9 − damage` cards. A robot with zero through four
damage therefore receives nine through five cards and has five open registers.
At five or more damage, locked registers supply the missing instructions.

After all hands have been dealt, each active player looks at their own cards and
places one card face down in every open register, from register 1 through
register 5. Discard the unused hand cards. Once a player declares “done,” they
may not inspect or rearrange that program.

Programs remain hidden until the matching register reveal. The underlying
trusted-client event stream cannot provide cryptographic secrecy; it only masks
opponents' programs in the ordinary UI.

### Programming timer

When only one programming player has not declared done, that player gets 30
seconds. If only one robot is programming at all, its timer starts as soon as
the cards are dealt. A player controlling more than one robot gets 30 seconds
per unfinished robot.

When time expires, the unfinished player's unused cards are placed face down
and the player to their right randomly fills every empty open register without
looking. Leftover cards are discarded.

**Digital policy:** the accepted event that closes the next-to-last submission
starts a canonical deadline. Any client may claim the timeout after that
deadline. The reducer validates the phase and deadline, then uses the committed
PRNG to fill empty registers from that player's remaining hand. This is the
online equivalent of the right-hand player choosing blindly; the choice must
not depend on which browser claims the timeout.

Editable Program selections are also persisted as `program/draft-updated`
events. They remain private in the normal UI, are never treated as submitted,
and are cleared when the immutable submission or timeout is accepted. A timeout
therefore preserves the target player's server-confirmed draft and randomizes
only the still-empty registers.

The implementation keeps each stable Program card in exactly one zone: draw
pile, a player's hand, an unlocked register, a locked register, or the current
turn discard. Submissions contain card IDs, are accepted only once, and cannot
be retracted. A path preview describes card-only movement and is always labeled
as excluding robot interference and unrevealed board outcomes.

## Power down

Only a damaged robot may announce a power down. An announcement made during the
current turn takes effect at the beginning of the next turn.

At the beginning of every turn a robot is powered down:

- discard all damage it currently has;
- deal it no Program cards;
- execute no Program cards; and
- leave it vulnerable to pushing, conveyors, pushers, gears, pits, board edges,
  lasers, and new damage.

A robot may remain powered down for consecutive turns. Before the next deal,
the player chooses whether to continue; if so, remove damage again at the
beginning of that turn.

When announcement order matters, ask the original Dock 1 player first and
continue clockwise, giving each eligible player one decision. If a robot
announces a power down and is destroyed before it begins, its player chooses on
re-entry whether to enter the scheduled turn powered down.

**Digital policy:** each eligible decision is an immutable
`power-down/responded` event. Ineligible Docks are skipped, eligible responses
must arrive exactly once in original Dock order, and a completed Program cannot
resolve until that turn's response barrier is complete.

A register that becomes locked from damage received during power down is
programmed immediately: draw the top available Program card and place it face
up in that register.

## Register resolution

For each register from 1 through 5, resolve:

```text
reveal all programmed cards for this register
  -> move robots from highest card priority to lowest
  -> move express conveyors one space
  -> move express and normal conveyors one space
  -> activate pushers printed for this register
  -> rotate gears
  -> fire board and robot lasers
  -> touch the next flag and update archive locations
```

Destroyed robots take no further part in the turn. Powered-down robots skip
Program-card movement but still participate in every board and laser step.

### Program-card movement and rotation

Resolve programmed robots from highest numeric priority to lowest. A rotation
changes facing but not position. Resolve Move 2 and Move 3 one space at a time;
each step can push, stop at a wall, or destroy a robot before later steps.

A wall blocks movement across its edge. Hitting a wall causes no damage. A pit
or course edge does not block movement: entering a pit or leaving the board
destroys the moving robot immediately.

The implemented semantic wall graph stores undirected edges and checks both the
departing and destination cell, including transformed board seams. Program
resolution emits a deterministic microstep trace; animation and the textual
feed are projections of that trace and never additional canonical events.

### Pushing

When movement enters an occupied space, it pushes that robot one space in the
same direction. A line of robots can be pushed. If any wall prevents the line's
displacement, the pushing robot's current movement step stops and no robot in
the blocked line moves.

A pushed robot can enter a pit, leave the board, land on any board element, or
push another robot. A Program step may continue after the pushed robot is
destroyed if the destination has become empty.

### Conveyors

Board elements activate in the published order:

1. express conveyors move their robots one space;
2. express and normal conveyors move their robots one space;
3. active pushers push; and
4. gears rotate.

All conveyor movement within one substep is simultaneous and has no Program
priority. Conveyors never push robots:

- if two conveyor moves converge on one destination, neither robot moves;
- if the destination is occupied by a robot that is not moving away in that
  same conveyor substep, the arriving robot does not move; and
- when the legal outcome is unclear, the rulebook says not to move either
  robot.

**Digital policy:** compute every conveyor intent from the same pre-substep
state. Reject converging destinations, swaps and dependency cycles that cannot
be resolved unambiguously, and moves into cells whose occupants do not have an
accepted move. Apply all remaining moves atomically.

When a conveyor moves a robot onto a curved conveyor space, rotate the robot
90° in the curve's shown direction. This includes an express conveyor moving
onto a curved normal conveyor. Moving or being pushed onto that space does not
rotate the robot; it will only be conveyed normally during the board step.

### Pushers and gears

A pusher activates only on the register numbers printed beside it and pushes a
robot from its cell in the shown direction. Apply normal wall, robot-chain,
pit, and board-edge consequences.

A gear rotates a robot on its cell 90° in the direction shown. Gears do not
move robots between cells.

The current implementation runs this complete board phase after every
register. Reviewed Exchange has 68 straight conveyor cells and five gears;
Exchange and Docking Bay A have no printed curved belts or pushers. Those
generic rules are still executable and exhaustively fixture-tested, but the
selected course renderer truthfully shows none.

### Lasers

Lasers fire after every board element has finished. Each board beam travels in
a straight line until blocked by a wall or the first robot. That nearest robot
takes one damage for each beam. A robot that merely crossed a beam earlier in
the register is unharmed.

Every robot also fires its forward main laser. It hits the first robot in its
line of sight for one damage; walls and intervening robots block the shot.
Range is unlimited across the course.

**Digital policy:** the rulebook groups board and robot lasers into one “Lasers
Fire” step. Evaluate all unmodified base beams from the same post-board-element
position, then apply their hits, so damage from one beam does not retroactively
change another beam's target. Option cards can replace or modify fire and may
create ordered decisions; their printed timing controls.

The current implementation uses that exact snapshot policy. Board beam lanes
and robot rays stop at walls or the nearest robot, each beam applies one hit,
and damage immediately projects retained locked-card IDs or tenth-damage
destruction.

### Flags and archives

After lasers:

- a surviving robot on its next required flag records that flag as touched;
- a robot on any flag or repair site moves its Archive marker to that cell; and
- if the touched flag is the robot's final flag, it wins.

Archive updates happen after every register, but repair and Option benefits
happen only during cleanup after register 5.

The current projection enforces this checkpoint after every laser snapshot.
Out-of-order flags still move the Archive but do not advance progress. Flag 3
ends Program resolution immediately and freezes winner, optional runner-up,
and final robot standings for the race epoch.

## Cleanup

After register 5:

1. A robot on a single-wrench repair site removes one damage.
2. A robot on a crossed wrench/hammer site removes one damage and draws one
   Option card.
3. Each drawn Option is read publicly and remains face up with its owner.
4. Discard every Program card in an unlocked register. Locked cards remain.
5. Resolve continued power-down decisions.
6. Re-enter robots destroyed this turn that still have a Life token.

When multiple Option decisions share a timing window, the original Dock 1
player decides first, followed clockwise. Each player receives one opportunity
to say whether and how they use an Option.

Single-wrench and crossed-site repair remove exactly one damage during cleanup.
A falling lock threshold discards the newly unlocked register from 1 toward 5.
Crossed sites draw without replacement from the reviewed, versioned 26-card
2005 Option deck; ownership and discards remain public.

## Damage and locked registers

Damage determines the next hand and locked registers:

| Damage | Cards dealt | Locked registers |
| ---: | ---: | --- |
| 0 | 9 | none |
| 1 | 8 | none |
| 2 | 7 | none |
| 3 | 6 | none |
| 4 | 5 | none |
| 5 | 4 | 5 |
| 6 | 3 | 4–5 |
| 7 | 2 | 3–5 |
| 8 | 1 | 2–5 |
| 9 | 0 | 1–5 |
| 10 | — | destroyed |

When damage locks a register, the card in it remains and executes on every
later turn until that locking damage is repaired. A robot with all five
registers locked repeats the entire stored program.

Repairs unlock registers from the lowest numbered locked register toward the
highest: at nine damage repair and discard register 1's card, at eight repair
register 2, and so forth until register 5 unlocks when damage falls below five.
Discard both the locking damage token and the unlocked Program card.

When a robot would receive damage, its owner may immediately discard one Option
card instead. One Option prevents one damage, and any number can be discarded
this way if the owner has them. Discarded Options stay face up beside the
Option deck.

## Destruction, lives, and re-entry

A robot is destroyed immediately when it:

- receives its tenth damage;
- enters a pit; or
- moves or is moved off the course.

On each destruction, the owner chooses and discards one owned Option card if
possible, then discards one Life token. Losing the last Life permanently
eliminates that robot. Otherwise it re-enters during the same turn's cleanup.

Ordinary re-entry places the robot on its Archive marker facing any cardinal
direction and gives it two damage. Damage acquired while powered down is added
to those two re-entry damage.

If multiple robots share the same archive cell, re-enter them in destruction
order:

1. the first destroyed takes the archive cell and chooses a facing;
2. each later robot chooses an empty orthogonally or diagonally adjacent cell
   and a facing;
3. that placement may not put another robot in its line of sight within three
   spaces; and
4. ignore board elements during placement except pits, which are illegal.

Re-entry facing and, when necessary, adjacent cell are genuine player choices.
Resolution pauses until the authorized player chooses a legal combination.

The 2005 edition does **not** use virtual robots.

The current implementation applies these rules to Program movement, including
transactional push chains, pits, course edges, Life loss, elimination, and
ordered re-entry. Until the reviewed Option manifest lands, every destruction
still records the mandatory Option-loss decision point and deterministically
continues because no Option can yet be owned.

## Option cards

The 26 Option cards are public once drawn. Their printed text can modify
movement, weapons, damage, timing, or other rules and overrides this summary on
a conflict.

The rulebook does not provide a text inventory for all cards. The Option-card
feature must therefore remain disabled until the physical 2005 deck has been
transcribed into a reviewed manifest recording:

- stable card ID and exact count;
- public name and rules text;
- timing window and eligible actor;
- legal targets and choices;
- persistent versus discard behavior;
- interaction with damage prevention and other Options; and
- deterministic ordering for simultaneous effects.

No card behavior may be inferred from a card with the same name in another
edition.

## Published courses

The course manual supplies 34 configurations:

### Beginner

Risky Exchange, Checkmate, Dizzy Dash, Island Hop, Chop Shop Challenge,
Twister, Bloodbath Chess, Around the World, Death Trap, and Pilgrimage.

### Expert

Vault Assault, Whirlwind Tour, Lost Bearings, Robot Stew, Oddest Sea, Against
the Grain, Island King, Tricksy, Moving Targets, Set to Kill, Factory Rejects,
Option World, Ball Lightning, Tight Collar, Day of the SuperBot, Interference,
Flag Fry, Frenetic Factory, and Marathon Madness.

### Team

Tandem Carnage, All for One or One for All?, Capture the Flag, Toggle Boggle,
and War Zone.

Each course manifest encodes the exact board faces, positions, rotations,
Docking Bay face, flag cells, allowed player counts, length/difficulty metadata,
team layout, and special rules. Extra copies of physical boards required by
Frenetic Factory and Marathon Madness must become explicit virtual board
instances.

All 34 diagrams are reviewed in
`courses-avalon-hill-2005-complete-v1`. Their combined placements and flag
coordinates are one golden fixture; each board instance is compiled into world
coordinates with quarter-turn transforms and overlap rejection. Risky Exchange
and Factory Rejects are playable multiplayer courses. Factory Rejects uses Chop
Shop with Docking Bay B for five to eight players; every robot starts with two
Damage tokens and cannot power down. Around the World is the
representative multi-board geometry race.

The exceptional-course reducer explicitly covers both published clocks, moving
flags and pit reset, doubled damaging robot lasers, altered Option/repair
awards, starting damage/Options, disabled power down, SuperBot repair and
transfer, Interference racer/blocker hands, board rotation without moving
occupants, shared versus individual team flag progress, Capture the Flag home
boards and re-entry, persistent Toggle Boggle control, and War Zone
elimination.

## Open transcription gates

The rules engine cannot be declared 2005-complete until these source-data tasks
are reviewed:

1. ~~all 84 Program-card IDs, priorities, and directions~~ — reviewed in the
   Step 3 manifest;
2. ~~all 26 Option cards and effects~~ — reviewed and executable in
   `avalon-hill-2005-options-v1`;
3. ~~every wall, pit, conveyor, pusher, gear, laser, and repair cell on all
   eight board faces~~ — reviewed in
   `boards-avalon-hill-2005-complete-v1`;
4. ~~both Docking Bay faces~~ — reviewed in the complete board manifest; and
5. ~~all 34 course diagrams and special rules~~ — reviewed and executable in
   `courses-avalon-hill-2005-complete-v1`.

Unreviewed manifests may be used only in clearly marked development fixtures,
never silently exposed as a published course.

[rules-2005]: https://device.report/m/42e0664e774ee4f6ba50694e436e27a631629e0c726daaeaf13337b801393219
