import { compilePlayableCourse } from './playable-courses';
import type { Direction } from './course-manifest';
import type { RaceSetup } from './setup';

export type CaptureSetupChoice =
  | { kind: 'home-board'; boardInstanceId: string }
  | { kind: 'deployment'; x: number; y: number; facing: Direction };

export function captureDeploymentCells(boardInstanceId: string) {
  const course = compilePlayableCourse('capture-the-flag');
  const placement = course.course.boardPlacements.find(({ instanceId }) => instanceId === boardInstanceId);
  if (!placement) return [];
  const leftBoard = placement.origin[0] === 1;
  return [...course.cells.values()].filter((cell) => cell.boardInstanceId === boardInstanceId &&
    (leftBoard ? cell.x <= 6 : cell.x >= 19) && !cell.elements.some(({ kind }) => kind === 'pit'));
}

export function captureDeployingTeam(setup: RaceSetup): string | null {
  const capture = setup.capture;
  if (!capture || Object.keys(capture.homeBoards).length !== 2) return null;
  const pending = setup.players.filter(({ uid }) => !capture.deployedUids.includes(uid));
  return pending.find(({ teamId }) => teamId === capture.coinWinner)?.teamId ?? pending[0]?.teamId ?? null;
}

export function chooseCaptureSetup(current: RaceSetup, actorUid: string, choice: CaptureSetupChoice): RaceSetup | null {
  const capture = current.capture;
  const player = current.players.find(({ uid }) => uid === actorUid);
  if (!capture || !player?.teamId) return null;
  const next: RaceSetup = { ...current, capture: { ...capture, homeBoards: { ...capture.homeBoards }, deployedUids: [...capture.deployedUids] },
    players: current.players.map((robot) => ({ ...robot, position: { ...robot.position }, archive: { ...robot.archive } })) };
  if (choice.kind === 'home-board') {
    const boards = compilePlayableCourse(current.courseId).course.boardPlacements.map(({ instanceId }) => instanceId);
    if (player.teamId !== capture.coinWinner || Object.keys(capture.homeBoards).length || !boards.includes(choice.boardInstanceId)) return null;
    const otherTeam = current.players.find(({ teamId }) => teamId !== player.teamId)!.teamId!;
    next.capture!.homeBoards = { [player.teamId]: choice.boardInstanceId, [otherTeam]: boards.find((id) => id !== choice.boardInstanceId)! };
  } else if (choice.kind === 'deployment') {
    if (player.teamId !== captureDeployingTeam(current) || capture.deployedUids.includes(actorUid) ||
        !['north', 'east', 'south', 'west'].includes(choice.facing) ||
        !captureDeploymentCells(capture.homeBoards[player.teamId]).some(({ x, y }) => x === choice.x && y === choice.y) ||
        current.players.some(({ uid, position }) => capture.deployedUids.includes(uid) && position.x === choice.x && position.y === choice.y)) return null;
    const robot = next.players.find(({ uid }) => uid === actorUid)!;
    robot.position = { x: choice.x, y: choice.y };
    robot.archive = { ...robot.position };
    robot.facing = choice.facing;
    next.capture!.deployedUids.push(actorUid);
  } else return null;
  return next;
}
