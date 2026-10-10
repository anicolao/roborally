import { describe, expect, it } from 'vitest';
import { PUBLISHED_COURSES, LEGACY_COMPLETE_COURSE_MANIFEST_VERSION } from './course-catalog';
import { compilePlayableCourse } from './playable-courses';
import { deriveRaceSetup, raceConfig } from './setup';
import { createRaceRobotPositions, resolveLaserSnapshot } from './movement';
import { createProgrammingState } from './programming';
import { resolveProgrammedTurn, resolveFlagsAndArchives, courseHasPit, type ResolutionTraceEntry } from './movement';
import { openCourseProgramming, submitProgram, timeOutProgram, updateProgramDraft } from './programming';
import { applyProgramCard, beginNextTurnPowerDowns } from './movement';
import { PROGRAM_CARDS } from './program-manifest';
import { chooseCaptureSetup, captureDeploymentCells, captureDeployingTeam } from './capture-deployment';
import type { ScenarioState } from './scenario-state';

const dockedCourses = PUBLISHED_COURSES.filter(({ boardPlacements }) =>
  boardPlacements.some(({ boardId }) => boardId.startsWith('docking-bay-'))
);

describe('published scenario setup', () => {
  it.each(dockedCourses)('$name starts every robot on its dock facing into the factory', (course) => {
    const players = Array.from({ length: course.players.at(-1)! }, (_, index) => ({
      uid: `player-${index}`, name: `Player ${index + 1}`, robotId: `robot-${index}`
    }));
    const setup = deriveRaceSetup(players, raceConfig(course.id, 'PUBLISHED-SETUP'));
    const compiled = compilePlayableCourse(course.id);
    const dockingBay = course.boardPlacements.find(({ boardId }) => boardId.startsWith('docking-bay-'))!;
    const expectedFacing = ['north', 'east', 'south', 'west'][dockingBay.rotation];
    expect(setup.players).toHaveLength(players.length * (course.id === 'interference' ? 2 : 1));
    for (const player of setup.players) {
      expect(player.facing).toBe(expectedFacing);
      expect(compiled.cells.get(`${player.position.x},${player.position.y}`)?.elements)
        .toContainEqual({ kind: 'dock', number: player.dock });
      expect(player.archive).toEqual(player.position);
      const [dx, dy] = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }[player.facing];
      const forwardCell = Array.from({ length: 4 }, (_, step) => compiled.cells.get(
        `${player.position.x + dx * (step + 1)},${player.position.y + dy * (step + 1)}`
      )).find((cell) => cell && cell.boardInstanceId !== dockingBay.instanceId);
      expect(forwardCell, `${course.name}: Dock ${player.dock} should face a factory board`).toBeDefined();
    }
  });
});


describe('Set to Kill', () => {
  it.each([false, true])('doubles robot laser damage, including Double-Barrel Laser (%s)', (doubleBarrel) => {
    const config = raceConfig('set-to-kill', 'LASER-COURSE');
    const setup = deriveRaceSetup(Array.from({ length: 5 }, (_, index) => ({ uid: `p${index}`, name: `P${index}`, robotId: `r${index}` })), config);
    const robots = createRaceRobotPositions(setup).slice(0, 2);
    Object.assign(robots[0], { x: 1, y: 8, facing: 'east' });
    Object.assign(robots[1], { x: 2, y: 8, facing: 'north' });
    if (doubleBarrel) robots[0].options.push({ cardId: 'double-barrel-laser', spent: 0, storedProgramCardId: null });
    const result = resolveLaserSnapshot(robots, 1, [], createProgrammingState(setup, config), [], undefined, {}, {}, compilePlayableCourse(config.courseId));
    expect(robots[1].damage).toBe(doubleBarrel ? 4 : 2);
    expect(result.laserBeams[0].beamCount).toBe(doubleBarrel ? 4 : 2);
  });
});


describe('published layouts and turn execution', () => {
  it.each(dockedCourses)('$name compiles its flags and resolves an ordinary programmed turn', (course) => {
    const config = raceConfig(course.id, 'PUBLISHED-TURN');
    const setup = deriveRaceSetup(Array.from({ length: course.players[0] }, (_, i) => ({ uid: `p${i}`, name: `P${i}`, robotId: `r${i}` })), config);
    const compiled = compilePlayableCourse(course.id);
    for (const flag of course.flags) {
      expect(compiled.cells.has(`${flag.x},${flag.y}`)).toBe(true);
      expect(courseHasPit(flag.x, flag.y, compiled), `${course.name}: Flag ${flag.number} is in a pit`).toBe(false);
    }
    let programming = createProgrammingState(setup, config);
    for (const player of programming.players) programming = submitProgram(programming, player.uid, player.hand.slice(0, 5), 1000);
    const result = resolveProgrammedTurn(programming, setup)!;
    expect(result.robots).toHaveLength(setup.players.length);
    expect(result.playback.frames.some(({ register }) => register === 5)).toBe(true);
  });
});

