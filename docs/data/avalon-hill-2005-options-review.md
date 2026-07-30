# Avalon Hill 2005 Option review

Status: reviewed, complete, and enabled by
`avalon-hill-2005-options-v1`.

This review closes the Option gate recorded during Step 3. It distinguishes the
26-card Avalon Hill 2005 deck from decks in other Robo Rally editions.

## Sources and review method

The primary inventory is the Option-card sheet published for the 2005 Avalon
Hill edition in the Italian rules community:

- [RoboRally Avalon Hill Option cards (Italian PDF)](https://www.goblins.net/files/downloads/RoborallyAH_CarteOpzioniITA.pdf)
- [Download record and provenance](https://www.goblins.net/download/roborally-carte-opzione-italiano-0)

The sheet identifies itself as Avalon Hill RoboRally, is dated October 2005,
and contains 26 card faces. The English names and rule interpretations were
cross-checked against the Option glossary in the fan-compiled
[RoboRally Ultimate Collection rulebook](https://www.thealexandrian.net/creations/roborally/roborally-ultimate-collection-rulebook.pdf).
The component count was independently checked against the
[BoardGameGeek 2005 card-set record](https://boardgamegeek.com/cardset/92596/avalon-hill-ed-2005),
whose 110 cards are the 84 Program cards plus these 26 Options.

Two independent passes were made: first for names and count, then for trigger,
choice, payload, and discard behavior. The application stores concise
implementation summaries, not card-text transcriptions.

## Reviewed inventory

| # | Card | Implementation class | Finite trigger |
|---:|---|---|---|
| 1 | Ablative Coat | armor, three-damage payload | each damage packet |
| 2 | Abort Switch | random Program replacement | before a register reveal |
| 3 | Brakes | Move 1 becomes Move 0 | before its Program movement |
| 4 | Circuit Breaker | forced power down at 3+ damage | turn end |
| 5 | Conditional Program | stored Program substitution | programming, then before a register |
| 6 | Crab Legs | paired Move 1 sidestep | programming |
| 7 | Double-Barrel Laser | two-damage main laser | robot-laser phase |
| 8 | Dual Processor | paired movement and rotation | programming |
| 9 | Extra Memory | one additional dealt Program | programming deal |
| 10 | Fire Control | lock register or destroy Option | main-laser hit |
| 11 | Flywheel | stored movement Program | programming |
| 12 | Fourth Gear | Move 3 becomes Move 4 | before its Program movement |
| 13 | Gyroscopic Stabilizer | ignore factory rotations | before register one |
| 14 | High-Power Laser | pass one obstruction | robot-laser phase |
| 15 | Mechanical Arm | adjacent flag/archive touch | register end |
| 16 | Mini Howitzer | five-use damage-and-push weapon | robot-laser phase |
| 17 | Power-Down Shield | directional damage prevention | damage while powered down |
| 18 | Pressor Beam | push weapon | robot-laser phase |
| 19 | Radio Control | remaining-Program copy | robot-laser phase |
| 20 | Ramming Gear | pushed-robot damage | Program push |
| 21 | Rear Laser | additional rear shot | robot-laser phase |
| 22 | Recompile | redeal followed by damage | programming |
| 23 | Reverse Gears | Back Up becomes two spaces | before its Program movement |
| 24 | Scrambler | replace target’s next Program | robot-laser phase before register five |
| 25 | Superior Archive Copy | suppress re-entry damage | destruction and next re-entry |
| 26 | Tractor Beam | pull weapon | robot-laser phase at range two or more |

`Shield` and `Turret` occur in another Option inventory and are deliberately not
part of this manifest. `Crab Legs` and `Dual Processor` are present on the 2005
card sheet and are deliberately included.

## Digital timing policy

Table talk and animation duration are never clocks. Every optional effect is
declared in an immutable `effect/chosen` event for a named turn and finite
window:

1. programming choices are committed with the Program;
2. before-register choices close before that register resolves;
3. weapon choices name the register and legal target;
4. prevention names an owned Option and one damage packet;
5. destruction loss names one owned Option before re-entry;
6. simultaneous choices are requested and applied in original Dock order.

An omitted or timed-out choice means “do not use” for optional effects. Mandatory
effects require no interruption and are applied by the reducer. Every payload,
stored card, and once-per-turn use is immutable reducer state.
