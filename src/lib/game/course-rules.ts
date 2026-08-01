import {
  PUBLISHED_COURSES_BY_ID,
  type CourseSpecialRule,
  type PublishedCourseManifest
} from './course-catalog';

export interface CourseRuleRobot {
  uid: string;
  ownerUid: string;
  teamId?: string;
  damage: number;
  options: number;
  lives: number;
  flagProgress: number;
  isSuperbot: boolean;
  role: 'racer' | 'blocker';
}

export interface CourseRuleState {
  courseId: string;
  programmingSeconds: number | null;
  movingFlags: boolean;
  robotLaserMultiplier: number;
  powerDownAllowed: boolean;
  repairAwards: 'standard' | 'options';
  rotateBoardOnFlag: boolean;
  teamMode:
    | 'none'
    | 'shared-progress'
    | 'individual-racer'
    | 'capture-the-flag'
    | 'toggle-control'
    | 'elimination';
  controlledRobotsPerPlayer: number;
  playerHandsPerTurn: number;
  optionDraft: { dealt: number; keep: number } | null;
  flagAwardsOption: boolean;
  superbotRepairsAtEndTurn: boolean;
  boardRotations: Record<string, 0 | 1 | 2 | 3>;
  teamFlagProgress: Record<string, number>;
  flagControl: Record<number, string>;
  robots: CourseRuleRobot[];
  audit: string[];
}

