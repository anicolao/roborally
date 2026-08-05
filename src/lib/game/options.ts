import { OPTION_CARDS, type OptionCardId } from './option-manifest';
import { createPrng } from './setup';

export interface OwnedOption {
  cardId: OptionCardId;
  spent: number;
  storedProgramCardId: string | null;
}

export interface OptionDeckState {
  drawPile: OptionCardId[];
  discardPile: OptionCardId[];
}

export interface OptionActivation {
  cardId: OptionCardId;
  register: 1 | 2 | 3 | 4 | 5 | null;
  mode: string;
  targetUid: string | null;
  targetOptionId: OptionCardId | null;
  programCardId?: string | null;
  pairedAction?: string | null;
  direction?: string | null;
}

export interface OptionTurnPlan {
  kind: 'option-plan';
  activations: OptionActivation[];
}

export function createOptionDeck(seed: string): OptionDeckState {
  const random = createPrng(`${seed}:option-deck`);
  const drawPile = OPTION_CARDS.map(({ id }) => id);
  for (let index = drawPile.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [drawPile[index], drawPile[selected]] = [drawPile[selected], drawPile[index]];
  }
  return { drawPile, discardPile: [] };
}

export function cloneOptionDeck(deck: OptionDeckState): OptionDeckState {
  return {
    drawPile: [...deck.drawPile],
    discardPile: [...deck.discardPile]
  };
}

export function drawOption(deck: OptionDeckState): OwnedOption | null {
  const cardId = deck.drawPile.shift();
  return cardId ? { cardId, spent: 0, storedProgramCardId: null } : null;
}

export function discardOwnedOption(
  options: OwnedOption[],
  deck: OptionDeckState,
  cardId: OptionCardId
): boolean {
  const index = options.findIndex((option) => option.cardId === cardId);
  if (index < 0) return false;
  const [discarded] = options.splice(index, 1);
  deck.discardPile.push(discarded.cardId);
  return true;
}

export function validateOptionPlan(
  owned: readonly OwnedOption[],
  plan: OptionTurnPlan
): string[] {
  const diagnostics: string[] = [];
  const ownedIds = new Set(owned.map(({ cardId }) => cardId));
  for (const activation of plan.activations) {
    if (!ownedIds.has(activation.cardId)) {
      diagnostics.push(`activation-not-owned:${activation.cardId}`);
    }
    if (
      activation.register !== null &&
      (!Number.isInteger(activation.register) ||
        activation.register < 1 ||
        activation.register > 5)
    ) {
      diagnostics.push(`invalid-register:${activation.cardId}`);
    }
    if (activation.targetUid !== null && activation.targetUid.length === 0) {
      diagnostics.push(`invalid-target:${activation.cardId}`);
    }
  }
  return diagnostics;
}

export function optionPlanFor(
  plans: Readonly<Record<string, OptionTurnPlan>>,
  uid: string
): OptionTurnPlan {
  return (
    plans[uid] ?? {
      kind: 'option-plan',
      activations: []
    }
  );
}
