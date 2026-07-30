# End-to-end test guide

Every Robo Rally feature is delivered as a browser-visible tracer bullet. An
E2E scenario is executable product documentation: it drives the real client
against Firebase emulators, makes semantic assertions, captures deterministic
screenshots, and generates a checked-in walkthrough.

This guide is part of the implementation contract. A gameplay change without a
matching browser scenario is incomplete.

## Mandatory Nix entry point

Nix is always available. Run every dependency, development, Firebase,
Playwright, test, build, formatting, and Git tooling command through the locked
development environment:

```sh
nix develop --command bun install --frozen-lockfile
nix develop --command bun run test:e2e
```

Never depend on host-installed Bun, Node.js, Firebase CLI, Chromium,
Playwright, TypeScript, or Git tooling.

## What an E2E scenario proves

A scenario must begin with a user action in the actual application and finish
with a visible result. Depending on its scope, it crosses:

```text
browser interaction
  -> Svelte component
  -> event creation
  -> Firestore emulator
  -> event subscription and deterministic reducer
  -> local-player selector
  -> rendered result
```

Do not bypass this path with direct reducer calls, page-injected state,
handwritten Firestore result events, mocked repositories, or test-only UI
controls. Test helpers may remove repetitive browser actions, but they must use
the same controls and public application behavior as a player.

Pure unit and model tests remain necessary for combinatorial rules. They do not
replace the tracer proving that a real player can reach the behavior.

## Scenario layout

Use the next three-digit sequence and a short kebab-case capability name:

```text
tests/e2e/
  001-app-shell-and-deployment/
    001-app-shell-and-deployment.spec.ts
    README.md
    screenshots/
      000-firebase-ready-desktop.png
      000-firebase-ready-phone.png
  helpers/
    test-step-helper.ts
```

Each directory owns one coherent story. Do not combine unrelated features to
avoid adding scenarios, and do not split a single feature into backend-only and
UI-only tests.

The scenario `README.md` is generated from metadata, step descriptions,
verification labels, and screenshots in the spec. Commit the generated guide
and every reviewed baseline with the implementation.

## Required structure

Every spec must:

1. use Playwright's `test` and `expect`;
2. construct `TestStepHelper` for each documented player view;
3. set a human-readable title and purpose;
4. interact through accessible roles, labels, and stable test IDs;
5. verify semantic behavior before taking each screenshot;
6. wait for a settled application status rather than a guessed delay;
7. capture every required phone and desktop baseline; and
8. generate the scenario walkthrough.

The first scenario follows this shape:

```ts
test('application shell reaches Firebase and renders deterministically', async ({
  page
}, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Application shell and Firebase readiness',
    'The static client loads and signs in against the local Firebase emulators.'
  );

  await page.goto('/');
  await steps.step('firebase-ready', {
    description: 'The factory is ready for racers',
    verifications: [
      {
        spec: 'The page exposes the stable product title',
        check: async () => expect(page).toHaveTitle('Robo Rally — Program the factory')
      }
    ]
  });

  steps.generateDocs();
});
```

The example is illustrative; the checked-in spec is authoritative.

## Semantic assertions before pixels

Screenshots are review evidence, not the only assertion. Before every capture,
assert the state that gives the image meaning:

- page title, primary heading, status, and build marker;
- enabled and disabled controls;
- actor, phase, and decision ownership;
- public information visible to every player;
- private information visible only in the ordinary owner view;
- card, robot, flag, damage, Life, and register counts;
- event-driven convergence in at least one observer view; and
- absence of overflow, clipped controls, and accidental overlap.

Prefer `getByRole`, `getByLabel`, and exact accessible names. Use
`data-testid` only for stable non-user-facing state such as a build marker.
Do not assert CSS implementation details when a user-observable assertion is
available.

## Deterministic screenshots

Playwright runs pinned Chromium with:

- fixed phone and desktop viewports;
- device scale factor 1;
- `en-CA` locale and `America/Toronto` timezone;
- service workers blocked;
- animations disabled for screenshot comparison;
- hidden carets;
- deterministic build metadata;
- stable local fonts; and
- zero allowed differing pixels.