describe('published programming clocks', () => {
  it.each([['ball-lightning', 30_000], ['tight-collar', 60_000]] as const)('%s gives everyone one deadline and preserves their drafts on expiry', (courseId, duration) => {
    const config = raceConfig(courseId, 'CLOCK');
    const setup = deriveRaceSetup(Array.from({ length: 3 }, (_, i) => ({ uid: `p${i}`, name: `P${i}`, robotId: `r${i}` })), config);
    let state = openCourseProgramming(createProgrammingState(setup, config), 1000);
    const deadline = 1000 + duration;
    expect(state.deadline).toBe(deadline);
    expect(openCourseProgramming(state, 5000).deadline).toBe(deadline);
    state = submitProgram(state, state.players[0].uid, state.players[0].hand.slice(0, 5), 2000);
    expect(state.deadline).toBe(deadline);
    const target = state.players[1];
    const preserved = target.hand[0];
    state = updateProgramDraft(state, target.uid, [preserved]);
    expect(timeOutProgram(state, target.uid, deadline - 1, config.seed).players[1].submitted).toBe(false);
    state = timeOutProgram(state, target.uid, deadline, config.seed);
    expect(state.players[1].registers[0].cardId).toBe(preserved);
    expect(state.deadline).toBe(deadline);
    state = timeOutProgram(state, state.deadlinePlayerUid!, deadline, config.seed);
    expect(state.phase).toBe('programmed');
  });
});

describe('team flag progress', () => {
  it.each(['tandem-carnage', 'all-for-one-or-one-for-all'])('%s credits the correct teammates', (courseId) => {
    const setup = deriveRaceSetup(Array.from({ length: 4 }, (_, i) => ({ uid: `p${i}`, name: `P${i}`, robotId: `r${i}` })), raceConfig(courseId, 'TEAMS'));
    const robots = createRaceRobotPositions(setup);
    const course = compilePlayableCourse(courseId);
    const actor = robots[0];
    const teammate = robots.find((robot) => robot.uid !== actor.uid && robot.teamId === actor.teamId)!;
    const flag = course.course.flags[0];
    Object.assign(actor, { x: flag.x, y: flag.y });
    resolveFlagsAndArchives(robots, 1, [], [...course.cells.values()], course.course.flags, course);
    expect(actor.touchedFlags).toEqual([1]);
    expect(teammate.touchedFlags).toEqual(courseId === 'tandem-carnage' ? [1] : []);
    expect(robots.filter(({ teamId }) => teamId !== actor.teamId).every(({ touchedFlags }) => touchedFlags.length === 0)).toBe(true);
  });
});


function quietCourse(courseId: string) {
  const course = PUBLISHED_COURSES.find(({ id }) => id === courseId)!;
  const config = raceConfig(courseId, 'SCENARIO-RULES');
  let setup = deriveRaceSetup(Array.from({ length: course.players[0] }, (_, i) => ({ uid: `p${i}`, name: `P${i}`, robotId: `r${i}` })), config);
  if (setup.capture) {
    setup = chooseCaptureSetup(setup, setup.firstPlayerUid, { kind: 'home-board', boardInstanceId: 'chop-shop-1' })!;
    while (captureDeployingTeam(setup)) {
      const team = captureDeployingTeam(setup);
      const player = setup.players.find(({ teamId, uid }) => teamId === team && !setup.capture!.deployedUids.includes(uid))!;
      const cell = captureDeploymentCells(setup.capture!.homeBoards[player.teamId!]).find(({ x, y }) => !setup.players.some(({ position }) => position.x === x && position.y === y))!;
      setup = chooseCaptureSetup(setup, player.uid, { kind: 'deployment', x: cell.x, y: cell.y, facing: 'north' })!;
    }
  }
  const robots = createRaceRobotPositions(setup).map((robot) => ({ ...robot, poweredDown: true }));
  const programming = createProgrammingState(setup, config, {}, {}, 1, new Set());
  return { config, setup, robots, programming };
}

