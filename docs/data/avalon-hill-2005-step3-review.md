# Avalon Hill 2005: initial manifest review

This review records the source gate for the first playable course. Runtime data
is in `src/lib/game/`; this document explains how it was checked without
embedding published art.

## Sources and coordinate convention

- Primary: [2005 English rulebook and Course Manual][rulebook], especially the
  Program-card inventory, setup rules, Exchange face, Docking Bay face, and
  Risky Exchange diagram.
- Independent machine-readable comparison:
  [`Area.course.exchange` and `Area.start.simple`][independent-board] at commit
  `335afe842b04b4ad7500a86bedcc4ddb320d5424`.

Coordinates are one-based `(column, row)`, beginning at the upper-left of each
printed face. The assembled Risky Exchange course places Exchange at rows 1–12
and Docking Bay A at rows 13–16. Direction names describe the direction an
element moves or fires in the unrotated face.

The first pass was made from a high-resolution rendering of the published
diagram. The second pass compared each element route, wall edge, starting cell,
and deck range with the independent transcription. The browser golden and text
equivalent are generated from the resulting semantic manifest, never from the
source image.

## Program deck

The reviewed manifest has 84 stable IDs, one for each unique printed priority:

| Action | Priorities |
| --- | --- |
| U-Turn | 010–060 by 10 |
| Rotate Right | 070–410 by 20 |
| Rotate Left | 080–420 by 20 |
| Back Up | 430–480 by 10 |
| Move 1 | 490–660 by 10 |
| Move 2 | 670–780 by 10 |
| Move 3 | 790–840 by 10 |

The golden test checks the complete `010..840` priority set, action counts, and
unique IDs.

## Exchange face

The source route listing expands to:

- 68 conveyor cells across 22 normal and three express routes;
- two pits at `(3,2)` and `(1,11)`;
- clockwise gears at `(11,2)` and `(11,11)`;
- counterclockwise gears at `(4,4)`, `(4,9)`, and `(9,9)`;
- repair sites at `(1,1)` and `(12,12)`;
- one repair-and-Option site at `(8,8)`;
- a single board-laser path across `(10,3)` through `(12,3)`; and
- 27 stored wall edges, including the regular face boundary connections.

The ordered cells and wall edges have golden SHA-256
`ab8ccb3c3dc53cf1e76616a9fa3de3c3291ff57eb6f19aac063ab7b6a7954a31`.
That digest changes if any coordinate, route direction, speed, turn, element,
or wall edge changes.

## Docking Bay A and course overlays

Docking Bay A is 12×4. Its starting cells in assembled-course coordinates are:

| Dock | Coordinate |
| ---: | --- |
| 1 | `(6,15)` |
| 2 | `(7,15)` |
| 3 | `(4,15)` |
| 4 | `(9,15)` |
| 5 | `(2,15)` |
| 6 | `(11,15)` |
| 7 | `(1,15)` |
| 8 | `(12,15)` |

The face carries 15 reviewed wall edges. Risky Exchange uses one unrotated
Exchange instance above this Docking Bay and overlays Flag 1 at `(8,2)`, Flag 2
at `(10,8)`, and Flag 3 at `(2,5)`.

## Review status

The Program, Exchange, Docking Bay A, and Risky Exchange manifests are
`reviewed-two-pass`. Their tests pin:

- inventory and priority ranges;
- element counts and the full Exchange digest;
- every Dock and flag coordinate;
- PRNG golden vectors and a fixed two-player setup;
- the five-or-more-player constraint on four Lives; and
- the rendered phone and desktop course goldens.

The 26-card Option manifest and the other seven factory faces remain disabled
until their later source gates are complete.

[rulebook]: https://device.report/m/42e0664e774ee4f6ba50694e436e27a631629e0c726daaeaf13337b801393219.pdf
[independent-board]: https://github.com/marcelpanse/roborally/blob/335afe842b04b4ad7500a86bedcc4ddb320d5424/both/area.js.coffee#L329-L372
