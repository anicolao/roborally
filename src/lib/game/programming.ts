import { PROGRAM_CARDS, type ProgramCard } from './program-manifest';
import { createPrng, type RaceConfig, type RaceSetup } from './setup';
import type { OptionCardId } from './option-manifest';

export const PROGRAMMING_DURATION_MS = 30_000;
export const REGISTER_COUNT = 5;
export type TurnId = `turn-${string}`;

export function recompileDecisionId(turnNumber: number, uid: string) {
  return `turn-${turnNumber}-recompile-${uid}`;
}

export interface ProgramRegister {
  cardId: ProgramCard['id'] | null;
  locked: boolean;
}

export interface ProgrammingPlayer {
  uid: string;
  damage: number;
  hand: ProgramCard['id'][];
  /** Dealt cards not placed in registers; Options may consume these during execution. */
  unusedCardIds: ProgramCard['id'][];
  registers: ProgramRegister[];
  /** Cards selected in the private, editable draft before submission. */
  draftCardIds: ProgramCard['id'][];
  /** Five positional draft slots. Locked registers remain null until submission. */
  draftSlots: (ProgramCard['id'] | null)[];
  submitted: boolean;
  timedOut: boolean;
}

export interface ProgrammingState {
  turnId: TurnId;
  turnNumber: number;
  phase: 'programming' | 'programmed';
  players: ProgrammingPlayer[];
  drawPile: ProgramCard['id'][];
  currentTurnDiscard: ProgramCard['id'][];
  deadline: number | null;
  deadlinePlayerUid: string | null;
  diagnostics: string[];
}

export function handSizeForDamage(damage: number, extraMemory = false): number {
  if (!Number.isInteger(damage) || damage < 0 || damage > 9) {
    throw new Error('Damage must be an integer from zero through nine.');
  }
  return 9 - damage + (extraMemory ? 1 : 0);
}

function shuffledProgramDeck(
  config: RaceConfig,
  unavailable: ReadonlySet<ProgramCard['id']> = new Set(),
  turnNumber = 1
): ProgramCard['id'][] {
  const random = createPrng(
    turnNumber === 1
      ? config.seed
      : `${config.seed}:turn-${String(turnNumber).padStart(3, '0')}:program-deck`
  );
  if (turnNumber === 1) {
    random(); // Setup consumes the first value when selecting the first player.
  }
  const deck = PROGRAM_CARDS.map(({ id }) => id).filter((id) => !unavailable.has(id));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [deck[index], deck[selected]] = [deck[selected], deck[index]];
  }
  return deck;
}

