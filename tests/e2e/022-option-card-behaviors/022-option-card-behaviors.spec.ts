import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  OPTION_CARDS_BY_ID,
  type OptionCardId,
} from "../../../src/lib/game/option-manifest";
import { createOptionDeck, drawOption } from "../../../src/lib/game/options";
import {
  PROGRAM_CARDS,
  type ProgramAction,
} from "../../../src/lib/game/program-manifest";
import { createProgrammingState } from "../../../src/lib/game/programming";
import { deriveRaceSetup, raceConfig } from "../../../src/lib/game/setup";
import {
  respondPowerDownsInDockOrder,
  stayActiveInDockOrder,
} from "../helpers/game-actions";
import { TestStepHelper } from "../helpers/test-step-helper";

const players = [
  { uid: "host", name: "Ada", robotId: "axle" },
  { uid: "guest", name: "Grace", robotId: "bit" },
] as const;

const passiveGuestOptions = new Set<OptionCardId>([
  "circuit-breaker",
  "double-barrel-laser",
  "extra-memory",
  "mechanical-arm",
  "power-down-shield",
  "ramming-gear",
  "rear-laser",
  "superior-archive-copy",
]);

const stationaryActions = new Set<ProgramAction>([
  "rotate-left",
  "rotate-right",
  "u-turn",
]);

function findStationarySequence(
  actions: readonly ProgramAction[],
  finalFacing?: number,
  visitedFacing?: number,
  startFacing = 0,
) {
  const rotation = (action: ProgramAction) =>
    action === "rotate-left" ? -1 : action === "rotate-right" ? 1 : 2;
  const search = (
    remaining: readonly ProgramAction[],
    sequence: ProgramAction[],
    facing: number,
    visited: boolean,
  ): ProgramAction[] | null => {
    if (sequence.length === 5) {
      return (finalFacing === undefined || facing === finalFacing) &&
        (visitedFacing === undefined || visited)
        ? sequence
        : null;
    }
    for (const [index, action] of remaining.entries()) {
      const nextFacing = (facing + rotation(action) + 4) % 4;
      const found = search(
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        [...sequence, action],
        nextFacing,
        visited || nextFacing === visitedFacing,
      );
      if (found) return found;
    }
    return null;
  };
  return search(
    actions.filter((action) => stationaryActions.has(action)),
    [],
    startFacing,
    startFacing === visitedFacing,
  );
}

function facingAfter(sequence: readonly ProgramAction[], startFacing = 0) {
  return sequence.reduce(
    (facing, action) =>
      (facing +
        (action === "rotate-left" ? -1 : action === "rotate-right" ? 1 : 2) +
        4) %
      4,
    startFacing,
  );
}

function playerActions(player: { hand: readonly string[] } | undefined) {
  return (player?.hand ?? []).flatMap((cardId) => {
    const action = PROGRAM_CARDS.find(({ id }) => id === cardId)?.action;
    return action ? [action] : [];
  });
}