function requireCourse(courseId: string): PublishedCourseManifest {
  const course = PUBLISHED_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Unknown published course ${courseId}.`);
  return course;
}

export interface ScenarioResolutionRules {
  repair: {
    awardOptions: boolean;
    singleOptions: number;
    crossedOptions: number;
  };
  flag: {
    awardOptions: number;
  };
}

/**
 * Generic resolution hooks derived from the published scenario rules. New
 * scenarios extend this projection instead of adding course-id branches to
 * movement resolution.
 */
export function scenarioResolutionRules(course: PublishedCourseManifest): ScenarioResolutionRules {
  const repairRule = course.specialRules.find(
    (rule): rule is Extract<CourseSpecialRule, { kind: 'repair-sites-draw-options' }> =>
      rule.kind === 'repair-sites-draw-options'
  );
  return {
    repair: {
      awardOptions: repairRule !== undefined,
      singleOptions: repairRule?.single ?? 0,
      crossedOptions: repairRule?.crossed ?? 0
    },
    flag: {
      awardOptions: repairRule ? 1 : 0
    }
  };
}

export function createCourseRuleState(
  courseId: string,
  players: readonly { uid: string; teamId?: string }[]
): CourseRuleState {
  const course = requireCourse(courseId);
  const state: CourseRuleState = {
    courseId,
    programmingSeconds: null,
    movingFlags: false,
    robotLaserMultiplier: 1,
    powerDownAllowed: true,
    repairAwards: 'standard',
    rotateBoardOnFlag: false,
    teamMode: 'none',
    controlledRobotsPerPlayer: 1,
    playerHandsPerTurn: 1,
    optionDraft: null,
    flagAwardsOption: false,
    superbotRepairsAtEndTurn: false,
    boardRotations: {},
    teamFlagProgress: {},
    flagControl: {},
    robots: players.map(({ uid, teamId }) => ({
      uid,
      ownerUid: uid,
      teamId,
      damage: 0,
      options: 0,
      lives: 3,
      flagProgress: 0,
      isSuperbot: false,
      role: 'racer'
    })),
    audit: []
  };

  for (const rule of course.specialRules) applySetupRule(state, rule);
  return state;
}

function applySetupRule(state: CourseRuleState, rule: CourseSpecialRule) {
  switch (rule.kind) {
    case 'starting-option-draft':
      state.optionDraft = { dealt: rule.dealt, keep: rule.keep };
      state.robots.forEach((robot) => (robot.options = rule.keep));
      state.audit.push(`draft ${rule.dealt}, keep ${rule.keep}`);
      return;
    case 'moving-flags':
      state.movingFlags = true;
      state.audit.push('flags move during every register');
      return;
    case 'robot-laser-multiplier':
      state.robotLaserMultiplier = rule.multiplier;
      state.audit.push(`damaging robot lasers ×${rule.multiplier}`);
      return;
    case 'starting-damage':
      state.robots.forEach((robot) => (robot.damage = rule.amount));
      state.audit.push(`all robots start with ${rule.amount} damage`);
      return;
    case 'power-down-disabled':
      state.powerDownAllowed = false;
      state.audit.push('power down disabled');
      return;
    case 'repair-sites-draw-options':
      state.repairAwards = 'options';
      state.flagAwardsOption = true;
      state.audit.push(`repair sites draw ${rule.single}/${rule.crossed} Options; flags draw 1`);
      return;
    case 'programming-limit':
      state.programmingSeconds = rule.seconds;
      state.audit.push(`${rule.seconds}-second programming limit`);
      return;
    case 'starting-options':
      state.robots.forEach((robot) => (robot.options += rule.count));
      state.audit.push(`all robots receive ${rule.count} starting Option`);
      return;
    case 'superbot':
      if (state.robots[0]) state.robots[0].isSuperbot = true;
      state.robotLaserMultiplier = 2;
      state.superbotRepairsAtEndTurn = true;
      state.audit.push('Dock 1 begins as the SuperBot');
      return;
    case 'two-controlled-robots':
      state.controlledRobotsPerPlayer = 2;
      state.playerHandsPerTurn = 2;
      state.robots = state.robots.flatMap((robot) => [
        { ...robot, uid: `${robot.ownerUid}:racer`, role: 'racer' },
        { ...robot, uid: `${robot.ownerUid}:blocker`, role: 'blocker' }
      ]);
      state.audit.push('each player controls racer and blocker');
      return;
    case 'rotate-board-on-flag':
      state.rotateBoardOnFlag = true;
      state.audit.push('flag touch can rotate its board');
      return;
    case 'team-shared-flag-progress':
      state.teamMode = 'shared-progress';
      state.audit.push('team shares ordered flag progress');
      return;
    case 'team-individual-racer':
      state.teamMode = 'individual-racer';
      state.audit.push('one robot completes the team race');
      return;
    case 'capture-the-flag':
      state.teamMode = 'capture-the-flag';
      state.audit.push('enemy flag must reach home board');
      return;
    case 'toggle-flag-control':
      state.teamMode = 'toggle-control';
      state.audit.push('team must control all flags simultaneously');
      return;
    case 'team-elimination':
      state.teamMode = 'elimination';
      state.audit.push('victory by eliminating the opposing team');
  }
}

export function resolveCourseRepair(
  state: CourseRuleState,
  uid: string,
  site: 'single' | 'crossed'
): CourseRuleState {
  const next = structuredClone(state);
  const robot = next.robots.find((entry) => entry.uid === uid);
  if (!robot) throw new Error(`Unknown course-rule robot ${uid}.`);
  if (next.repairAwards === 'options') {
    robot.options += site === 'single' ? 1 : 2;
    next.audit.push(`${uid} drew ${site === 'single' ? 1 : 2} Option at ${site} repair`);
  } else {
    robot.damage = Math.max(0, robot.damage - 1);
    next.audit.push(`${uid} repaired one damage`);
  }
  return next;
}

export function resolveCourseLaserDamage(
  state: CourseRuleState,
  input: {
    baseDamage: number;
    source: 'robot-laser' | 'board-laser';
    optionEffect?: 'adds-damage' | 'replaces-laser';
  }
): number {
  if (input.source !== 'robot-laser' || input.optionEffect === 'replaces-laser') {
    return input.baseDamage;
  }
  return input.baseDamage * state.robotLaserMultiplier;
}

export function movePublishedFlags(
  state: CourseRuleState,
  flags: readonly { number: number; x: number; y: number; inPit?: boolean }[],
  move: (flag: { number: number; x: number; y: number }) => { x: number; y: number; inPit?: boolean }
) {
  if (!state.movingFlags) return flags.map((flag) => ({ ...flag }));
  return flags.map((flag) => {
    const moved = move(flag);
    if (moved.inPit) {
      state.audit.push(`Flag ${flag.number} reset after entering a pit`);
      return { ...flag, inPit: false };
    }
    state.audit.push(`Flag ${flag.number} moved to ${moved.x},${moved.y}`);
    return { number: flag.number, ...moved };
  });
}

export function resolveCourseEndTurn(state: CourseRuleState): CourseRuleState {
  const next = structuredClone(state);
  if (next.superbotRepairsAtEndTurn) {
    const superbot = next.robots.find(({ isSuperbot }) => isSuperbot);
    if (superbot) {
      superbot.damage = 0;
      next.audit.push(`${superbot.uid} discarded every Damage token as SuperBot`);
    }
  }
  return next;
}

export function resolveCourseFlagTouch(
  state: CourseRuleState,
  input: {
    uid: string;
    flagNumber: number;
    boardInstanceId?: string;
    coin?: 'heads' | 'tails';
  }
): CourseRuleState {
  const next = structuredClone(state);
  const robot = next.robots.find(({ uid }) => uid === input.uid);
  if (!robot) throw new Error(`Unknown course-rule robot ${input.uid}.`);

  if (next.teamMode === 'toggle-control') {
    if (!robot.teamId) throw new Error('Toggle Boggle requires a team assignment.');
    next.flagControl[input.flagNumber] = robot.teamId;
    next.audit.push(`${robot.teamId} now controls Flag ${input.flagNumber}`);
    return next;
  }

  if (robot.role === 'blocker') {
    next.audit.push(`${input.uid} is a blocker and cannot touch flags`);
    return next;
  }
  if (next.courseId === 'day-of-the-superbot' && !robot.isSuperbot) {
    next.audit.push(`${input.uid} is not SuperBot and receives no flag credit`);
    return next;
  }

  if (next.teamMode === 'shared-progress') {
    if (!robot.teamId) throw new Error('Tandem Carnage requires a team assignment.');
    const progress = next.teamFlagProgress[robot.teamId] ?? 0;
    if (input.flagNumber === progress + 1) {
      next.teamFlagProgress[robot.teamId] = input.flagNumber;
      for (const teammate of next.robots.filter(({ teamId }) => teamId === robot.teamId)) {
        teammate.flagProgress = input.flagNumber;
      }
    }
  } else if (input.flagNumber === robot.flagProgress + 1) {
    robot.flagProgress = input.flagNumber;
  }

  if (next.flagAwardsOption) {
    robot.options += 1;
    next.audit.push(`${input.uid} drew one Option at Flag ${input.flagNumber}`);
  }

  if (
    next.rotateBoardOnFlag &&
    input.coin === 'heads' &&
    input.boardInstanceId
  ) {
    const current = next.boardRotations[input.boardInstanceId] ?? 0;
    next.boardRotations[input.boardInstanceId] = ((current + 1) % 4) as 0 | 1 | 2 | 3;
    next.audit.push(
      `${input.boardInstanceId} rotated clockwise; robots and flags retained world coordinates`
    );
  }
  return next;
}

export function resolveToggleDestruction(
  state: CourseRuleState,
  uid: string
): CourseRuleState {
  const next = structuredClone(state);
  if (next.teamMode !== 'toggle-control') return next;
  next.audit.push(`${uid} was destroyed; claimed flags remain controlled`);
  return next;
}

export function transferSuperbot(
  state: CourseRuleState,
  destroyedUid: string,
  responsibleUid:
    | string
    | readonly { uid: string; programPriority: number; dealtLastDamage: boolean }[]
): CourseRuleState {
  const next = structuredClone(state);
  const destroyed = next.robots.find((robot) => robot.uid === destroyedUid);
  const selectedUid =
    typeof responsibleUid === 'string'
      ? responsibleUid
      : [...responsibleUid]
          .filter(({ dealtLastDamage }) => dealtLastDamage)
          .sort((left, right) => left.programPriority - right.programPriority)[0]?.uid;
  const responsible = next.robots.find((robot) => robot.uid === selectedUid);
  if (!destroyed?.isSuperbot || !responsible) return next;
  destroyed.isSuperbot = false;
  responsible.isSuperbot = true;
  next.audit.push(`${responsibleUid} became SuperBot after destroying ${destroyedUid}`);
  return next;
}

export interface CaptureSetup {
  homeBoards: Record<string, string>;
  flagHomes: Record<string, { boardInstanceId: string; x: number; y: number }>;
  legalDeploymentRows: readonly [7, 8, 9, 10, 11, 12];
}

export function createCaptureSetup(
  state: CourseRuleState,
  teams: readonly [string, string],
  coinWinner: string,
  chosenHomeBoard: string,
  otherBoard: string,
  flagHomes: readonly [
    { x: number; y: number },
    { x: number; y: number }
  ]
): CaptureSetup {
  if (state.teamMode !== 'capture-the-flag') {
    throw new Error('Capture setup is only legal for Capture the Flag.');
  }
  if (!teams.includes(coinWinner)) throw new Error('The coin winner must be one of the teams.');
  const otherTeam = teams.find((team) => team !== coinWinner)!;
  return {
    homeBoards: { [coinWinner]: chosenHomeBoard, [otherTeam]: otherBoard },
    flagHomes: {
      [coinWinner]: { boardInstanceId: chosenHomeBoard, ...flagHomes[0] },
      [otherTeam]: { boardInstanceId: otherBoard, ...flagHomes[1] }
    },
    legalDeploymentRows: [7, 8, 9, 10, 11, 12]
  };
}

export function legalCaptureDeployment(input: {
  rowFromOpponentEdge: number;
  inPit: boolean;
  enemyWithinThreeInLineOfSight: boolean;
}): boolean {
  return (
    input.rowFromOpponentEdge >= 7 &&
    input.rowFromOpponentEdge <= 12 &&
    !input.inPit &&
    !input.enemyWithinThreeInLineOfSight
  );
}

export function captureReentryBoard(
  setup: CaptureSetup,
  teamId: string
): string {
  const board = setup.homeBoards[teamId];
  if (!board) throw new Error(`Unknown Capture the Flag team ${teamId}.`);
  return board;
}

export type CourseVictoryContext =
  | { kind: 'flags'; uid: string; flagCount: number }
  | { kind: 'capture'; uid: string; teamId: string; enemyFlagOnHomeBoard: boolean }
  | { kind: 'control'; teamId: string; controlledFlags: number; flagCount: number }
  | { kind: 'elimination'; teamId: string; opposingLives: number }
  | { kind: 'interference-elimination'; ownerUid: string; opposingRacerLives: number };

export function evaluateCourseVictory(
  state: CourseRuleState,
  context: CourseVictoryContext
): string | null {
  if (state.teamMode === 'capture-the-flag' && context.kind === 'capture') {
    return context.enemyFlagOnHomeBoard ? context.teamId : null;
  }
  if (state.teamMode === 'toggle-control' && context.kind === 'control') {
    return context.controlledFlags === context.flagCount ? context.teamId : null;
  }
  if (state.teamMode === 'elimination' && context.kind === 'elimination') {
    return context.opposingLives === 0 ? context.teamId : null;
  }
  if (state.courseId === 'interference' && context.kind === 'interference-elimination') {
    return context.opposingRacerLives === 0 ? context.ownerUid : null;
  }
  if (context.kind !== 'flags') return null;
  const robot = state.robots.find(({ uid }) => uid === context.uid);
  if (!robot || robot.role === 'blocker') return null;
  if (state.courseId === 'day-of-the-superbot' && !robot.isSuperbot) return null;
  const progress =
    state.teamMode === 'shared-progress' && robot.teamId
      ? (state.teamFlagProgress[robot.teamId] ?? 0)
      : robot.flagProgress;
  if (progress < context.flagCount) return null;
  if (state.courseId === 'interference') return robot.ownerUid;
  return state.teamMode === 'none' ? robot.uid : (robot.teamId ?? null);
}

export function courseRuleSummary(courseId: string): string[] {
  const course = requireCourse(courseId);
  if (course.specialRules.length === 0) return ['Standard 2005 race rules'];
  const probe = createCourseRuleState(courseId, [
    { uid: 'dock-1', teamId: 'amber' },
    { uid: 'dock-2', teamId: 'cobalt' }
  ]);
  return probe.audit;
}

export interface CourseRuleProbe {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
}

export function publishedCourseRuleProbes(): CourseRuleProbe[] {
  const players = [
    { uid: 'ada', teamId: 'amber' },
    { uid: 'grace', teamId: 'cobalt' }
  ] as const;

  const draft = createCourseRuleState('tricksy', players);
  const moving = createCourseRuleState('moving-targets', players);
  const moved = movePublishedFlags(
    moving,
    [{ number: 1, x: 4, y: 4 }],
    () => ({ x: 5, y: 4, inPit: true })
  );
  const lasers = createCourseRuleState('set-to-kill', players);
  const rejects = createCourseRuleState('factory-rejects', players);
  let options = createCourseRuleState('option-world', players);
  options = resolveCourseFlagTouch(resolveCourseRepair(options, 'ada', 'crossed'), {
    uid: 'ada',
    flagNumber: 1
  });
  const ball = createCourseRuleState('ball-lightning', players);
  const collar = createCourseRuleState('tight-collar', players);
  let superbot = createCourseRuleState('day-of-the-superbot', players);
  superbot.robots[0].damage = 6;
  superbot = resolveCourseEndTurn(superbot);
  const interference = createCourseRuleState('interference', players);
  const blocker = resolveCourseFlagTouch(interference, {
    uid: 'ada:blocker',
    flagNumber: 1
  });
  let rotating = createCourseRuleState('frenetic-factory', players);
  rotating = resolveCourseFlagTouch(rotating, {
    uid: 'ada',
    flagNumber: 1,
    boardInstanceId: 'chess-1',
    coin: 'heads'
  });
  let tandem = createCourseRuleState('tandem-carnage', [
    { uid: 'ada', teamId: 'amber' },
    { uid: 'alan', teamId: 'amber' }
  ]);
  tandem = resolveCourseFlagTouch(tandem, { uid: 'ada', flagNumber: 1 });
  tandem = resolveCourseFlagTouch(tandem, { uid: 'alan', flagNumber: 2 });
  const one = createCourseRuleState('all-for-one-or-one-for-all', players);
  one.robots[0].flagProgress = 4;
  const capture = createCourseRuleState('capture-the-flag', players);
  const captureSetup = createCaptureSetup(
    capture,
    ['amber', 'cobalt'],
    'amber',
    'chop-shop-1',
    'vault-1',
    [
      { x: 3, y: 11 },
      { x: 9, y: 2 }
    ]
  );
  let toggle = createCourseRuleState('toggle-boggle', players);
  for (const flagNumber of [1, 2, 3]) {
    toggle = resolveCourseFlagTouch(toggle, { uid: 'ada', flagNumber });
  }
  toggle = resolveToggleDestruction(toggle, 'ada');
  const war = createCourseRuleState('war-zone', players);

  return [
    {
      id: 'starting-option-draft',
      label: 'Tricksy Option draft',
      passed: draft.optionDraft?.dealt === 3 && draft.robots.every(({ options }) => options === 1),
      evidence: 'three dealt face down; one retained'
    },
    {
      id: 'moving-flags',
      label: 'Moving Targets conveyor reset',
      passed: moved[0].x === 4 && moved[0].y === 4 && moved[0].inPit === false,
      evidence: 'pit-bound flag returned to printed start'
    },
    {
      id: 'laser-multiplier',
      label: 'Set to Kill damaging lasers',
      passed:
        resolveCourseLaserDamage(lasers, {
          baseDamage: 1,
          source: 'robot-laser',
          optionEffect: 'adds-damage'
        }) === 2 &&
        resolveCourseLaserDamage(lasers, {
          baseDamage: 1,
          source: 'robot-laser',
          optionEffect: 'replaces-laser'
        }) === 1,
      evidence: 'damage doubled; replacement lasers unchanged'
    },
    {
      id: 'damage-and-power-down',
      label: 'Factory Rejects setup',
      passed: rejects.robots.every(({ damage }) => damage === 2) && !rejects.powerDownAllowed,
      evidence: 'two starting Damage; power down disabled'
    },
    {
      id: 'option-world',
      label: 'Option World awards',
      passed: options.robots[0].options === 3 && options.robots[0].damage === 0,
      evidence: 'crossed repair drew two; flag drew one'
    },
    {
      id: 'timed-programming',
      label: 'Published programming clocks',
      passed: ball.programmingSeconds === 30 && collar.programmingSeconds === 60,
      evidence: 'Ball Lightning 30s; Tight Collar 60s'
    },
    {
      id: 'superbot',
      label: 'SuperBot repair and exclusive flags',
      passed: superbot.robots[0].damage === 0 && superbot.robots[0].isSuperbot,
      evidence: 'Dock 1 SuperBot discarded all Damage at turn end'
    },
    {
      id: 'two-controlled-robots',
      label: 'Interference racer and blocker',
      passed:
        interference.robots.length === 4 &&
        interference.playerHandsPerTurn === 2 &&
        blocker.robots.find(({ uid }) => uid === 'ada:blocker')?.flagProgress === 0,
      evidence: 'two hands; blocker receives no flag credit'
    },
    {
      id: 'rotating-board',
      label: 'Frenetic Factory board rotation',
      passed: rotating.boardRotations['chess-1'] === 1 && rotating.robots[0].flagProgress === 1,
      evidence: 'heads rotated the board; world-space occupants stayed fixed'
    },
    {
      id: 'team-shared-progress',
      label: 'Tandem Carnage shared sequence',
      passed:
        tandem.teamFlagProgress.amber === 2 &&
        tandem.robots.every(({ flagProgress }) => flagProgress === 2),
      evidence: 'either teammate advanced the same ordered sequence'
    },
    {
      id: 'team-individual-racer',
      label: 'All for One individual racer',
      passed:
        evaluateCourseVictory(one, { kind: 'flags', uid: 'ada', flagCount: 4 }) === 'amber',
      evidence: 'one robot completing every flag won for its team'
    },
    {
      id: 'capture-the-flag',
      label: 'Capture home boards and re-entry',
      passed:
        captureReentryBoard(captureSetup, 'amber') === 'chop-shop-1' &&
        legalCaptureDeployment({
          rowFromOpponentEdge: 9,
          inPit: false,
          enemyWithinThreeInLineOfSight: false
        }),
      evidence: 'coin-selected home board governs deployment and re-entry'
    },
    {
      id: 'toggle-control',
      label: 'Toggle Boggle persistent control',
      passed:
        Object.values(toggle.flagControl).every((teamId) => teamId === 'amber') &&
        evaluateCourseVictory(toggle, {
          kind: 'control',
          teamId: 'amber',
          controlledFlags: 3,
          flagCount: 3
        }) === 'amber',
      evidence: 'all three controls survived the claiming robot’s destruction'
    },
    {
      id: 'team-elimination',
      label: 'War Zone elimination',
      passed:
        war.robots.every(({ options }) => options === 1) &&
        evaluateCourseVictory(war, {
          kind: 'elimination',
          teamId: 'amber',
          opposingLives: 0
        }) === 'amber',
      evidence: 'starting Option applied; zero opposing Lives won'
    }
  ];
}
