// Minimal accepted event prefix from LB49CR immediately before Justin's turn-5
// re-entry. Draft and presentation-only events are intentionally omitted.
export const LB49CR_SOURCE_UIDS = {
  table: 'xXSAJ6x2zrQdQGc8nGEJpoLh2fB2',
  alex: 'n0ZftM2rjOXr7iHGjwdRMTMtmtg1',
  anna: 'b7WtQSpCmcVjepZjnrVkdpRC6Ty2',
  justin: 'SRiLz7rk4PaFkHAr9I44VkNqJcf2'
} as const;

export type FixtureActor = keyof typeof LB49CR_SOURCE_UIDS;

export interface ReentryFixtureEvent {
  actor: FixtureActor;
  type: string;
  payload: Record<string, unknown>;
}

export const LB49CR_REENTRY_PREFIX: readonly ReentryFixtureEvent[] = [
  { actor: 'table', type: 'game/created', payload: { hostUid: LB49CR_SOURCE_UIDS.table, gameId: 'lb49cr', roomCode: 'LB49CR' } },
  { actor: 'alex', type: 'player/joined', payload: { name: 'Alex', robotId: 'axle', uid: LB49CR_SOURCE_UIDS.alex, seat: 5 } },
  { actor: 'anna', type: 'player/joined', payload: { name: 'Anna', robotId: 'bit', uid: LB49CR_SOURCE_UIDS.anna, seat: 4 } },
  { actor: 'justin', type: 'player/joined', payload: { uid: LB49CR_SOURCE_UIDS.justin, seat: 1, robotId: 'cog', name: 'Justin' } },
  {
    actor: 'table',
    type: 'race/configured',
    payload: {
      config: {
        courseManifestVersion: 'courses-avalon-hill-2005-complete-v1',
        programManifestVersion: 'program-avalon-hill-2005-v1',
        optionManifestVersion: 'avalon-hill-2005-options-v1',
        courseId: 'option-world',
        expansionIds: [],
        reducerVersion: 'race-v1',
        prngVersion: 'xorshift32-v1',
        editionId: 'avalon-hill-2005',
        houseRuleIds: [],
        lives: 3,
        boardManifestVersion: 'boards-avalon-hill-2005-complete-v3',
        seed: 'LB49CR'
      }
    }
  },
  { actor: 'alex', type: 'player/ready', payload: { configurationEventId: `${LB49CR_SOURCE_UIDS.table}-000002`, uid: LB49CR_SOURCE_UIDS.alex } },
  { actor: 'justin', type: 'player/ready', payload: { uid: LB49CR_SOURCE_UIDS.justin, configurationEventId: `${LB49CR_SOURCE_UIDS.table}-000002` } },
  { actor: 'anna', type: 'player/ready', payload: { uid: LB49CR_SOURCE_UIDS.anna, configurationEventId: `${LB49CR_SOURCE_UIDS.table}-000002` } },
  { actor: 'alex', type: 'program/submitted', payload: { uid: LB49CR_SOURCE_UIDS.alex, cardIds: ['program-640', 'program-310', 'program-010', 'program-720', 'program-130'], turnId: 'turn-001' } },
  { actor: 'anna', type: 'program/submitted', payload: { cardIds: ['program-050', 'program-470', 'program-210', 'program-090', 'program-760'], uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-001' } },
  { actor: 'justin', type: 'program/submitted', payload: { uid: LB49CR_SOURCE_UIDS.justin, cardIds: ['program-690', 'program-070', 'program-590', 'program-540', 'program-200'], turnId: 'turn-001' } },
  { actor: 'alex', type: 'program/submitted', payload: { uid: LB49CR_SOURCE_UIDS.alex, cardIds: ['program-810', 'program-480', 'program-640', 'program-120', 'program-290'], turnId: 'turn-002' } },
  { actor: 'justin', type: 'program/submitted', payload: { turnId: 'turn-002', uid: LB49CR_SOURCE_UIDS.justin, cardIds: ['program-540', 'program-630', 'program-060', 'program-160', 'program-100'] } },
  { actor: 'anna', type: 'program/submitted', payload: { uid: LB49CR_SOURCE_UIDS.anna, cardIds: ['program-800', 'program-830', 'program-070', 'program-600', 'program-570'], turnId: 'turn-002' } },
  { actor: 'anna', type: 'power-down/responded', payload: { uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-002', powerDownNextTurn: false } },
  { actor: 'alex', type: 'program/submitted', payload: { turnId: 'turn-003', cardIds: ['program-790', 'program-730', 'program-660', 'program-270', 'program-470'], uid: LB49CR_SOURCE_UIDS.alex } },
  { actor: 'anna', type: 'program/submitted', payload: { cardIds: ['program-310', 'program-640', 'program-080', 'program-430'], uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-003' } },
  { actor: 'anna', type: 'power-down/responded', payload: { turnId: 'turn-003', powerDownNextTurn: true, uid: LB49CR_SOURCE_UIDS.anna } },
  { actor: 'justin', type: 'program/submitted', payload: { turnId: 'turn-003', uid: LB49CR_SOURCE_UIDS.justin, cardIds: ['program-710', 'program-820', 'program-650', 'program-420', 'program-630'] } },
  { actor: 'anna', type: 'effect/chosen', payload: { uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-003', choice: { decisionId: `r3-damage-01-${LB49CR_SOURCE_UIDS.anna}`, uid: LB49CR_SOURCE_UIDS.anna, choiceId: 'take-damage', kind: 'option-decision' } } },
  { actor: 'alex', type: 'effect/chosen', payload: { uid: LB49CR_SOURCE_UIDS.alex, choice: { uid: LB49CR_SOURCE_UIDS.alex, choiceId: 'take-damage', decisionId: `r4-damage-01-${LB49CR_SOURCE_UIDS.alex}`, kind: 'option-decision' }, turnId: 'turn-003' } },
  { actor: 'alex', type: 'effect/chosen', payload: { uid: LB49CR_SOURCE_UIDS.alex, choice: { uid: LB49CR_SOURCE_UIDS.alex, choiceId: 'discard:ramming-gear', decisionId: `r5-damage-01-${LB49CR_SOURCE_UIDS.alex}`, kind: 'option-decision' }, turnId: 'turn-003' } },
  { actor: 'alex', type: 'program/submitted', payload: { turnId: 'turn-004', uid: LB49CR_SOURCE_UIDS.alex, cardIds: ['program-060', 'program-050', 'program-090', 'program-210', 'program-150'] } },
  { actor: 'alex', type: 'power-down/responded', payload: { uid: LB49CR_SOURCE_UIDS.alex, turnId: 'turn-004', powerDownNextTurn: false } },
  { actor: 'justin', type: 'program/submitted', payload: { uid: LB49CR_SOURCE_UIDS.justin, cardIds: ['program-400', 'program-610', 'program-110', 'program-530', 'program-680'], turnId: 'turn-004' } },
  { actor: 'justin', type: 'power-down/responded', payload: { powerDownNextTurn: false, turnId: 'turn-004', uid: LB49CR_SOURCE_UIDS.justin } },
  { actor: 'anna', type: 'power-down/responded', payload: { uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-004', powerDownNextTurn: false } },
  { actor: 'anna', type: 'effect/chosen', payload: { uid: LB49CR_SOURCE_UIDS.anna, choice: { kind: 'option-decision', uid: LB49CR_SOURCE_UIDS.anna, choiceId: 'discard:pressor-beam', decisionId: `r5-damage-01-${LB49CR_SOURCE_UIDS.anna}` }, turnId: 'turn-004' } },
  { actor: 'anna', type: 'program/submitted', payload: { cardIds: ['program-110', 'program-770', 'program-030', 'program-070', 'program-840'], uid: LB49CR_SOURCE_UIDS.anna, turnId: 'turn-005' } },
  { actor: 'alex', type: 'program/submitted', payload: { cardIds: ['program-390', 'program-760', 'program-500', 'program-420', 'program-140'], uid: LB49CR_SOURCE_UIDS.alex, turnId: 'turn-005' } },
  { actor: 'alex', type: 'power-down/responded', payload: { uid: LB49CR_SOURCE_UIDS.alex, turnId: 'turn-005', powerDownNextTurn: true } },
  { actor: 'justin', type: 'program/submitted', payload: { turnId: 'turn-005', uid: LB49CR_SOURCE_UIDS.justin, cardIds: ['program-680', 'program-550', 'program-040', 'program-560', 'program-640'] } },
  { actor: 'justin', type: 'power-down/responded', payload: { powerDownNextTurn: false, turnId: 'turn-005', uid: LB49CR_SOURCE_UIDS.justin } }
];