function optionSeed(
  cardId: OptionCardId,
  requiredAction?: ProgramAction | readonly ProgramAction[],
  guestRequiredAction?: ProgramAction | readonly ProgramAction[],
  hostMustBeDockOne = false,
  guestOptionId?: OptionCardId,
  layout: "beam" | "dock" | "flag" | "gyro" | "ram" | "shield" = "dock",
  requireStationaryTurns = false,
) {
  for (let index = 0; index < 50_000; index += 1) {
    const fixturePrefix =
      layout === "beam"
        ? "BEAM-"
        : layout === "flag"
        ? "FLAG-"
        : layout === "gyro"
          ? "GYRO-"
        : layout === "ram"
          ? "RAM-"
          : layout === "shield"
            ? "SHIELD-"
            : "";
    const seed = `OPTION-${fixturePrefix}${cardId}-${index}`;
    const config = raceConfig("option-lab", seed);
    const setup = deriveRaceSetup(players, config);
    if (hostMustBeDockOne && setup.players[0]?.uid !== "host") continue;
    const deck = createOptionDeck(seed);
    const optionIdsByUid: Record<string, OptionCardId[]> = {};
    for (const player of setup.players) {
      const option = drawOption(deck);
      optionIdsByUid[player.uid] = option ? [option.cardId] : [];
    }
    if (optionIdsByUid.host?.[0] !== cardId) continue;
    if (
      guestOptionId
        ? optionIdsByUid.guest?.[0] !== guestOptionId
        : !passiveGuestOptions.has(optionIdsByUid.guest?.[0])
    ) {
      continue;
    }
    const programming = createProgrammingState(
      setup,
      config,
      {},
      {},
      1,
      new Set(setup.players.map(({ uid }) => uid)),
      optionIdsByUid,
    );
    const host = programming.players.find(({ uid }) => uid === "host");
    const guest = programming.players.find(({ uid }) => uid === "guest");
    const hasActions = (
      player: typeof host,
      required: ProgramAction | readonly ProgramAction[] | undefined,
    ) => {
      if (!required) return true;
      const available = new Map<ProgramAction, number>();
      for (const cardId of player?.hand ?? []) {
        const action = PROGRAM_CARDS.find(({ id }) => id === cardId)?.action;
        if (action) available.set(action, (available.get(action) ?? 0) + 1);
      }
      const needed = new Map<ProgramAction, number>();
      for (const action of Array.isArray(required) ? required : [required]) {
        needed.set(action, (needed.get(action) ?? 0) + 1);
      }
      return [...needed].every(
        ([action, count]) => (available.get(action) ?? 0) >= count,
      );
    };
    if (!hasActions(host, requiredAction)) {
      continue;
    }
    if (cardId === "crab-legs") {
      const actions = playerActions(host);
      if (
        !actions.some(
          (action) => action === "rotate-left" || action === "rotate-right",
        ) ||
        actions.filter((action) => !stationaryActions.has(action)).length < 5
      ) {
        continue;
      }
    }
    if (cardId === "dual-processor") {
      const actions = playerActions(host);
      if (
        !actions.some((action) => stationaryActions.has(action)) ||
        actions.filter((action) => !stationaryActions.has(action)).length < 5
      ) {
        continue;
      }
    }
    if (!hasActions(guest, guestRequiredAction)) {
      continue;
    }
    if (
      (layout === "beam" || layout === "ram") &&
      !findStationarySequence(playerActions(guest))
    ) {
      continue;
    }
    if (requireStationaryTurns) {
      const hostTurnOne = findStationarySequence(playerActions(host));
      const guestTurnOne = findStationarySequence(playerActions(guest));
      if (!hostTurnOne || !guestTurnOne) {
        continue;
      }
      const turnTwo = createProgrammingState(
        setup,
        config,
        { guest: setup.startingDamage },
        {},
        2,
        new Set(["guest"]),
        optionIdsByUid,
      );
      if (
        !findStationarySequence(
          playerActions(turnTwo.players[0]),
          undefined,
          1,
          facingAfter(guestTurnOne),
        )
      ) {
        continue;
      }
    }
    return seed;
  }
  throw new Error(`Could not find a deterministic ${cardId} Option seed.`);
}