export function createProgrammingState(
  setup: RaceSetup,
  config: RaceConfig,
  damageByUid: Readonly<Record<string, number>> = {},
  lockedRegistersByUid: Readonly<
    Record<string, Readonly<Partial<Record<1 | 2 | 3 | 4 | 5, ProgramCard['id']>>>>
  > = {},
  turnNumber = 1,
  eligibleUids: ReadonlySet<string> = new Set(setup.players.map(({ uid }) => uid)),
  optionIdsByUid: Readonly<Record<string, readonly OptionCardId[]>> = {},
  storedProgramCardIdsByUid: Readonly<Record<string, ProgramCard['id'] | null>> = {}
): ProgrammingState {
  if (!Number.isInteger(turnNumber) || turnNumber < 1) {
    throw new Error('Turn number must be a positive integer.');
  }
  const lockedCardIds = Object.values(lockedRegistersByUid).flatMap((registers) =>
    Object.values(registers)
  );
  if (new Set(lockedCardIds).size !== lockedCardIds.length) {
    throw new Error('A locked Program card cannot occupy more than one register.');
  }
  const storedCardIds = Object.values(storedProgramCardIdsByUid).filter(
    (cardId): cardId is ProgramCard['id'] => cardId !== null
  );
  const deck = shuffledProgramDeck(
    config,
    new Set([...lockedCardIds, ...storedCardIds]),
    turnNumber
  );
  const players = setup.players.filter(({ uid }) => eligibleUids.has(uid)).map(({ uid }) => {
    const damage = damageByUid[uid] ?? setup.startingDamage;
    const locked = lockedRegistersByUid[uid] ?? {};
    return {
      uid,
      damage,
      hand: [] as ProgramCard['id'][],
      unusedCardIds: [] as ProgramCard['id'][],
      registers: Array.from({ length: REGISTER_COUNT }, (_, index) => {
        const cardId = locked[(index + 1) as 1 | 2 | 3 | 4 | 5] ?? null;
        return { cardId, locked: cardId !== null };
      }),
      draftCardIds: [],
      draftSlots: Array.from({ length: REGISTER_COUNT }, () => null),
      submitted: false,
      timedOut: false
    };
  });

  const largestHand =
    players.length > 0
      ? Math.max(
          ...players.map(({ uid, damage }) =>
            handSizeForDamage(damage, optionIdsByUid[uid]?.includes('extra-memory'))
          )
        )
      : 0;
  for (let round = 0; round < largestHand; round += 1) {
    for (const player of players) {
      if (
        round >=
        handSizeForDamage(
          player.damage,
          optionIdsByUid[player.uid]?.includes('extra-memory')
        )
      ) {
        continue;
      }
      const cardId = deck.shift();
      if (!cardId) throw new Error('The shared Program deck cannot satisfy the deal.');
      player.hand.push(cardId);
    }
  }
  for (const player of players) {
    const storedCardId = storedProgramCardIdsByUid[player.uid];
    if (storedCardId) player.hand.push(storedCardId);
  }

  return {
    turnId: `turn-${String(turnNumber).padStart(3, '0')}`,
    turnNumber,
    phase: players.length === 0 ? 'programmed' : 'programming',
    players,
    drawPile: deck,
    currentTurnDiscard: [],
    deadline: players.length === 1 ? 0 : null,
    deadlinePlayerUid: players.length === 1 ? players[0].uid : null,
    diagnostics: []
  };
}

function cloneState(state: ProgrammingState): ProgrammingState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      unusedCardIds: [...player.unusedCardIds],
      registers: player.registers.map((register) => ({ ...register })),
      draftCardIds: [...player.draftCardIds],
      draftSlots: draftSlotsForPlayer(player)
    })),
    drawPile: [...state.drawPile],
    currentTurnDiscard: [...state.currentTurnDiscard],
    diagnostics: [...state.diagnostics]
  };
}

export function draftSlotsForPlayer(
  player: Pick<ProgrammingPlayer, 'registers' | 'draftCardIds' | 'draftSlots'>
): (ProgramCard['id'] | null)[] {
  if (Array.isArray(player.draftSlots) && player.draftSlots.length === REGISTER_COUNT) {
    return [...player.draftSlots];
  }
  const slots: (ProgramCard['id'] | null)[] = Array.from(
    { length: REGISTER_COUNT },
    () => null
  );
  let draftIndex = 0;
  for (const [registerIndex, register] of player.registers.entries()) {
    if (!register.locked) slots[registerIndex] = player.draftCardIds[draftIndex++] ?? null;
  }
  return slots;
}

export function draftCardIdsInRegisterOrder(
  player: Pick<ProgrammingPlayer, 'registers'>,
  slots: readonly (ProgramCard['id'] | null)[]
): ProgramCard['id'][] {
  return player.registers.flatMap((register, registerIndex) => {
    const cardId = slots[registerIndex];
    return register.locked || !cardId ? [] : [cardId];
  });
}

