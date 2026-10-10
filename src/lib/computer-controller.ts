import { initializeComputerFirebase, type FirebaseServices } from './firebase';
import { ROBOTS, presentationDecisionAvailable, scenarioOptionDraft, type RoomState, type RoomPlayer, type EffectChosenPayload } from './room-model';
import * as service from './room-service';
import { chooseComputerProgram } from './game/computer-player';
import { compilePlayableCourse } from './game/playable-courses';
import { createRaceRobotPositions, legalReentryChoices } from './game/movement';
import { captureDeploymentCells, captureDeployingTeam } from './game/capture-deployment';
import type { TurnId } from './game/programming';

export async function addComputerPlayer(state: RoomState, host: FirebaseServices, roomCode: string) {
  if (state.hostUid !== host.user.uid || state.setup || state.players.length >= 8) return;
  const robot = ROBOTS.find((robot) => !state.players.some((player) => player.robotId === robot.id));
  if (!robot) return;
  const computer = await initializeComputerFirebase(host.user.uid, robot.id);
  const baseName = `Computer ${robot.name}`;
  let name = baseName, suffix = 2;
  while (state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) name = `${baseName} ${suffix++}`;
  await service.joinRoom(computer.db, computer.user, roomCode, { name, robotId: robot.id, computerOwnerUid: host.user.uid });
}

type Action = { key: string; run: (computer: FirebaseServices, room: string) => Promise<void> };
export function nextComputerAction(state: RoomState, player: RoomPlayer): Action | null {
  const uid = player.uid;
  const action = (key: string, run: Action['run']): Action => ({ key: `${uid}:${state.raceEpoch}:${key}`, run });
  if (state.configurationEventId && !state.setup && !state.readyPlayerUids.includes(uid)) {
    const id = state.configurationEventId;
    return action(`ready:${id}`, (s, room) => service.markReady(s.db, s.user, room, id));
  }
  if (!state.setup || state.resolution?.phase === 'race-finished') return null;
  const draft = scenarioOptionDraft(state)[uid];
  if (!state.programming && draft?.length && !state.scenarioOptions?.[uid]) {
    return action(`starting-option:${state.configurationEventId}`, (s, room) => service.selectScenarioOption(s.db, s.user, room, draft[0]));
  }
  const capture = state.setup.capture;
  if (capture && !state.programming) {
    const robot = state.setup.players.find((robot) => robot.uid === uid)!;
    if (!Object.keys(capture.homeBoards).length && robot.teamId === capture.coinWinner) {
      const boardInstanceId = compilePlayableCourse('capture-the-flag').course.boardPlacements[0].instanceId;
      return action('home-board', (s, room) => service.chooseCaptureSetup(s.db, s.user, room, { kind: 'home-board', boardInstanceId }));
    }
    if (robot.teamId === captureDeployingTeam(state.setup) && !capture.deployedUids.includes(uid)) {
      const cell = captureDeploymentCells(capture.homeBoards[robot.teamId!]).find(({ x, y }) => !state.setup!.players.some((other) => capture.deployedUids.includes(other.uid) && other.position.x === x && other.position.y === y));
      if (cell) return action('deployment', (s, room) => service.chooseCaptureSetup(s.db, s.user, room, { kind: 'deployment', x: cell.x, y: cell.y, facing: cell.x < 12 ? 'east' : 'west' }));
    }
    return null;
  }
  const robots = state.resolution?.robots ?? createRaceRobotPositions(state.setup);
  const owned = robots.filter((robot) => robot.uid === uid || robot.ownerUid === uid);
  const turnId = state.programming?.turnId ?? 'turn-001';
  const effect = (key: string, robotUid: string, choice: EffectChosenPayload['choice']) => action(key, (s, room) => service.chooseEffect(s.db, s.user, room, choice, turnId, robotUid));
  if (presentationDecisionAvailable(state)) {
    const pending = state.resolution?.pendingOptionDecision;
    if (pending && owned.some((robot) => robot.uid === pending.uid)) {
      const choice = pending.choices.find(({ id }) => id === 'decline') ?? pending.choices.find(({ id }) => id === 'take-damage') ?? pending.choices[0];
      return effect(`${turnId}:${pending.decisionId}`, pending.uid, { kind: 'option-decision', uid: pending.uid, decisionId: pending.decisionId, choiceId: choice.id });
    }
    const loss = owned.find((robot) => robot.uid === state.resolution?.nextOptionChoiceUid);
    if (loss?.options.length) return effect(`loss:${turnId}:${loss.uid}`, loss.uid, { kind: 'option-loss', cardId: loss.options[0].cardId });
    const reenter = owned.find((robot) => robot.uid === state.resolution?.nextReentryUid);
    if (reenter && state.resolution) {
      const course = compilePlayableCourse(state.setup.courseId, state.resolution.scenario, state.resolution.legacyFactoryLayout);
      const flag = course.course.flags.find((flag) => flag.number === reenter.nextFlag);
      const choices = legalReentryChoices(state.resolution, reenter.uid);
      const vectors = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
      const distance = (choice: typeof choices[number]) => flag ? Math.abs(flag.x - choice.x - vectors[choice.facing][0]) + Math.abs(flag.y - choice.y - vectors[choice.facing][1]) : 0;
      choices.sort((a, b) => distance(a) - distance(b));
      if (choices[0]) return effect(`reentry:${turnId}:${reenter.uid}`, reenter.uid, { kind: 'reentry', ...choices[0] });
    }
  }
  const power = owned.find((robot) => robot.uid === state.pendingPowerDownUid);
  if (power) {
    const turnNumber = (state.programming?.turnNumber ?? 1) + 1;
    return action(`power:${turnNumber}:${power.uid}`, (s, room) => service.respondPowerDown(s.db, s.user, room, { turnId: `turn-${String(turnNumber - 1).padStart(3, '0')}` as TurnId, powerDownNextTurn: false }, power.uid));
  }
  const programming = state.nextProgramming ?? state.programming;
  // Wait for the same playback barrier as the private controller before opening the next hand.
  if (!programming || (state.nextProgramming && !presentationDecisionAvailable(state))) return null;
  const hand = programming.players.find((hand) => !hand.submitted && (hand.uid === uid || hand.ownerUid === uid));
  if (!hand) return null;
  const robot = owned.find((robot) => robot.uid === hand.uid);
  if (!robot) return null;
  const course = compilePlayableCourse(state.setup.courseId, state.resolution?.scenario, state.resolution?.legacyFactoryLayout);
  return action(`program:${programming.turnId}:${hand.uid}`, async (s, room) => {
    const program = chooseComputerProgram(hand, robot, course);
    await service.submitProgram(s.db, s.user, room, program, programming.turnId, undefined, hand.uid);
  });
}