async function chooseProgram(
  page: Page,
  firstAction?: ProgramAction | readonly ProgramAction[],
  leaveRotationsUnused = false,
) {
  const hand = page.getByLabel("Your Program hand").getByRole("button");
  for (const action of firstAction
    ? Array.isArray(firstAction)
      ? firstAction
      : [firstAction]
    : []) {
    const candidates = page
      .getByLabel("Your Program hand")
      .getByRole("button", { name: new RegExp(`^${action} priority`) });
    let selected = false;
    for (let index = 0; index < (await candidates.count()); index += 1) {
      const candidate = candidates.nth(index);
      if ((await candidate.getAttribute("aria-pressed")) !== "true") {
        await candidate.click();
        selected = true;
        break;
      }
    }
    expect(selected, `an unselected ${action} card is available`).toBe(true);
  }
  const submit = page.getByRole("button", { name: "Submit immutable program" });
  for (
    let index = 0;
    index < (await hand.count()) && !(await submit.isEnabled());
    index += 1
  ) {
    const card = hand.nth(index);
    const label = (await card.getAttribute("aria-label")) ?? "";
    if (
      (await card.getAttribute("aria-pressed")) !== "true" &&
      (!leaveRotationsUnused ||
        !/^(rotate-left|rotate-right|u-turn) priority/.test(label))
    )
      await card.click();
  }
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function chooseStationaryProgram(
  page: Page,
  finalFacing?: number,
  visitedFacing?: number,
  startFacing = 0,
) {
  const buttons = page.getByLabel("Your Program hand").getByRole("button");
  const actions: ProgramAction[] = [];
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const label = (await buttons.nth(index).getAttribute("aria-label")) ?? "";
    const action = label.match(/^([^ ]+) priority/)?.[1] as ProgramAction | undefined;
    if (action) actions.push(action);
  }
  const sequence = findStationarySequence(
    actions,
    finalFacing,
    visitedFacing,
    startFacing,
  );
  expect(sequence, "five stationary Program cards satisfy the fixture").not.toBeNull();
  await chooseProgram(page, sequence ?? undefined);
  return sequence ?? [];
}

async function createOptionRace(
  browser: Browser,
  host: Page,
  testInfo: TestInfo,
  cardId: OptionCardId,
  requiredAction?: ProgramAction | readonly ProgramAction[],
  guestRequiredAction?: ProgramAction | readonly ProgramAction[],
  hostMustBeDockOne = false,
  guestOptionId?: OptionCardId,
  layout: "beam" | "dock" | "flag" | "gyro" | "ram" | "shield" = "dock",
  initialHostPowerDown = false,
  requireStationaryTurns = false,
) {
  const cardOrdinal = [...OPTION_CARDS_BY_ID.keys()].indexOf(cardId) + 1;
  const roomCode = `O${testInfo.project.name === "phone" ? "P" : "D"}${String(cardOrdinal).padStart(2, "0")}22`;
  const guestContext: BrowserContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await host.goto(
    `/?e2eIdentity=HOST&e2eRoomCode=${roomCode}&e2eCourse=option-lab`,
  );
  await expect(host.getByRole("status")).toHaveText("Firebase emulator ready");
  await host.getByRole("button", { name: "Create race" }).click();
  await host.getByLabel("Racer name").fill("Ada");
  await host.getByRole("button", { name: "Axle" }).click();
  await host.getByRole("button", { name: "Create and claim seat" }).click();

  await guest.goto(`/?room=${roomCode}&e2eIdentity=GUEST`);
  await expect(guest.getByRole("status")).toHaveAttribute(
    "data-status",
    "synced",
  );
  await guest.getByLabel("Racer name").fill("Grace");
  await guest.getByRole("button", { name: "Bit" }).click();
  await guest.getByRole("button", { name: "Claim seat" }).click();

  await host
    .getByLabel("Setup seed")
    .fill(
      optionSeed(
        cardId,
        requiredAction,
        guestRequiredAction,
        hostMustBeDockOne,
        guestOptionId,
        layout,
        requireStationaryTurns,
      ),
    );
  await host.getByRole("button", { name: "Configure Risky Exchange" }).click();
  await guest.getByRole("button", { name: "Ready for race" }).click();
  await host.getByRole("button", { name: "Ready for race" }).click();
  await host.getByRole("button", { name: "Open programming console" }).click();
  await guest.getByRole("button", { name: "Open programming console" }).click();
  if (initialHostPowerDown) {
    await respondPowerDownsInDockOrder([
      { page: host, powerDownNextTurn: true },
      { page: guest, powerDownNextTurn: false },
    ]);
  } else {
    await stayActiveInDockOrder([host, guest]);
  }
  return { guest, guestContext };
}

