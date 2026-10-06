# Scrambler replacement is not reflected in the tabletop program display

## Summary

In production game `8MMBQR`, Guido successfully used Scrambler against Alex twice during turn 11. The replacement cards were applied by the game engine and used during playback, but Alex's five-card program display continued to show his originally submitted cards. This makes a successful Scrambler use look as though it had no effect.

## Observed behavior

The event stream and resolution trace show two successful uses:

1. At `2026-08-21T05:08:11.853Z`, Guido chose **Use** during the register 3 laser phase.
   - Prompt: `Replace Alex's register 4 with the top Program card?`
   - Original register 4: `program-140` — Rotate Left, priority 140
   - Replacement: `program-020` — U-Turn, priority 20
   - Playback executed the replacement and reported: `Alex revealed u-turn at priority 20.`

2. At `2026-08-21T05:09:04.801Z`, Guido chose **Use** during the register 4 laser phase.
   - Prompt: `Replace Alex's register 5 with the top Program card?`
   - Original register 5: `program-380` — Rotate Left, priority 380
   - Replacement: `program-290` — Rotate Right, priority 290
   - The resolution trace records the replacement.

Despite these substitutions, the tabletop program row continued to display Alex's original Rotate Left cards in registers 4 and 5.

## Expected behavior

Once an affected register is revealed, the tabletop should display the effective replacement card used by playback, or otherwise clearly indicate that Scrambler replaced the submitted card.

Scrambler should not appear to modify the entire program: by rule and by current implementation, each use replaces only the target robot's next register with the top Program card.

## Technical cause

The engine correctly records Scrambler substitutions as runtime `programOverrides`. When it constructs each register's execution queue, it uses an override before falling back to the originally submitted register card.

The tabletop display does not consult those overrides. Its five program-card faces are derived directly from `state.programming.players[].registers`, which intentionally remains the immutable original submission. Consequently, playback and the displayed program can disagree.

Relevant implementation areas:

- `src/lib/game/movement.ts`: creates Scrambler overrides and applies them while constructing the execution queue.
- `src/routes/tt/+page.svelte`: renders revealed program cards from the original programming registers.

## Reproduction

1. Program a target robot normally.
2. Put a robot equipped with Scrambler in a position to hit the target with its forward laser.
3. During a laser phase before register 5, choose **Use** for Scrambler.
4. Allow playback to reveal and execute the target's next register.
5. Compare the executed card and resolution trace with the target's displayed five-card program row.

## Impact

Players cannot visually confirm that Scrambler worked and may reasonably conclude that the option failed or that playback used the wrong program. The underlying turn resolution remains correct; this is a presentation/projection defect.

## Diagnostics

No replay diagnostics or resolution errors were present for these interactions.

## Current status (2026-10-06)

Addressed by the existing effective-playback-card projection in
`src/lib/playback-presentation.ts`, consumed by `PlayerStatusCard.svelte`.
`playback-presentation.test.ts` verifies that a scrambled register displays its
replacement while other players retain their own cards. The report above is
preserved as the original observation; its technical-cause description describes
the former implementation.