describe('persistent scenario rules in the turn resolver', () => {
  it('Moving Targets conveys all four flags and records their positions in playback', () => {
    const { setup, robots, programming } = quietCourse('moving-targets');
    const result = resolveProgrammedTurn(programming, setup, robots)!;
    const frame = result.playback.frames.find(({ register, stage }) => register === 1 && stage === 'conveyors')!;
    expect(frame.scenario!.flags.map(({ x, y }) => [x, y])).toEqual([[2, 2], [10, 11], [11, 6], [2, 6]]);
    expect(result.initialScenario!.flags[0]).toMatchObject({ x: 2, y: 1 });
    expect(result.scenario!.flags).not.toEqual(result.initialScenario!.flags);
    expect(resolveProgrammedTurn(programming, setup, robots)).toEqual(result);
  });

  it('Frenetic Factory records seeded rotations without rotating robot or flag coordinates', () => {
    const { setup, robots, programming } = quietCourse('frenetic-factory');
    Object.assign(robots[0], { x: 5, y: 7 });
    const result = resolveProgrammedTurn(programming, setup, robots)!;
    const rotations = result.playback.frames.filter(({ stage, scenario }) => stage === 'checkpoints' && Object.values(scenario?.boardRotations ?? {}).some(Boolean));
    expect(rotations.length).toBeGreaterThan(0);
    expect(rotations[0].robots[0]).toMatchObject({ x: 5, y: 7 });
    expect(rotations[0].scenario!.flags).toEqual(result.initialScenario!.flags);
    expect(resolveProgrammedTurn(programming, setup, robots)).toEqual(result);
    expect(robots[0].touchedFlags).toEqual([]);
  });

  it('Toggle Boggle retains control and wins when a team holds every flag in any order', () => {
    const { setup, robots, programming } = quietCourse('toggle-boggle');
    const team = robots[0].teamId!;
    const teammates = robots.filter(({ teamId }) => teamId === team);
    Object.assign(teammates[0], { x: 10, y: 3 });
    Object.assign(teammates[1], { x: 10, y: 10 });
    const scenario: ScenarioState = { flags: [...compilePlayableCourse(setup.courseId).course.flags], boardRotations: {}, flagControl: { 1: team } };
    const result = resolveProgrammedTurn(programming, setup, robots, undefined, {}, {}, scenario)!;
    expect(result.phase).toBe('race-finished');
    expect(result.winnerUids.sort()).toEqual(teammates.map(({ uid }) => uid).sort());
    expect(Object.values(result.scenario!.flagControl)).toEqual([team, team, team]);
    expect(scenario.flagControl).toEqual({ 1: team });
  });

  it('Toggle Boggle skips a complete turn before a destroyed robot re-enters', () => {
    const { setup, robots, programming, config } = quietCourse('toggle-boggle');
    const target = robots[0];
    Object.assign(target, { x: 1, y: 1, facing: 'west', poweredDown: false });
    applyProgramCard(robots, target.uid, PROGRAM_CARDS.find(({ action }) => action === 'move-1')!, 1, [], undefined, compilePlayableCourse(setup.courseId));
    expect(target.reentryWaitTurns).toBe(1);
    const first = resolveProgrammedTurn(programming, setup, robots)!;
    expect(first.nextReentryUid).toBeNull();
    const next = beginNextTurnPowerDowns(first.robots).map((robot) => ({ ...robot, poweredDown: true }));
    const second = resolveProgrammedTurn(createProgrammingState(setup, config, {}, {}, 2, new Set()), setup, next, first.optionDeck, {}, {}, first.scenario)!;
    expect(second.nextReentryUid).toBe(target.uid);
    expect(second.robots[0].lives).toBe(2);
  });

  it('Capture the Flag picks up an enemy flag, carries it between turns, and wins only at turn end', () => {
    const { setup, robots, programming, config } = quietCourse('capture-the-flag');
    const carrier = robots.find(({ homeBoardId }) => homeBoardId === 'chop-shop-1')!;
    Object.assign(carrier, { x: 21, y: 2 });
    const first = resolveProgrammedTurn(programming, setup, robots)!;
    expect(first.robots.find(({ uid }) => uid === carrier.uid)?.carriedFlag).toBe(2);
    expect(first.winnerUids).toEqual([]);
    const next = first.robots.map((robot) => ({ ...robot, poweredDown: true }));
    Object.assign(next.find(({ uid }) => uid === carrier.uid)!, { x: 5, y: 1 });
    const second = resolveProgrammedTurn(createProgrammingState(setup, config, {}, {}, 2, new Set()), setup, next, first.optionDeck, {}, {}, first.scenario)!;
    expect(second.phase).toBe('race-finished');
    expect(second.playback.frames.at(-1)?.register).toBe(5);
    expect(second.winnerUids).toContain(carrier.uid);
  });

  it('Capture the Flag sends a pushed invader home without losing a Life or Options', () => {
    const { setup, robots, programming } = quietCourse('capture-the-flag');
    const defender = robots.find(({ homeBoardId }) => homeBoardId === 'chop-shop-1')!;
    const invader = robots.find(({ homeBoardId }) => homeBoardId === 'vault-1')!;
    Object.assign(defender, { x: 3, y: 1, facing: 'east', poweredDown: false });
    Object.assign(invader, { x: 4, y: 1 });
    applyProgramCard(robots, defender.uid, PROGRAM_CARDS.find(({ action }) => action === 'move-1')!, 1, [], undefined, compilePlayableCourse(setup.courseId));
    const result = resolveProgrammedTurn(programming, setup, robots)!;
    expect(result.robots.find(({ uid }) => uid === invader.uid)).toMatchObject({ status: 'destroyed', captured: true, lives: 3, optionLossPending: false });
    expect(result.nextReentryUid).toBe(invader.uid);
  });

  it('Day of the SuperBot transfers the title to the robot that fires the fatal shot', () => {
    const { setup, robots, config } = quietCourse('day-of-the-superbot');
    const target = robots[0];
    const shooter = robots[1];
    Object.assign(target, { x: 2, y: 8, damage: 9, isSuperbot: true });
    Object.assign(shooter, { x: 1, y: 8, facing: 'east', poweredDown: false, isSuperbot: false });
    resolveLaserSnapshot(robots, 1, [], createProgrammingState(setup, config), [], undefined, {}, {}, compilePlayableCourse(setup.courseId));
    expect(target.status).toBe('destroyed');
    expect(target.isSuperbot).toBe(false);
    expect(shooter.isSuperbot).toBe(true);
  });
});

