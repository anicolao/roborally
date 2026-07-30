# Robo Rally

This repository is the documentation-first starting point for a realtime,
browser-based implementation of the **2005 Avalon Hill edition** of Robo Rally
for two to eight players. Players program five registers from one shared deck,
resolve uniquely numbered cards from highest priority to lowest, survive the
factory, and touch every flag in order.

The project follows the architecture established by the sibling
`rebelprincess` and `jaipur` games: a static SvelteKit client, anonymous
Firebase rooms, one append-only Firestore event stream, deterministic replay,
and browser-level tracer bullets verified with Playwright.

- [EDITIONS.md](EDITIONS.md) records every published base edition, available
  rulebook links, compatibility boundaries, and the reason for targeting 2005.
- [RULES.md](RULES.md) is the implementation-oriented 2005 rules summary.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) defines the architecture,
  event model, commit contract, and vertical-slice sequence.
- [E2E_GUIDE.md](E2E_GUIDE.md) defines the mandatory browser tracer,
  screenshot, walkthrough, emulator, and review contract.

## Product scope

- Two to eight players in a private room.
- Simultaneous hidden programming of five registers.
- The shared 84-card Program deck, including each card's unique priority.
- Damage-reduced hands, locked registers, power down, lives, destruction,
  archive markers, re-entry, elimination, and victory.
- Movement, rotation, pushing, pits, board edges, express and normal conveyor
  belts, pushers, gears, walls, board lasers, robot lasers, repair sites, and
  flags.
- The 26-card Option deck after every physical card has a reviewed manifest.
- All four double-sided 12×12 factory boards, both Docking Bay faces, and the
  34 courses and variants published in the 2005 course manual.
- Reconnect and replay from the complete immutable event history.
- Keyboard-, touch-, phone-, tablet-, and desktop-friendly play.

The first complete race will use **Risky Exchange**, the published easy course
on the Exchange board for two to eight players. Later slices add the remaining
board faces, Option cards, expert variants, team courses, and multi-board
courses without replacing the real multiplayer path with a mock.

## Technical foundation

- SvelteKit, TypeScript, Bun, and `@sveltejs/adapter-static`.
- Firebase anonymous Authentication and Cloud Firestore.
- One append-only event stream at `games/{gameId}/events/{eventId}`.
- Versioned edition, course, board, Program-deck, Option-deck, shuffle, and
  deterministic reducer manifests.
- Vitest for pure card, movement, board, timing, and reducer tests.
- Playwright against Firebase emulators for real multi-browser E2E scenarios.
- Zero-pixel screenshot comparisons and generated scenario walkthroughs.
- GitHub Pages production deployment and retained pull-request previews.

The Firestore design is intentionally trusted-client multiplayer.
Authentication and Security Rules provide attribution and immutable history,
not server-side move validation or cheating prevention. All events—including
dealt hands, submitted programs, shuffled deck order, Option cards, and future
choices—are readable by every authenticated player. A trustworthy client
enforces legal actions and masks information from its local display.

## Development status

The first end-to-end tracer bullet now provides the static SvelteKit shell,
anonymous Firebase initialization, append-only Firestore Rules and tests,
deterministic Playwright screenshots, the generated application-shell
walkthrough, repository verification hooks, and retained GitHub Pages preview
workflow. Gameplay begins with room membership in the next slice described in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Nix is always available and is the mandatory entry point for every tooling,
development, test, build, emulator, formatting, and dependency-management
command. Do not invoke Bun, Firebase, Playwright, TypeScript, Git hooks, or
repository scripts directly from the host environment.

Once that slice exists, the standard local verification contract will be:

```sh
nix develop --command bun install --frozen-lockfile
nix develop --command bun run verify:change
```

The verifier will run static checks, unit and Firestore Rules tests, every
multiplayer Playwright scenario against Firebase emulators, the production
build, and whitespace checks. Repository-managed hooks run it before every
commit and push.

## Edition and rules source

The initial target is specifically `avalon-hill-2005`, not a blend of classic
and modern Robo Rally:

- use a shared Program deck, numeric priority, damage tokens, lives, archive
  markers, power down, and Option cards;
- do not use the 2016/2021 priority antenna, personal Program decks, reboot
  tokens, or Damage-card deck; and
- do not use the 2023 Energy, SPAM, Haywire, Reboot, or Upgrade systems.

The target source is the
[2005 English rulebook and course manual](https://device.report/m/42e0664e774ee4f6ba50694e436e27a631629e0c726daaeaf13337b801393219).
See [EDITIONS.md](EDITIONS.md) for the other editions and their rule resources.
`RULES.md` is an implementation summary, not a replacement for the published
rulebook.

## Artwork and trademarks

Published illustrations, logos, robot sculpts, board graphics, card layouts,
and trade dress are reference material only. Browser assets must be original
or appropriately licensed while preserving the rules-critical distinctions
among directions, walls, board elements, cards, robots, flags, and repair
sites.

Robo Rally and related marks belong to their respective owners. This repository
is an independent implementation and is not endorsed by Hasbro, Avalon Hill,
Wizards of the Coast, or Renegade Game Studios.

## License

The implementation and original repository content are licensed under the
[GNU General Public License version 3](LICENSE), SPDX identifier
`GPL-3.0-only`. Third-party game names, rules references, and trademarks remain
the property of their respective owners.