async function takeDamageUntilTurnCompletes(host: Page, guest: Page) {
  for (let decision = 0; decision < 20; decision += 1) {
    const complete = host.getByRole("heading", { name: "Turn 1 complete" });
    const hostWindow = host.getByLabel("Damage prevention choice");
    await expect
      .poll(
        async () => (await complete.isVisible()) || (await hostWindow.isVisible()),
      )
      .toBe(true);
    if (await complete.isVisible()) return;
    const decisionId = await hostWindow.getAttribute("data-decision-id");
    expect(decisionId).toBeTruthy();
    const hostChoice = hostWindow.getByRole("button", { name: "Take this damage" });
    if (await hostChoice.isVisible()) {
      await hostChoice.click();
    } else {
      await guest
        .locator(`[data-decision-id="${decisionId}"]`)
        .getByRole("button", { name: "Take this damage" })
        .click();
    }
    await expect
      .poll(
        async () =>
          (await complete.isVisible()) ||
          (await host.locator(`[data-decision-id="${decisionId}"]`).count()) === 0,
      )
      .toBe(true);
  }
  throw new Error("Turn 1 did not complete after twenty damage decisions.");
}

test("Brakes asks at Move 1 execution and may move zero spaces", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "brakes",
    "move-1",
  );
  const steps = new TestStepHelper(host, testInfo);
  steps.setMetadata(
    "Brakes execution decision",
    "A robot that owns Brakes reaches its actual Move 1 timing window before choosing whether to move zero spaces. The immutable choice is replayed for both clients.",
  );
  try {
    await chooseProgram(host, "move-1");
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toBeVisible();
    await steps.step("brakes-runtime-choice", {
      description: "Brakes pauses the printed Move 1 at its execution priority",
      verifications: [
        {
          spec: "The owning player can use Brakes or execute Move 1 normally",
          check: async () => {
            await expect(decision).toContainText("Use Brakes?");
            await expect(
              decision.getByRole("button", { name: "Use Brakes" }),
            ).toBeVisible();
            await expect(
              decision.getByRole("button", { name: "Move normally" }),
            ).toBeVisible();
          },
        },
        {
          spec: "The observer sees the Dock-ordered responder",
          check: async () => {
            await expect(guest.getByLabel("Option decision")).toContainText(
              "Waiting for Ada",
            );
          },
        },
      ],
    });

    await decision.getByRole("button", { name: "Use Brakes" }).click();
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada used brakes and moved zero spaces.",
    );
    await steps.step("brakes-zero-movement", {
      description:
        "The persisted activation resolves as Move 0 without consuming Brakes",
      verifications: [
        {
          spec: "Both clients replay the zero-space movement",
          check: async () => {
            await expect(guest.locator(".full-resolution")).toContainText(
              "Ada used brakes and moved zero spaces.",
            );
          },
        },
        {
          spec: "Brakes remains owned after use",
          check: async () => {
            await expect(
              host
                .getByRole("list", { name: "Robot Life and damage state" })
                .getByRole("listitem")
                .filter({ hasText: "Ada" })
                .locator(
                  `[data-card-id="${OPTION_CARDS_BY_ID.get("brakes")?.id}"]`,
                ),
            ).toHaveCount(1);
          },
        },
      ],
    });
    steps.generateDocs();
  } finally {
    await guestContext.close();
  }
});

test("Fourth Gear asks at Move 3 execution and may move four spaces", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "fourth-gear",
    "move-3",
  );
  try {
    await chooseProgram(host, "move-3");
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toBeVisible();
    await expect(decision).toContainText("Use Fourth Gear?");
    await expect(
      decision.getByRole("button", { name: "Use Fourth Gear" }),
    ).toBeVisible();
    await expect(
      decision.getByRole("button", { name: "Move normally" }),
    ).toBeVisible();
    await expect(guest.getByLabel("Option decision")).toContainText(
      "Waiting for Ada",
    );

    await decision.getByRole("button", { name: "Use Fourth Gear" }).click();
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada used fourth gear and will move four spaces.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada used fourth gear and will move four spaces.",
    );
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada completed step 4",
    );
  } finally {
    await guestContext.close();
  }
});