export function updateProgramDraft(
  current: ProgrammingState,
  actorUid: string,
  cardIds: readonly ProgramCard['id'][],
  draftSlots?: readonly (ProgramCard['id'] | null)[]
): ProgrammingState {
  const state = cloneState(current);
  const player = state.players.find(({ uid }) => uid === actorUid);
  const openRegisters = player?.registers.filter(({ locked }) => !locked) ?? [];
  const nextSlots = player
    ? draftSlots
      ? [...draftSlots]
      : (() => {
          const slots: (ProgramCard['id'] | null)[] = Array.from(
            { length: REGISTER_COUNT },
            () => null
          );
          let cardIndex = 0;
          for (const [registerIndex, register] of player.registers.entries()) {
            if (!register.locked) slots[registerIndex] = cardIds[cardIndex++] ?? null;
          }
          return slots;
        })()
    : [];
  const positionalCardIds = player ? draftCardIdsInRegisterOrder(player, nextSlots) : [];
  if (
    state.phase !== 'programming' ||
    !player ||
    player.submitted ||
    nextSlots.length !== REGISTER_COUNT ||
    player.registers.some(({ locked }, index) => locked && nextSlots[index] !== null) ||
    cardIds.length > openRegisters.length ||
    positionalCardIds.length !== cardIds.length ||
    positionalCardIds.some((cardId, index) => cardId !== cardIds[index]) ||
    new Set(positionalCardIds).size !== positionalCardIds.length ||
    positionalCardIds.some((cardId) => !player.hand.includes(cardId))
  ) {
    state.diagnostics.push(`invalid-program-draft:${actorUid}`);
    return state;
  }
  player.draftCardIds = positionalCardIds;
  player.draftSlots = nextSlots;
  return state;
}

export function recompileProgramHand(
  current: ProgrammingState,
  actorUid: string,
  seed: string
): ProgrammingState {
  const state = cloneState(current);
  const player = state.players.find(({ uid }) => uid === actorUid);
  if (state.phase !== 'programming' || !player || player.submitted) {
    state.diagnostics.push(`invalid-recompile:${actorUid}`);
    return state;
  }

  const pool = [...state.drawPile, ...player.hand];
  const random = createPrng(`${seed}:${state.turnId}:recompile:${actorUid}`);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [pool[index], pool[selected]] = [pool[selected], pool[index]];
  }
  const handSize = player.hand.length;
  player.hand = pool.splice(0, handSize);
  player.draftCardIds = [];
  player.draftSlots = Array.from({ length: REGISTER_COUNT }, () => null);
  state.drawPile = pool;
  return state;
}

function closeProgrammingIfComplete(state: ProgrammingState) {
  if (!state.players.every(({ submitted }) => submitted)) return;
  state.phase = 'programmed';
  state.deadline = null;
  state.deadlinePlayerUid = null;
}

function placeProgram(
  state: ProgrammingState,
  player: ProgrammingPlayer,
  cardIds: readonly ProgramCard['id'][],
  timedOut: boolean
) {
  const openRegisters = player.registers.filter(({ locked }) => !locked);
  if (cardIds.length !== openRegisters.length || new Set(cardIds).size !== cardIds.length) {
    state.diagnostics.push(`invalid-program:${player.uid}`);
    return false;
  }
  if (cardIds.some((cardId) => !player.hand.includes(cardId))) {
    state.diagnostics.push(`card-not-in-hand:${player.uid}`);
    return false;
  }

  let cardIndex = 0;
  for (const register of player.registers) {
    if (!register.locked) register.cardId = cardIds[cardIndex++];
  }
  player.unusedCardIds = player.hand.filter((cardId) => !cardIds.includes(cardId));
  state.currentTurnDiscard.push(...player.unusedCardIds);
  player.hand = [];
  player.draftCardIds = [];
  player.draftSlots = Array.from({ length: REGISTER_COUNT }, () => null);
  player.submitted = true;
  player.timedOut = timedOut;
  return true;
}

export function submitProgram(
  current: ProgrammingState,
  actorUid: string,
  cardIds: readonly ProgramCard['id'][],
  createdAt: number
): ProgrammingState {
  const state = cloneState(current);
  if (state.phase !== 'programming') {
    state.diagnostics.push(`programming-closed:${actorUid}`);
    return state;
  }
  const player = state.players.find(({ uid }) => uid === actorUid);
  if (!player || player.submitted) {
    state.diagnostics.push(`invalid-submission:${actorUid}`);
    return state;
  }
  if (!placeProgram(state, player, cardIds, false)) return state;

  const remaining = state.players.filter(({ submitted }) => !submitted);
  if (remaining.length === 1) {
    state.deadline = createdAt + PROGRAMMING_DURATION_MS;
    state.deadlinePlayerUid = remaining[0].uid;
  }
  closeProgrammingIfComplete(state);
  return state;
}