describe('Option World flag rewards', () => {
  it('awards one Option at turn end, even for a flag already visited', () => {
    const { setup, robots, programming } = quietCourse('option-world');
    Object.assign(robots[0], { x: 4, y: 6, touchedFlags: [1], nextFlag: 2 });
    const result = resolveProgrammedTurn(programming, setup, robots)!;
    const rewards = result.trace.filter(({ actorUid, kind }) => actorUid === robots[0].uid && kind === 'option-drawn');
    expect(rewards).toHaveLength(1);
    expect(rewards[0].register).toBe(6);
    expect(result.robots[0].options).toHaveLength(robots[0].options.length + 1);
  });
});

describe('Interference owner clock', () => {
  it('starts once for the last owner and retains the deadline across both hands', () => {
    const { setup, config } = quietCourse('interference');
    let state = createProgrammingState(setup, config);
    const firstOwner = state.players[0].ownerUid!;
    for (const player of state.players.filter(({ ownerUid }) => ownerUid === firstOwner)) {
      state = submitProgram(state, player.uid, player.hand.slice(0, 5), 1_000);
    }
    expect(state.deadline).toBe(31_000);
    const waiting = state.players.filter(({ submitted }) => !submitted);
    expect(waiting).toHaveLength(2);
    state = submitProgram(state, waiting[0].uid, waiting[0].hand.slice(0, 5), 5_000);
    expect(state.deadline).toBe(31_000);
    expect(state.deadlinePlayerUid).toBe(waiting[1].uid);
    state = timeOutProgram(state, waiting[1].uid, 31_000, config.seed);
    expect(state.phase).toBe('programmed');
  });
});

describe('existing room compatibility', () => {
  it('retains the original Factory Rejects orientation for the previous course manifest', () => {
    const players = Array.from({ length: 5 }, (_, index) => ({ uid: `p${index}`, name: `P${index}`, robotId: `r${index}` }));
    const current = raceConfig('factory-rejects', 'OLD-ROOM');
    const legacy = { ...current, courseManifestVersion: LEGACY_COMPLETE_COURSE_MANIFEST_VERSION } as const;
    const setup = deriveRaceSetup(players, legacy);
    expect(setup.legacyFactoryLayout).toBe(true);
    const course = compilePlayableCourse(setup.courseId, undefined, setup.legacyFactoryLayout);
    expect(courseHasPit(4, 3, course)).toBe(true);
    expect(courseHasPit(4, 3, compilePlayableCourse(current.courseId))).toBe(false);
  });
});

describe('SuperBot laser priority', () => {
  it('transfers to the lowest-priority shooter when multiple robots fire in the fatal phase', () => {
    const { setup, robots, config } = quietCourse('day-of-the-superbot');
    const [target, early, late] = robots;
    Object.assign(target, { x: 2, y: 8, damage: 8, isSuperbot: true });
    Object.assign(early, { x: 1, y: 8, facing: 'east', poweredDown: false });
    Object.assign(late, { x: 3, y: 8, facing: 'west', poweredDown: false });
    const programming = createProgrammingState(setup, config);
    programming.players.find(({ uid }) => uid === early.uid)!.registers[0] = { cardId: PROGRAM_CARDS.at(-1)!.id, locked: false };
    programming.players.find(({ uid }) => uid === late.uid)!.registers[0] = { cardId: PROGRAM_CARDS[0].id, locked: false };
    resolveLaserSnapshot(robots, 1, [], programming, [], undefined, {}, {}, compilePlayableCourse(setup.courseId));
    expect(target.status).toBe('destroyed');
    expect(late.isSuperbot).toBe(true);
    expect(early.isSuperbot).toBe(false);
  });
});