Before capture, the helper moves the pointer away, verifies the application is
settled, rejects viewport overflow, and checks interactive controls for
accidental overlap.

Never update a baseline merely because CI differs. Identify whether the cause
is an intentional UI change, platform font/rendering behavior, an unsettled
state, or an actual regression. Review every changed image.

To regenerate local baselines intentionally:

```sh
nix develop --command bun run test:e2e:update-snapshots
```

Linux baselines are generated by the manual CI workflow and uploaded as an
artifact for review. They are committed only after visual inspection.

## Firebase emulator contract

E2E always uses isolated local Auth and Firestore emulators with a dedicated
test project ID. Production Firebase must never be contacted by a test.

The application exposes a visible connection status:

- `connecting` while initialization is incomplete;
- `synced` after anonymous Auth and Firestore readiness;
- `offline` when a recoverable connection is unavailable; and
- `error` for a terminal setup failure.

The helper waits on this explicit status. A fixed timeout is only a failure
bound, never a synchronization mechanism.

Clear emulator data between scenarios that require isolation. Use unique room
codes and deterministic identities when independent scenarios can coexist.

## Multiplayer scenarios

Use one isolated browser context per player. A multiplayer step is not complete
until it verifies:

- the actor can perform the action;
- at least one observer receives the resulting projection;
- information that should appear simultaneous stays masked until its barrier;
- reload reconstructs the same state from the event history when relevant; and
- every browser converges after accepted concurrent events.

Keep actor and observer helpers explicit. Avoid sharing page-local storage or
Auth state between contexts.

The trusted-client architecture means a modified client could inspect readable
private events. E2E verifies the ordinary UI's masking behavior, not
cryptographic secrecy.

## Time and randomness

Never use arbitrary `waitForTimeout` sleeps. Wait for a semantic condition,
explicit application status, expected event projection, or controlled
animation completion.

Timer scenarios use an injected clock or explicit canonical timestamps.
Randomness uses committed seeds and versioned PRNG output. A failed test must
be reproducible with the same event stream, seed, and clock.

Do not retry a flaky scenario into passing. Remove nondeterminism at its source.

## Animation and reduced motion

Animation is presentation derived from canonical state. Tests may finish finite
animations before documentation capture, but may not skip state transitions.
At least one relevant scenario verifies reduced-motion behavior whenever a new
animation is introduced.

Reloading during animation must immediately render the same resolved
projection. Animation duration must never decide game rules or event order.

## Local workflow

Install the exact dependency graph:

```sh
nix develop --command bun install --frozen-lockfile
```

Run one scenario while developing:

```sh
nix develop --command bun run test:e2e -- tests/e2e/001-app-shell-and-deployment
```

Run and review intentional screenshot changes:

```sh
nix develop --command bun run test:e2e:update-snapshots -- \
  tests/e2e/001-app-shell-and-deployment
```

Run the complete commit contract:

```sh
nix develop --command bun run verify:change
```

The verifier includes static checks, unit tests, Firestore Rules tests, the full
E2E suite, the production build, and whitespace validation. Both pre-commit and
pre-push hooks invoke it.

## CI evidence

CI must:

1. enter the locked Nix environment;
2. install frozen dependencies and pinned Chromium;
3. run static, unit, Firestore Rules, and E2E checks;
4. retain the Playwright HTML report even on failure;
5. build the static application;
6. publish same-repository PR previews under `/roborally/pr<PR number>`;
7. publish `main` under `/roborally`; and
8. preserve existing preview directories.

Fork code must not receive deployment credentials. Never use
`pull_request_target` to build untrusted changes.

## Review checklist

Before committing a scenario:

- [ ] The spec uses only real player-facing paths.
- [ ] Every step has semantic assertions before its screenshot.
- [ ] Actor and observer views are checked where multiplayer is involved.
- [ ] No arbitrary sleep, implicit wall clock, or unseeded randomness remains.
- [ ] Phone and desktop layouts fit without clipping or overlap.
- [ ] Screenshot comparison allows zero differing pixels.
- [ ] Every changed baseline was visually reviewed.
- [ ] The generated scenario `README.md` matches the spec.
- [ ] Firestore emulator data is isolated from other scenarios.
- [ ] The complete verifier passes through Nix.