test("Reverse Gears asks at Back Up execution and may move two spaces", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "reverse-gears",
    "back-up",
  );
  try {
    await chooseProgram(host, "back-up");
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Reverse Gears?");
    await expect(
      decision.getByRole("button", { name: "Use Reverse Gears" }),
    ).toBeVisible();
    await expect(
      decision.getByRole("button", { name: "Move normally" }),
    ).toBeVisible();
    await expect(guest.getByLabel("Option decision")).toContainText(
      "Waiting for Ada",
    );

    await decision.getByRole("button", { name: "Use Reverse Gears" }).click();
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada used reverse gears and will move backward two spaces.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada used reverse gears and will move backward two spaces.",
    );
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada was destroyed off course",
    );
  } finally {
    await guestContext.close();
  }
});

test("Ablative Coat automatically absorbs damage before any player choice", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "ablative-coat",
    ["move-1", "rotate-right"],
    ["move-1", "rotate-left"],
    true,
  );
  try {
    await chooseProgram(host, ["move-1", "rotate-right"]);
    await chooseProgram(guest, ["move-1", "rotate-left"]);

    const guestDamage = guest.getByLabel("Damage prevention choice");
    await expect(guestDamage).toBeVisible();
    await expect(host.getByLabel("Damage prevention choice")).toContainText(
      "Waiting for Grace",
    );
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's ablative coat absorbed one damage",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Ada" }),
    ).toContainText("0 Damage");

    await guestDamage.getByRole("button", { name: "Take this damage" }).click();
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's ablative coat absorbed one damage",
    );
  } finally {
    await guestContext.close();
  }
});

test("Circuit Breaker forces next-turn power down at three damage", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "circuit-breaker",
    ["move-1", "rotate-right", "back-up"],
    ["move-1", "rotate-left", "back-up"],
    true,
    "double-barrel-laser",
  );
  try {
    await chooseProgram(host, ["move-1", "rotate-right", "back-up"]);
    await chooseProgram(guest, ["move-1", "rotate-left", "back-up"]);
    await takeDamageUntilTurnCompletes(host, guest);

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's circuit breaker forced power down next turn.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's circuit breaker forced power down next turn.",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Ada" }),
    ).toContainText(/(?:3|4|5|6|7|8|9) Damage/);
  } finally {
    await guestContext.close();
  }
});

test("Extra Memory deals one additional Program card", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "extra-memory",
  );
  try {
    await expect(
      host.getByLabel("Your Program hand").getByRole("button"),
    ).toHaveCount(10);
    await expect(
      guest.getByLabel("Your Program hand").getByRole("button"),
    ).toHaveCount(9);
  } finally {
    await guestContext.close();
  }
});

test("Double-Barrel Laser deals two damage with the main laser", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "double-barrel-laser",
    ["move-1", "rotate-right"],
    ["move-1", "rotate-left"],
    true,
  );
  try {
    await chooseProgram(host, ["move-1", "rotate-right"]);
    await chooseProgram(guest, ["move-1", "rotate-left"]);

    await expect(host.getByLabel("Damage prevention choice")).toBeVisible();
    await expect(
      host
        .locator(".full-resolution li")
        .filter({ hasText: "Ada fired through clear line of sight and hit Grace." }),
    ).toHaveCount(2);
    await takeDamageUntilTurnCompletes(host, guest);
    await expect(guest.locator(".full-resolution")).toContainText(
      "Grace took one damage and now has 2.",
    );
  } finally {
    await guestContext.close();
  }
});

test("Rear Laser fires behind the robot as an additional weapon", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "rear-laser",
    ["move-1", "rotate-left"],
    ["move-1", "rotate-right"],
    true,
  );
  try {
    await chooseProgram(host, ["move-1", "rotate-left"]);
    await chooseProgram(guest, ["move-1", "rotate-right"]);

    await expect(host.getByLabel("Damage prevention choice")).toBeVisible();
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada fired through clear line of sight and hit Grace.",
    );
    await takeDamageUntilTurnCompletes(host, guest);
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada fired through clear line of sight and hit Grace.",
    );
  } finally {
    await guestContext.close();
  }
});

test("Mechanical Arm touches an adjacent flag through an open edge", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "mechanical-arm",
    "rotate-right",
    undefined,
    true,
    undefined,
    "flag",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseProgram(guest);

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada touched Flag 1 in order",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada touched Flag 1 in order",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Ada" }),
    ).toContainText("Flags 1");
  } finally {
    await guestContext.close();
  }
});

