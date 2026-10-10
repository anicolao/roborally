import { PROGRAM_CARDS, type ProgramCard } from './program-manifest';
import type { ProgrammingPlayer } from './programming';
import type { Direction } from './course-manifest';
import type { CompiledCourse } from './course-geometry';
import { applyProgramCard, resolveBoardElements, courseHasPit, movementBlockedByWall, type RaceRobotPosition } from './movement';

const directions: Direction[] = ['north', 'east', 'south', 'west'];
const steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const cards = new Map(PROGRAM_CARDS.map((card) => [card.id, card]));
type Flag = { number: number; x: number; y: number; offBoard?: boolean };

/** Safe walking distance is a heuristic, not a prediction of another player's program. */
function distances(course: CompiledCourse, target: Flag) {
  const result = new Map<string, number>([[`${target.x},${target.y}`, 0]]);
  const queue = [{ x: target.x, y: target.y }];
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    const distance = result.get(`${cell.x},${cell.y}`)!;
    for (let d = 0; d < 4; d++) {
      const x = cell.x + steps[d][0], y = cell.y + steps[d][1];
      const key = `${x},${y}`;
      if (result.has(key) || !course.cells.has(key) || courseHasPit(x, y, course) || movementBlockedByWall(cell.x, cell.y, directions[d], course)) continue;
      result.set(key, distance + 1);
      queue.push({ x, y });
    }
  }
  return result;
}

export function chooseComputerProgram(
  player: ProgrammingPlayer,
  robot: RaceRobotPosition,
  course: CompiledCourse,
  flags: readonly Flag[] = course.course.flags
): ProgramCard['id'][] {
  const orderedFlags = flags.filter((flag) => !flag.offBoard).sort((a, b) => a.number - b.number);
  const maps = new Map(orderedFlags.map((flag) => [flag.number, distances(course, flag)]));
  const cells = [...course.cells.values()];
  type Candidate = { robot: RaceRobotPosition; selected: ProgramCard['id'][]; remaining: ProgramCard['id'][]; visited: number; cost: number; score: number };
  const initial = structuredClone(robot);
  // Voluntary Options are declined by this simple driver. Do not use opponents' hands.
  initial.options = [];
  initial.poweredDown = false;
  let beam: Candidate[] = [{ robot: initial, selected: [], remaining: [...player.hand].sort(), visited: 0, cost: 0, score: 0 }];
  for (let r = 0; r < player.registers.length; r++) {
    const register = player.registers[r];
    const candidates: Candidate[] = [];
    for (const previous of beam) {
      const choices = register.locked ? [register.cardId!] : previous.remaining;
      // Equivalent actions differ only in priority, which cannot predict hidden opponents.
      const actions = new Set<string>();
      for (const id of choices) {
        const card = cards.get(id);
        if (!card || actions.has(card.action)) continue;
        actions.add(card.action);
        const next = structuredClone(previous.robot);
        applyProgramCard([next], next.uid, card, r + 1, [], undefined, course);
        if (register.locked && register.pairedCardId) {
          const paired = cards.get(register.pairedCardId);
          if (paired) applyProgramCard([next], next.uid, paired, r + 1, [], undefined, course);
        }
        resolveBoardElements([next], r + 1, [], cells, {}, course);
        let visited = previous.visited;
        let target = orderedFlags.find((flag) => flag.number === next.nextFlag);
        if (next.status === 'active' && target && next.x === target.x && next.y === target.y) {
          visited++;
          next.nextFlag = orderedFlags.find((flag) => flag.number > target!.number)?.number ?? null;
          target = orderedFlags.find((flag) => flag.number === next.nextFlag);
        }
        const distance = target ? maps.get(target.number)?.get(`${next.x},${next.y}`) ?? 1000 : 0;
        const facingIndex = directions.indexOf(next.facing);
        const forwardDistance = target ? maps.get(target.number)?.get(`${next.x + steps[facingIndex][0]},${next.y + steps[facingIndex][1]}`) ?? 1000 : 0;
        const headingCost = forwardDistance < distance ? 0 : 0.3;
        const cost = previous.cost + distance;
        candidates.push({ robot: next, visited, cost,
          selected: register.locked ? previous.selected : [...previous.selected, id],
          remaining: register.locked ? previous.remaining : previous.remaining.filter((candidate) => candidate !== id),
          score: (next.status === 'active' ? 0 : -1_000_000) + visited * 10_000 - distance * 10 - cost * 0.1 - headingCost });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.selected.join(',').localeCompare(b.selected.join(',')));
    beam = candidates.slice(0, 48);
  }
  return beam[0]?.selected ?? [];
}