export function timeOutProgram(
  current: ProgrammingState,
  targetUid: string,
  createdAt: number,
  seed: string,
  preservedCardIds: readonly ProgramCard['id'][] = []
): ProgrammingState {
  const state = cloneState(current);
  const target = state.players.find(({ uid }) => uid === targetUid);
  if (
    state.phase !== 'programming' ||
    !target ||
    target.submitted ||
    state.deadlinePlayerUid !== targetUid ||
    state.deadline === null ||
    createdAt < state.deadline
  ) {
    state.diagnostics.push(`invalid-timeout:${targetUid}`);
    return state;
  }

  // Draft updates are persisted separately from the timeout claim. They are
  // authoritative for both an owner- and opponent-claimed timeout; the payload
  // remains accepted for replaying older rooms.
  const persistedDraftSlots = draftSlotsForPlayer(target);
  const effectiveDraftSlots = persistedDraftSlots.some(Boolean)
    ? persistedDraftSlots
    : (() => {
        const slots: (ProgramCard['id'] | null)[] = Array.from(
          { length: REGISTER_COUNT },
          () => null
        );
        let preservedIndex = 0;
        for (const [registerIndex, register] of target.registers.entries()) {
          if (!register.locked) slots[registerIndex] = preservedCardIds[preservedIndex++] ?? null;
        }
        return slots;
      })();
  const effectivePreservedCardIds = draftCardIdsInRegisterOrder(target, effectiveDraftSlots);
  const needed = target.registers.filter(({ locked }) => !locked).length;
  if (
    effectivePreservedCardIds.length > needed ||
    new Set(effectivePreservedCardIds).size !== effectivePreservedCardIds.length ||
    effectivePreservedCardIds.some((cardId) => !target.hand.includes(cardId))
  ) {
    state.diagnostics.push(`invalid-timeout-program:${targetUid}`);
    return state;
  }

  // Anonymous Firebase UIDs differ between otherwise identical runs. Deal order is
  // Dock order, so it is the canonical stable identity for timeout randomization.
  const targetDealIndex = state.players.indexOf(target);
  const random = createPrng(`${seed}:${state.turnId}:timeout:dock-${targetDealIndex + 1}`);
  const preserved = new Set(effectivePreservedCardIds);
  const available = target.hand.filter((cardId) => !preserved.has(cardId));
  for (let index = available.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [available[index], available[selected]] = [available[selected], available[index]];
  }
  const randomFill = available.slice(0, needed - effectivePreservedCardIds.length);
  let fillIndex = 0;
  const completedCardIds = target.registers.flatMap((register, registerIndex) => {
    if (register.locked) return [];
    return [effectiveDraftSlots[registerIndex] ?? randomFill[fillIndex++]];
  });
  placeProgram(state, target, completedCardIds, true);
  closeProgrammingIfComplete(state);
  return state;
}

export function programCardZones(state: ProgrammingState): Map<ProgramCard['id'], string> {
  const zones = new Map<ProgramCard['id'], string>();
  for (const cardId of state.drawPile) zones.set(cardId, 'draw-pile');
  for (const cardId of state.currentTurnDiscard) zones.set(cardId, 'current-turn-discard');
  for (const player of state.players) {
    for (const cardId of player.hand) zones.set(cardId, `hand:${player.uid}`);
    for (const [index, register] of player.registers.entries()) {
      if (register.cardId) zones.set(register.cardId, `register:${player.uid}:${index + 1}`);
    }
  }
  return zones;
}

export function previewProgram(
  player: ProgrammingPlayer,
  cardIds: readonly ProgramCard['id'][]
): string[] {
  const cards = new Map(PROGRAM_CARDS.map((card) => [card.id, card]));
  return cardIds.map((cardId) => {
    const card = cards.get(cardId);
    if (!card || !player.hand.includes(cardId)) return 'Unavailable card';
    return `${card.action} (${card.priority}); board elements and robots excluded`;
  });
}
