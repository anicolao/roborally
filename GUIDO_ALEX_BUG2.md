# Power-down eligibility and locked-register prompt investigation

## Status

The reported general failure is **not reproduced** in game `8MMBQR`. The recent absence of a power-down prompt matches the Avalon Hill 2005 rule because both robots were undamaged. A narrower Fire Control/locked-register edge case remains plausible and should be tested later.

## Rule check

The Avalon Hill 2005 rulebook allows a robot with damage to announce a power down for the following turn. It does not allow a completely undamaged robot to power down voluntarily.

Therefore:

- A robot with 1–4 damage and no locked registers must be offered the choice.
- A robot with ordinary damage-locked registers has at least 5 damage and must be offered the choice.
- A robot already powered down must be offered the choice to remain down or power up.
- A robot with zero damage and no locked registers is not eligible and should not be prompted.
- The Factory Rejects scenario disables power down independently of damage.

Primary rule reference: [Avalon Hill 2005 RoboRally rulebook](https://device.report/m/42e0664e774ee4f6ba50694e436e27a631629e0c726daaeaf13337b801393219), section **3. Announce Power Down**.

## Evidence from game `8MMBQR`

- Turn 11: Guido had 1 damage and no locked registers. The game prompted him, and he chose to remain active.
- Turn 12: Guido had 2 damage and no locked registers. The game prompted him, and he chose to power down.
- Turn 13: Guido began the scheduled power down, cleared his damage and retained lock, and was prompted to remain down or power up. He chose to power up.
- Turns 14–16: Guido and Alex each had 0 damage and no locked registers. Neither was prompted, which is correct for the 2005 rules.

The game therefore already supports the important “damaged but no locked registers” case.

## UI timing that may look like a failure

On a private controller, the power-down choice appears only after that player has submitted the current Program and after any earlier eligible Dock has responded. Before submission, the Program editor remains visible instead. This follows the rulebook phase order, but the UI does not tell an eligible player that a power-down choice is queued until the Program is locked.

This can make power down appear unavailable while programming even though the prompt will appear afterward.

## Narrow edge case to test

Eligibility is currently calculated as:

```text
active AND (already powered down OR damage > 0)
```

It does not inspect `lockedRegisters`.

Fire Control can lock a register instead of dealing a normal damage token, leaving a robot with:

```text
damage = 0
lockedRegisters.length > 0
```

That robot would not receive a power-down prompt under the current eligibility predicate. The engine does clear retained locks when a power down begins, and published RoboRally FAQ guidance treats a Fire Control lock as repairable damage and says power down unlocks registers. This suggests eligibility should probably include a retained lock, but this exact zero-damage state was not the cause of the observed behavior in `8MMBQR` and needs a focused rules test before implementation.

FAQ reference: [RoboRally Fire Control and locked-register guidance](https://roborally.wikidot.com/faq).

## Relevant implementation areas

- `src/lib/room-model.ts`: `isPowerDownEligible`, ordered response barrier, and next-turn projection.
- `src/routes/hand/+page.svelte`: hides the private power-down choice until Program submission and Dock-order eligibility.
- `src/lib/game/movement.ts`: Fire Control register locking and clearing retained locks when power down begins.

## Follow-up tests

1. Confirm that 1–4 ordinary damage always produces a post-submission prompt.
2. Confirm that 5–9 ordinary damage and locked registers produce a prompt.
3. Create a robot with zero ordinary damage and one Fire Control lock, then determine whether it should be eligible to power down immediately.
4. Consider a pre-submission message such as `Power-down decision follows Program lock` for eligible players.

No game or application state was changed during this investigation.
