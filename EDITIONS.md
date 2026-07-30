# Robo Rally editions

Robo Rally has two broad rules families:

- **Classic:** the 1994 and 1995 Wizards of the Coast games, the 1999/2000
  European release, and the 2005 Avalon Hill edition. These use one shared
  84-card Program deck, unique numeric card priorities, damage that reduces
  the hand and locks registers, lives, archive markers, and Option cards.
- **Modern:** the 2016 Avalon Hill redesign and the 2021 refresh, followed by
  the closely related 2023 Renegade edition and 2024 30th Anniversary Edition.
  These use a personal programming deck for each player and substantially
  different damage, checkpoint, energy, and upgrade systems.

These families are not interchangeable. Boards can sometimes be adapted, but a
course manifest must always name the rules edition under which it is played.

## Implementation decision

The first implementation target is the **2005 Avalon Hill edition**. It keeps
the classic shared-deck programming system, supports two to eight players, and
provides a self-contained rulebook and course manual with four double-sided
factory boards and a two-sided Docking Bay.

The target rules source is the
[2005 English rulebook and course manual][rules-2005]. A
[BoardGameGeek file record][bgg-rules-2005] is included as a second index in
case the direct mirror moves. [RULES.md](RULES.md) is the implementation
summary; the published rulebook remains authoritative when the summary is
unclear.

The other editions are future compatibility targets, not silent variants of
the 2005 engine. Adding one requires its own edition manifest, component
manifest, reducer rules, tests, and complete-race browser scenario.

## Published base editions

| Release | Publisher | Rules family | Rule resources and notes |
| --- | --- | --- | --- |
| **1994 first edition** | Wizards of the Coast | Classic | The [first-edition record][bgg-1994] identifies the printing. No stable publisher-hosted English PDF is currently available. The surviving [1994 Dutch translation][rules-1994-nl] is edition-specific; the [classic rules transcription][rules-classic-transcription] and [fan consolidated classic rulebook][rules-classic-fan] are useful secondary references, not substitutes for an original English rulebook. |
| **1995 second edition** | Wizards of the Coast | Classic | The [second-edition record][bgg-1995] identifies the printing. It retains the original rules family and was followed by the classic expansions. The same [classic transcription][rules-classic-transcription] and [fan consolidated rulebook][rules-classic-fan] are the most accessible English references found, but include editorial consolidation and must not be treated as a verbatim 1995 rulebook. |
| **1999 German / 2000 Dutch European edition** | AMIGO / 999 Games | Classic | A regional release with four robots and a different four-board selection. A contemporary [Dutch edition overview][european-overview] records its components and play, and the BoardGameGeek [Robo Rally files index][rules-european-de] lists a German scan as “German Rules for Robo Rally.” That community-hosted scan or a physical copy must be reviewed before implementation. |
| **2005 edition** | Avalon Hill | Classic | **Initial target.** Use the [English rulebook and course manual][rules-2005], with the [file record][bgg-rules-2005] as a backup index. It removes virtual robots, adds the Docking Bay and archive-marker re-entry procedure, and incorporates a small selection of material from the classic expansions. |
| **2016 edition** | Avalon Hill / Hasbro | Modern | Major redesign: personal 20-card Program decks, priority antenna, reboot tokens, energy, upgrades, and Damage cards. Use the [official 2016 rulebook][rules-2016]. It is mechanically incompatible with the classic editions. |
| **2021 refresh (F3154)** | Avalon Hill / Hasbro | Modern | A refreshed printing of the 2016 rules family rather than a return to the classic system. Use the [official F3154 English rulebook][rules-2021] or [Hasbro instructions page][hasbro-rules]. |
| **2023 edition** | Renegade Game Studios | Modern | A revision of the modern family on 12×12 boards, with SPAM, Haywire, Reboot, Energy, and Upgrade cards. Use the [official 2023 rulebook][rules-2023] and [publisher product page][product-2023]. |
| **2024 30th Anniversary Edition** | Renegade Game Studios | Modern | A deluxe, expanded release of the Renegade game for up to eight players, with two additional robots and four new double-sided boards. No separate public rulebook was located; use the [official product page][product-30th] for its contents and the [2023 rulebook][rules-2023] for the shared core rules until the box-specific rulebook is available. |

