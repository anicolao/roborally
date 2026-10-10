import { describe, expect, it } from 'vitest';
import { chooseComputerProgram } from './computer-player';
import { compilePlayableCourse } from './playable-courses';
import { createProgrammingState } from './programming';
import { deriveRaceSetup, riskyExchangeConfig } from './setup';
import { applyProgramCard, createRaceRobotPositions, resolveBoardElements } from './movement';
import { PROGRAM_CARDS, type ProgramCard } from './program-manifest';
import type { CompiledCourse, CompiledCourseCell } from './course-geometry';

const config = riskyExchangeConfig('COMPUTER');
const setup = deriveRaceSetup([{ uid: 'bot', name: 'Bot', robotId: 'axle' }, { uid: 'human', name: 'Human', robotId: 'bit' }], config);
function fixture() {
  const base = compilePlayableCourse('risky-exchange');
  const cells = new Map<string, CompiledCourseCell>();
  const course = { ...base, walls: new Set<string>(), cells, course: { ...base.course, flags: [{ number: 1, x: 4, y: 2 }] } };
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) course.cells.set(`${x},${y}`, { x, y, boardId: 'test', boardInstanceId: 'test', elements: [] });
  const robot = { ...createRaceRobotPositions(setup)[0], uid: 'bot', x: 2, y: 2, facing: 'north' as const, nextFlag: 1 };
  const hand = createProgrammingState(setup, config).players[0];
  hand.uid = 'bot';
  hand.hand = ['program-070', 'program-080', 'program-010', 'program-490', 'program-500', 'program-670', 'program-680', 'program-790', 'program-430'];
  return { course, robot, hand };
}
function execute(f: ReturnType<typeof fixture>, ids: ProgramCard['id'][]) {
  const robot = structuredClone(f.robot);
  let visited = false, index = 0;
  f.hand.registers.forEach((register, r) => {
    const cardId = register.locked ? register.cardId : ids[index++];
    const card = PROGRAM_CARDS.find(({ id }) => id === cardId)!;
    applyProgramCard([robot], robot.uid, card, r + 1, [], undefined, f.course);
    resolveBoardElements([robot], r + 1, [], [...f.course.cells.values()], {}, f.course);
    if (robot.x === 4 && robot.y === 2 && robot.status === 'active') visited = true;
  });
  return { robot, visited };
}

describe('simple computer programming', () => {
  it('turns toward and reaches its flag using only distinct cards in its own hand', () => {
    const f = fixture(); const before = structuredClone(f);
    const ids = chooseComputerProgram(f.hand, f.robot, f.course);
    expect(ids).toHaveLength(5); expect(new Set(ids).size).toBe(5);
    expect(ids.every((id) => f.hand.hand.includes(id))).toBe(true);
    expect(execute(f, ids)).toMatchObject({ visited: true, robot: { status: 'active' } });
    expect(f).toEqual(before);
    expect(chooseComputerProgram(f.hand, f.robot, f.course)).toEqual(ids);
  });
  it('routes around a pit instead of taking the direct fatal route', () => {
    const f = fixture(); f.course.cells.get('3,2')!.elements = [{ kind: 'pit' }];
    const ids = chooseComputerProgram(f.hand, f.robot, f.course);
    expect(execute(f, ids)).toMatchObject({ visited: true, robot: { status: 'active' } });
  });
  it('preserves locked registers and submits only the unlocked slots', () => {
    const f = fixture();
    f.hand.registers[4] = { cardId: 'program-410', locked: true };
    const ids = chooseComputerProgram(f.hand, f.robot, f.course);
    expect(ids).toHaveLength(4); expect(ids).not.toContain('program-410');
    expect(f.hand.registers[4]).toEqual({ cardId: 'program-410', locked: true });
  });
  it('accounts for conveyor movement after a register', () => {
    const f = fixture();
    f.course.cells.get('3,2')!.elements = [{ kind: 'conveyor', direction: 'east', express: false }];
    expect(execute(f, chooseComputerProgram(f.hand, f.robot, f.course))).toMatchObject({ visited: true, robot: { status: 'active' } });
  });
});