test("Superior Archive Copy removes the next re-entry damage", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "superior-archive-copy",
    ["u-turn", "move-2"],
    undefined,
    true,
  );
  try {
    await chooseProgram(host, ["u-turn", "move-2"]);
    await chooseProgram(guest);

    const optionLoss = host.getByLabel("Destroyed robot Option loss");
    await expect(optionLoss).toBeVisible();
    await optionLoss
      .getByRole("button", { name: "Discard Superior Archive Copy" })
      .click();

    const reentry = host.getByLabel("Re-entry cell and facing");
    await expect(reentry).toBeVisible();
    await reentry.selectOption({ index: 1 });
    await host.getByRole("button", { name: "Confirm re-entry" }).click();
    await expect(host.locator(".full-resolution")).toContainText(
      /Ada re-entered .* with 0 damage\./,
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      /Ada re-entered .* with 0 damage\./,
    );
  } finally {
    await guestContext.close();
  }
});

test("Power-Down Shield prevents one hit from each direction per register", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "power-down-shield",
    undefined,
    undefined,
    true,
    undefined,
    "shield",
    true,
    true,
  );
  try {
    await chooseStationaryProgram(host);
    const guestTurnOne = await chooseStationaryProgram(guest);
    await takeDamageUntilTurnCompletes(host, guest);

    await host.getByRole("button", { name: "Begin Turn 2" }).click();
    await guest.getByRole("button", { name: "Begin Turn 2" }).click();
    await stayActiveInDockOrder([host, guest]);

    await chooseStationaryProgram(
      guest,
      undefined,
      1,
      facingAfter(guestTurnOne),
    );
    await expect(
      host.getByRole("heading", { name: "Turn 2 complete" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        host
          .locator(".full-resolution li")
          .filter({
            hasText:
              "Ada's power-down shield prevented one damage arriving from the west.",
          })
          .count(),
      )
      .toBeGreaterThan(0);
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Ada" }),
    ).toContainText("0 Damage");
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's power-down shield prevented one damage arriving from the west.",
    );
  } finally {
    await guestContext.close();
  }
});

test("Ramming Gear damages the robot it pushes", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "ramming-gear",
    ["rotate-right", "move-1"],
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, ["rotate-right", "move-1"]);
    await chooseStationaryProgram(guest);
    await takeDamageUntilTurnCompletes(host, guest);

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's ramming gear hit Grace for one damage.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's ramming gear hit Grace for one damage.",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText(/(?:2|3|4|5|6|7|8|9) Damage/);
  } finally {
    await guestContext.close();
  }
});

test("Gyroscopic Stabilizer asks once and ignores factory rotation all turn", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "gyroscopic-stabilizer",
    "rotate-right",
    undefined,
    true,
    undefined,
    "gyro",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Gyroscopic Stabilizer?");
    await expect(guest.getByLabel("Option decision")).toContainText(
      "Waiting for Ada",
    );
    await decision
      .getByRole("button", { name: "Stabilize this turn" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada activated gyroscopic stabilizer for this turn.",
    );
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's gyroscopic stabilizer ignored the gear rotation.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's gyroscopic stabilizer ignored the gear rotation.",
    );
  } finally {
    await guestContext.close();
  }
});

test("High-Power Laser asks at an obstruction and passes through a robot", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "high-power-laser",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use High-Power Laser?");
    await expect(guest.getByLabel("Option decision")).toContainText(
      "Waiting for Ada",
    );
    await decision
      .getByRole("button", { name: "Pass the obstruction" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada used high-power laser to pass one obstruction.",
    );
    await expect(guest.getByLabel("Damage prevention choice")).toBeVisible();
    await guest
      .getByLabel("Damage prevention choice")
      .getByRole("button", { name: "Take this damage" })
      .click();
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada fired through clear line of sight and hit Grace.",
    );
  } finally {
    await guestContext.close();
  }
});