“Edition” is used inconsistently in catalogs: the 1999/2000 products are
regional editions, the 2021 product is a refresh, and the 30th Anniversary box
is an expanded edition. They are listed separately here because each has a
distinct physical release whose component inventory matters to an
implementation. Language localizations and later print runs that preserve one
of these rulesets—including the 2006 localized Avalon Hill releases—are grouped
with their source edition rather than counted as new rules editions.

## Standalone games

These carry the Robo Rally name but are separate games, not editions that can
be selected inside a 2005 race:

| Release | Relationship | Rules |
| --- | --- | --- |
| **Robo Rally: Transformers** (2024) | Standalone Transformers adaptation with asymmetric characters and personalized abilities. | [Official rulebook][rules-transformers] and [product page][product-transformers] |
| **Robo Rally Dice** (2026) | Standalone dice-driven game; it does not use the Program-card engine. | [Official rulebook][rules-dice] and [product page][product-dice] |

## Expansions are not editions

The classic releases **Armed and Dangerous** (1995), **Crash and Burn** (1997),
**Grand Prix** (1997), and **Radioactive** (1998) add boards, Option cards, and
variants to the 1994/1995 family. The Renegade releases **Wet & Wild**,
**Chaos & Carnage**, **Master Builder**, and later expansions extend the modern
Renegade family.

Expansion content is out of scope for the first implementation. A board or card
from an expansion may be added only after its source rules and component data
are recorded in a versioned expansion manifest. The 2005 box already includes
specific elements descended from older expansions; those are part of the 2005
target because they appear in its own rulebook and component inventory.

## Compatibility policy

Every saved race must persist:

- `editionId` such as `avalon-hill-2005`;
- an exact `rulesVersion`;
- a course-manifest version;
- Program- and Option-deck manifest versions; and
- enabled expansion or house-rule IDs, normally empty.

Loading must fail clearly when any required manifest is unavailable. Rules from
another edition must never be inferred from a similarly named card, board
element, or course.

[bgg-1994]: https://boardgamegeek.com/boardgameversion/23719/wizards-of-the-coast-english-first-edition
[bgg-1995]: https://boardgamegeek.com/boardgameversion/24190/wizards-of-the-coast-english-second-edition
[rules-1994-nl]: https://spellenlab.be/media/files/5d611f72cd8074b5dcad9c9e35c974f068ee730f.pdf
[rules-classic-transcription]: https://variablepig.org/rules/roborally.html
[rules-classic-fan]: https://thealexandrian.net/creations/roborally/roborally-ultimate-collection-rulebook.pdf
[european-overview]: https://www.spelmagazijn.com/homepage/spellen/spelbeschrijvingen/roborally
[rules-european-de]: https://boardgamegeek.com/files/thing/18/page/3
[rules-2005]: https://device.report/m/42e0664e774ee4f6ba50694e436e27a631629e0c726daaeaf13337b801393219
[bgg-rules-2005]: https://boardgamegeek.com/filepage/302577/english-rulebook-2005
[rules-2016]: https://media.wizards.com/2017/rules/roborally_rules.pdf
[hasbro-rules]: https://instructions.hasbro.com/en-us/instruction/avalon-hill-robo-rally-strategy-board-game-ages-12-and-up-for-2-6-players
[rules-2021]: https://instructions.hasbro.com/api/download/F3154_en-us_avalon-hill-robo-rally-strategy-board-game-ages-12-and-up-for-2-6-players.pdf
[rules-2023]: https://retailers.renegadegamestudios.com/content/File%20Storage%20for%20site/Rulebooks/Robo%20Rally/RoboRally_Rulebook_WEB.pdf
[product-2023]: https://renegadegamestudios.com/robo-rally/
[product-30th]: https://renegadegamestudios.com/robo-rally-30th-anniversary-edition/
[rules-transformers]: https://retailers.renegadegamestudios.com/content/File%20Storage%20for%20site/Rulebooks/Robo%20Rally/RoboRally_TF_Rulebook_WEB.pdf
[product-transformers]: https://eu.renegadegamestudios.com/robo-rally-transformers/
[rules-dice]: https://store-kftzvkkgjv.mybigcommerce.com/content/File%20Storage%20for%20site/Rulebooks/Robo%20Rally/RoboRally_Dice_Rulebook_WEB.pdf
[product-dice]: https://eu.renegadegamestudios.com/robo-rally-dice/
