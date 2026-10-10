import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextComputerAction } from './computer-controller';
import { emptyRoomState, type RoomPlayer } from './room-model';
import { deriveRaceSetup, riskyExchangeConfig } from './game/setup';
import { createProgrammingState } from './game/programming';
import { createRaceRobotPositions, type ProgramResolution } from './game/movement';
import type { FirebaseServices } from './firebase';
import * as service from './room-service';
const player: RoomPlayer = { uid: 'bot', computerOwnerUid: 'host', name: 'Computer Bit', robotId: 'bit', seat: 2 };
function fixture() {
  const state = emptyRoomState();
  state.players = [{ uid: 'host', name: 'Ada', robotId: 'axle', seat: 1 }, player];
  state.configuration = riskyExchangeConfig('BOT-DECISION');
  state.configurationEventId = 'config';
  state.setup = deriveRaceSetup(state.players, state.configuration);
  state.programming = createProgrammingState(state.setup, state.configuration);
  state.programming.players.forEach((hand) => hand.submitted = true);
  return state;
}
afterEach(() => vi.restoreAllMocks());
describe('computer turn control', () => {
  it('waits for the presentation barrier, then takes damage rather than hanging on an Option', async () => {
    const state = fixture();
    state.resolution = { robots: createRaceRobotPositions(state.setup!), turnNumber: 1, phase: 'awaiting-option-decision', pendingOptionDecision: { uid: 'bot', decisionId: 'damage', choices: [{ id: 'discard:shield' }, { id: 'take-damage' }] } } as ProgramResolution;
    expect(nextComputerAction(state, player)).toBeNull();
    state.revealedDecisionKey = 'option-decision:damage';
    const choose = vi.spyOn(service, 'chooseEffect').mockResolvedValue();
    const services = { db: {}, user: { uid: 'bot' } } as FirebaseServices;
    await nextComputerAction(state, player)!.run(services, 'BOT123');
    expect(choose).toHaveBeenCalledWith(services.db, services.user, 'BOT123', { kind: 'option-decision', uid: 'bot', decisionId: 'damage', choiceId: 'take-damage' }, 'turn-001', 'bot');
    const firstKey = nextComputerAction(state, player)!.key;
    state.programming!.turnId = 'turn-002';
    expect(nextComputerAction(state, player)!.key).not.toBe(firstKey);
  });
  it('chooses an available re-entry without taking over a human decision', async () => {
    const state = fixture();
    const robots = createRaceRobotPositions(state.setup!);
    const bot = robots.find(({ uid }) => uid === 'bot')!;
    bot.status = 'destroyed';
    state.resolution = { courseId: 'risky-exchange', robots, turnNumber: 1, phase: 'awaiting-reentry', nextReentryUid: 'bot' } as ProgramResolution;
    state.revealedDecisionKey = 'reentry:1:bot';
    const choose = vi.spyOn(service, 'chooseEffect').mockResolvedValue();
    await nextComputerAction(state, player)!.run({ db: {}, user: { uid: 'bot' } } as FirebaseServices, 'BOT123');
    expect(choose.mock.calls[0][3]).toMatchObject({ kind: 'reentry', x: bot.archive.x, y: bot.archive.y });
    state.resolution.nextReentryUid = 'host';
    state.revealedDecisionKey = 'reentry:1:host';
    expect(nextComputerAction(state, player)).toBeNull();
  });
});
