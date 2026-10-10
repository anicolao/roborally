import { describe, expect, it } from 'vitest';
import { PUBLISHED_COURSES } from './game/course-catalog';
import { raceConfig } from './game/setup';
import { captureDeploymentCells, captureDeployingTeam } from './game/capture-deployment';
import { replayRoom, scenarioOptionDraft, ROBOTS, ROOM_REDUCER_VERSION, ROOM_SCHEMA_VERSION, type RoomEvent } from './room-model';

function room(courseId: string, count: number) {
  const events: RoomEvent[] = [];
  const sequences = new Map<string, number>();
  function append(actorUid: string, type: RoomEvent['type'], payload: RoomEvent['payload']) {
    const clientSeq = (sequences.get(actorUid) ?? 0) + 1;
    sequences.set(actorUid, clientSeq);
    events.push({ id: `${actorUid}-${String(clientSeq).padStart(6, '0')}`, actorUid, clientSeq, type, payload,
      createdAt: events.length * 1000, schemaVersion: ROOM_SCHEMA_VERSION, reducerVersion: ROOM_REDUCER_VERSION });
    return replayRoom(events);
  }
  append('p0', 'game/created', { gameId: 'pub234', roomCode: 'PUB234', hostUid: 'p0' });
  for (let i = 0; i < count; i++) append(`p${i}`, 'player/joined', { uid: `p${i}`, name: `Player ${i}`, robotId: ROBOTS[i].id });
  const configured = append('p0', 'race/configured', { config: raceConfig(courseId, 'PUBLISHED-ROOM') });
  for (let i = 0; i < count; i++) append(`p${i}`, 'player/ready', { uid: `p${i}`, configurationEventId: configured.configurationEventId });
  return { append, state: () => replayRoom(events), events };
}

describe('published courses through real room events', () => {
  it.each(PUBLISHED_COURSES)('$name opens its hand after the published setup choices', (course) => {
    const game = room(course.id, course.players[0]);
    let state = game.state();
    expect(state.diagnostics).toEqual([]);
    expect(state.setup?.courseId).toBe(course.id);
    if (course.id === 'tricksy') {
      expect(state.programming).toBeNull();
      const draft = scenarioOptionDraft(state);
      expect(new Set(Object.values(draft).flat()).size).toBe(course.players[0] * 3);
      for (const [uid, cards] of Object.entries(draft)) state = game.append(uid, 'scenario/option-selected', { cardId: cards[1] });
      for (const player of state.programming!.players) expect(player.optionCardIds).toEqual([draft[player.uid][1]]);
    }
    if (course.id === 'capture-the-flag') {
      expect(state.programming).toBeNull();
      const setup = state.setup!;
      const captain = setup.players.find(({ teamId }) => teamId === setup.capture!.coinWinner)!;
      state = game.append(captain.uid, 'scenario/capture-chosen', { choice: { kind: 'home-board', boardInstanceId: 'vault-1' } });
      while (!state.programming) {
        const team = captureDeployingTeam(state.setup!)!;
        const player = state.setup!.players.find(({ teamId, uid }) => teamId === team && !state.setup!.capture!.deployedUids.includes(uid))!;
        const cell = captureDeploymentCells(state.setup!.capture!.homeBoards[team]).find(({ x, y }) => !state.setup!.players.some(({ position }) => position.x === x && position.y === y))!;
        state = game.append(player.uid, 'scenario/capture-chosen', { choice: { kind: 'deployment', x: cell.x, y: cell.y, facing: 'east' } });
      }
    }
    expect(state.diagnostics).toEqual([]);
    expect(state.programming?.players.length).toBe(course.players[0] * (course.id === 'interference' ? 2 : 1));
    expect(state.programming?.phase).toBe('programming');
    expect(replayRoom([...game.events].reverse())).toEqual(state);
  });

  it('Interference accepts each owner’s separate hands and rejects controlling an opponent', () => {
    const game = room('interference', 2);
    const original = game.state();
    const blocker = original.programming!.players.find(({ uid }) => uid === 'p0:blocker')!;
    const rejected = game.append('p1', 'program/submitted', { uid: blocker.uid, turnId: 'turn-001', cardIds: blocker.hand.slice(0, 5) });
    expect(rejected.programming?.players.find(({ uid }) => uid === blocker.uid)?.submitted).toBe(false);
    expect(rejected.diagnostics.at(-1)?.code).toBe('invalid-program');
    let state = rejected;
    for (const player of original.programming!.players) {
      state = game.append(player.ownerUid!, 'program/submitted', { uid: player.uid, turnId: 'turn-001', cardIds: player.hand.slice(0, 5) });
    }
    expect(state.programming?.phase).toBe('programmed');
    expect(state.resolution?.robots).toHaveLength(4);
    expect(state.diagnostics).toHaveLength(1);
  });

  it('Tricksy rejects someone else’s Option and does not deal until everyone has chosen', () => {
    const game = room('tricksy', 2);
    const draft = scenarioOptionDraft(game.state());
    let state = game.append('p0', 'scenario/option-selected', { cardId: draft.p1[0] });
    expect(state.programming).toBeNull();
    expect(state.scenarioOptions).toEqual({});
    state = game.append('p0', 'scenario/option-selected', { cardId: draft.p0[0] });
    expect(state.programming).toBeNull();
    state = game.append('p1', 'scenario/option-selected', { cardId: draft.p1[0] });
    expect(state.programming?.players.every(({ optionCardIds }) => optionCardIds?.length === 1)).toBe(true);
  });
});
