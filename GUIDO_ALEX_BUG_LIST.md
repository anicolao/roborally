# Guido/Alex live-play bug and usability backlog

## Scope

These items were reported during production game `8MMBQR`. They are recorded for later reproduction and prioritization; the priorities below are provisional. This document does not imply that each technical cause has already been confirmed.

| ID | Issue | Status | Suggested priority | Primary impact |
| --- | --- | --- | --- | --- |
| GA-03 | Tabletop QR codes are unnecessarily small | Resolved | P2 | Joining and reconnecting are harder than necessary |
| GA-04 | Destroyed robots remain on the board as ghosts | Open | P1 | The displayed board state is incorrect or misleading |
| GA-05 | Re-entry preview disappears when only the center square is legal | Open | P1 | Players cannot orient their robot confidently |
| GA-06 | Completed rounds cannot be replayed manually at high speed | Open | P2 | Players cannot review a confusing resolution |
| GA-07 | Private mobile hands are oversized and clipped | Open | P1 | Cards or controls may be unusable on a phone |
| GA-08 | Powered-down prompt incorrectly tells the player to program | Open | P1 | The UI requests an impossible action |
| GA-09 | A player cannot inspect their own Program after locking it | Open | P2 | Players lose access to information they just committed |

## GA-03 — Enlarge tabletop QR codes

### Observed

The player-controller QR codes occupy only a small portion of the available tabletop area. They can be difficult to scan at normal table distance even though there is substantial unused space around them.

### Expected

Use the available layout space to render materially larger QR codes while preserving their quiet zones, seat labels, and room information. They should scan reliably from the likely player positions around the table without requiring the display or camera to be moved unusually close.

### Acceptance notes

- QR codes grow responsively with available tabletop space.
- Every seat remains clearly associated with the correct code.
- Enlargement does not crop the code or reduce its required clear border.
- Common phone cameras can scan from realistic seating distances and angles.

### Resolution

Open-seat QR codes now scale against both seat width and height, growing from 86px to approximately 168px on the standard desktop tabletop while retaining a compact treatment for narrow displays. E2E coverage enforces a minimum size relative to each seat.

## GA-04 — Remove destroyed robots instead of leaving ghosts

### Observed

After a robot is destroyed and should no longer occupy the course, its figure can remain rendered at its last live position. The stale figure looks like a ghost and can be mistaken for an active obstacle.

### Expected

Once destruction has been presented, the robot should disappear from its former board square until a valid re-entry position is chosen and presented. Its archive and re-entry state may remain visible through the appropriate UI, but its old physical position must not look occupied.

### Acceptance notes

- The robot may remain visible during the destruction animation itself.
- It is absent from the settled post-destruction board frame.
- Collision and laser interpretation agree with the displayed vacancy.
- Re-entry places the robot only at the newly selected legal location.

## GA-05 — Always show the board preview during re-entry

### Observed

The re-entry preview picture is not shown when the player has only the center square available. The player may still need to choose a facing direction, but lacks the visual board context needed to orient north, east, south, and west confidently.

### Expected

Show the re-entry board preview whenever a player is making any re-entry decision, including when position is fixed and only facing can be selected. A single legal square may be preselected, but the course image, robot preview, and orientation controls should remain visible.

### Acceptance notes

- A sole legal position is selected automatically without hiding the preview.
- Changing facing immediately updates the robot preview.
- Board orientation and direction labels are unambiguous.
- The preview remains usable at private-controller phone sizes.

## GA-06 — Add manual fast replay for a completed round

### Observed

After the automatic round animation finishes, players cannot replay it. A complicated or surprising interaction is therefore difficult to review collectively.

### Expected

Provide a manual control that replays the just-completed round from its first presentation frame at an accelerated review speed. Replay should be repeatable and must not alter canonical game state, emit gameplay choices, or delay progression to the next round.

### Acceptance notes

- The control is available after automatic playback completes.
- Replay uses the immutable frames from the completed round.
- Review speed is substantially faster than the original presentation.
- The display returns cleanly to the current canonical state afterward.
- Replaying cannot duplicate effects, decisions, or persisted gameplay events.

## GA-07 — Fit private hands within the mobile viewport

### Observed

Program cards and controls in the private mobile hand are too large for some phone viewports and become clipped. Page scrolling is not available, but enabling ordinary scrolling would conflict with the intended single-screen controller design.

### Expected

The entire actionable private-hand interface should responsively fit within the available mobile viewport. Neither document scrolling nor clipped cards or controls should be necessary.

### Acceptance notes

- All dealt cards, register targets, and primary controls remain visible and operable.
- Card size and spacing adapt to viewport width and height.
- Safe-area insets and browser UI changes do not hide controls.
- The page remains a stable, non-scrolling controller surface.
- Touch targets remain large enough to use after scaling.

## GA-08 — Correct powered-down instructional copy

### Observed

When a robot is powered down, the private controller can display a prompt instructing the player to program. A powered-down robot receives no Program hand and cannot program, so the instruction is impossible to follow.

### Expected

Powered-down messaging should describe the action that is actually available: choose whether to remain powered down or power up for the next turn, respond to any other valid decision, or watch the tabletop. Programming instructions and Program submission controls should not be shown for that turn.

### Acceptance notes

- No copy asks a powered-down player to choose or lock Program cards.
- Continue/power-up wording clearly states which turn the choice affects.
- A player waiting in Dock order receives an accurate waiting message.
- The private controller never presents an enabled Program action without a hand.

## GA-09 — Preserve a read-only view of a locked Program

### Observed

After a player locks and submits their Program, their private controller no longer lets them see the five registers they selected.

### Expected

After submission, show the owner a read-only view of their committed five-register Program. It must be visually clear that the Program is locked and cannot be edited. This private view must not reveal opponents' unrevealed Programs.

### Acceptance notes

- The submitting player can inspect all five committed registers.
- Locked damage registers and newly selected cards are distinguished appropriately.
- There are no edit, reorder, or resubmit affordances after commitment.
- The view remains available while waiting and during playback, subject to any deliberate reveal animation treatment.
- Opponent secrecy is unchanged.

## Prioritization note

GA-04, GA-05, GA-07, and GA-08 are proposed as P1 because they can misrepresent the board, prevent an informed gameplay choice, make controls inaccessible, or instruct a player to perform an impossible action. GA-03, GA-06, and GA-09 are proposed as P2 usability improvements because normal play can continue, although the experience is meaningfully degraded.

No application code or live game state was changed while recording this list.