test("Pressor Beam replaces the main laser with a one-space push", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "pressor-beam",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Pressor Beam?");
    await expect(guest.getByLabel("Option decision")).toContainText(
      "Waiting for Ada",
    );
    await decision
      .getByRole("button", { name: "Push with Pressor Beam" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's pressor beam pushed Grace one space east.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Grace was pushed east by an Option weapon",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("0 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Tractor Beam replaces the main laser with a one-space pull", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "tractor-beam",
    "rotate-right",
    undefined,
    true,
    undefined,
    "beam",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Tractor Beam?");
    await decision
      .getByRole("button", { name: "Pull with Tractor Beam" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's tractor beam pulled Grace one space west.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Grace was pushed west by an Option weapon",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("0 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Mini Howitzer deals damage, pushes, and spends a shot", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "mini-howitzer",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Mini Howitzer?");
    await decision
      .getByRole("button", { name: "Fire Mini Howitzer" })
      .click();

    const damage = guest.getByLabel("Damage prevention choice");
    await expect(damage).toBeVisible();
    await damage.getByRole("button", { name: "Take this damage" }).click();
    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's mini howitzer hit Grace (shot 1 of 5).",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Grace was pushed east by an Option weapon",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("1 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Fire Control locks a named register instead of dealing damage", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "fire-control",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Fire Control?");
    await expect(
      decision.getByRole("button", { name: "Lock register 1" }),
    ).toBeVisible();
    await decision
      .getByRole("button", { name: "Lock register 1" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's fire control locked Grace's register 1.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's fire control locked Grace's register 1.",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("0 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Radio Control replaces every remaining target register", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "radio-control",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Radio Control?");
    await decision
      .getByRole("button", { name: "Transmit remaining Program" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      "Ada's radio control copied registers 2-5 to Grace.",
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      "Ada's radio control copied registers 2-5 to Grace.",
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("0 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Scrambler replaces the target next register from the Program deck", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "scrambler",
    "rotate-right",
    undefined,
    true,
    undefined,
    "ram",
  );
  try {
    await chooseProgram(host, "rotate-right");
    await chooseStationaryProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Scrambler?");
    await decision
      .getByRole("button", { name: "Scramble next register" })
      .click();

    await expect(host.locator(".full-resolution")).toContainText(
      /Ada's scrambler replaced Grace's register 2 with program-/,
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      /Ada's scrambler replaced Grace's register 2 with program-/,
    );
    await expect(
      host
        .getByRole("list", { name: "Robot Life and damage state" })
        .getByRole("listitem")
        .filter({ hasText: "Grace" }),
    ).toContainText("0 Damage");
  } finally {
    await guestContext.close();
  }
});

test("Crab Legs pairs an unused Rotate card with Move 1", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "crab-legs",
    "move-1",
  );
  try {
    await chooseProgram(host, "move-1", true);
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Crab Legs?");
    const sidestep = decision.getByRole("button", { name: /^Sidestep / }).first();
    await expect(sidestep).toBeVisible();
    await sidestep.click();

    await expect(host.locator(".full-resolution")).toContainText(
      /Ada paired rotate-(?:left|right) with Crab Legs and sidestepped/,
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      /Ada paired rotate-(?:left|right) with Crab Legs and sidestepped/,
    );
  } finally {
    await guestContext.close();
  }
});

test("Dual Processor pairs an unused Rotate card with movement", async ({
  browser,
  page: host,
}, testInfo) => {
  const { guest, guestContext } = await createOptionRace(
    browser,
    host,
    testInfo,
    "dual-processor",
    "move-3",
  );
  try {
    await chooseProgram(host, "move-3", true);
    await chooseProgram(guest);

    const decision = host.getByLabel("Option decision");
    await expect(decision).toContainText("Use Dual Processor?");
    const pair = decision.getByRole("button", { name: /^Pair / }).first();
    await expect(pair).toBeVisible();
    await pair.click();

    await expect(host.locator(".full-resolution")).toContainText(
      /Ada paired (?:rotate-left|rotate-right|u-turn) with Dual Processor./,
    );
    await expect(guest.locator(".full-resolution")).toContainText(
      /Ada paired (?:rotate-left|rotate-right|u-turn) with Dual Processor./,
    );
  } finally {
    await guestContext.close();
  }
});
