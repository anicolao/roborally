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
import { stayActiveInDockOrder } from "../helpers/game-actions";
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

function optionSeed(
  cardId: OptionCardId,
  requiredAction?: ProgramAction | readonly ProgramAction[],
  guestRequiredAction?: ProgramAction | readonly ProgramAction[],
  hostMustBeDockOne = false,
  guestOptionId?: OptionCardId,
) {
  for (let index = 0; index < 50_000; index += 1) {
    const seed = `OPTION-${cardId}-${index}`;
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
    ) =>
      !required ||
      (Array.isArray(required) ? required : [required]).every((action) =>
        player?.hand.some(
          (cardId) => PROGRAM_CARDS.find(({ id }) => id === cardId)?.action === action,
        ),
      );
    if (!hasActions(host, requiredAction)) {
      continue;
    }
    if (!hasActions(guest, guestRequiredAction)) {
      continue;
    }
    return seed;
  }
  throw new Error(`Could not find a deterministic ${cardId} Option seed.`);
}

async function chooseProgram(
  page: Page,
  firstAction?: ProgramAction | readonly ProgramAction[],
) {
  const hand = page.getByLabel("Your Program hand").getByRole("button");
  for (const action of firstAction
    ? Array.isArray(firstAction)
      ? firstAction
      : [firstAction]
    : []) {
    await page
      .getByLabel("Your Program hand")
      .getByRole("button", { name: new RegExp(`^${action} priority`) })
      .first()
      .click();
  }
  const submit = page.getByRole("button", { name: "Submit immutable program" });
  for (
    let index = 0;
    index < (await hand.count()) && !(await submit.isEnabled());
    index += 1
  ) {
    const card = hand.nth(index);
    if ((await card.getAttribute("aria-pressed")) !== "true")
      await card.click();
  }
  await expect(submit).toBeEnabled();
  await submit.click();
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
      ),
    );
  await host.getByRole("button", { name: "Configure Risky Exchange" }).click();
  await guest.getByRole("button", { name: "Ready for race" }).click();
  await host.getByRole("button", { name: "Ready for race" }).click();
  await host.getByRole("button", { name: "Open programming console" }).click();
  await guest.getByRole("button", { name: "Open programming console" }).click();
  await stayActiveInDockOrder([host, guest]);
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
