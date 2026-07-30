export const PROGRAM_MANIFEST_VERSION = 'program-avalon-hill-2005-v1';

export type ProgramAction =
  | 'u-turn'
  | 'rotate-right'
  | 'rotate-left'
  | 'back-up'
  | 'move-1'
  | 'move-2'
  | 'move-3';

export interface ProgramCard {
  id: `program-${number}`;
  action: ProgramAction;
  priority: number;
}

function cards(action: ProgramAction, priorities: readonly number[]): ProgramCard[] {
  return priorities.map((priority) => ({
    id: `program-${priority}` as const,
    action,
    priority
  }));
}

function range(start: number, end: number, step = 10): number[] {
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => {
    return start + index * step;
  });
}

/**
 * Independently checked against the priority lists and card inventory in the
 * 2005 Avalon Hill rulebook. IDs deliberately use the printed priority because
 * every priority in this edition is unique.
 */
export const PROGRAM_CARDS: readonly ProgramCard[] = Object.freeze([
  ...cards('u-turn', range(10, 60)),
  ...cards('rotate-right', range(70, 410, 20)),
  ...cards('rotate-left', range(80, 420, 20)),
  ...cards('back-up', range(430, 480)),
  ...cards('move-1', range(490, 660)),
  ...cards('move-2', range(670, 780)),
  ...cards('move-3', range(790, 840))
]);

export const PROGRAM_MANIFEST = Object.freeze({
  sourceEdition: 'avalon-hill-2005',
  manifestVersion: PROGRAM_MANIFEST_VERSION,
  reviewStatus: 'reviewed-two-pass',
  provenance: [
    'Robo Rally 2005 rulebook, Program Card priority inventory',
    'Independent count/range transcription and generated-deck comparison'
  ],
  cards: PROGRAM_CARDS
});
