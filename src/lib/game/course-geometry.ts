import { BOARD_FACES_BY_ID } from './board-catalog';
import type { BoardElement, Direction } from './course-manifest';
import {
  PUBLISHED_COURSES_BY_ID,
  type CourseRotation,
  type PublishedBoardPlacement,
  type PublishedCourseManifest
} from './course-catalog';

const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];
const DELTA: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0]
};
const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east'
};

export interface CompiledCourseCell {
  x: number;
  y: number;
  boardInstanceId: string;
  boardId: string;
  elements: readonly BoardElement[];
}

export interface CompiledCourse {
  course: PublishedCourseManifest;
  cells: ReadonlyMap<string, CompiledCourseCell>;
  walls: ReadonlySet<string>;
  width: number;
  height: number;
  minX: number;
  minY: number;
}

function key(x: number, y: number) {
  return `${x},${y}`;
}

function rotateDirection(direction: Direction, rotation: CourseRotation): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + rotation) % 4];
}

export function rotateLocalPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: CourseRotation
): readonly [number, number] {
  if (rotation === 1) return [height - y + 1, x];
  if (rotation === 2) return [width - x + 1, height - y + 1];
  if (rotation === 3) return [y, width - x + 1];
  return [x, y];
}

function worldPoint(
  placement: PublishedBoardPlacement,
  localX: number,
  localY: number,
  width: number,
  height: number
): readonly [number, number] {
  const [x, y] = rotateLocalPoint(localX, localY, width, height, placement.rotation);
  return [placement.origin[0] + x - 1, placement.origin[1] + y - 1];
}

function rotateElement(element: BoardElement, rotation: CourseRotation): BoardElement {
  if ('direction' in element) {
    return { ...element, direction: rotateDirection(element.direction, rotation) };
  }
  if (element.kind === 'gear' && rotation % 2 === 1) {
    return { ...element };
  }
  return { ...element };
}

export function compilePublishedCourse(courseOrId: PublishedCourseManifest | string): CompiledCourse {
  const course =
    typeof courseOrId === 'string' ? PUBLISHED_COURSES_BY_ID.get(courseOrId) : courseOrId;
  if (!course) throw new Error(`Unknown published course ${courseOrId}.`);

  const cells = new Map<string, CompiledCourseCell>();
  const walls = new Set<string>();
  for (const placement of course.boardPlacements) {
    const face = BOARD_FACES_BY_ID.get(placement.boardId);
    if (!face) throw new Error(`Missing board face ${placement.boardId}.`);
    const semantic = new Map(face.cells.map((cell) => [key(cell.x, cell.y), cell.elements]));
    for (let localY = 1; localY <= face.height; localY += 1) {
      for (let localX = 1; localX <= face.width; localX += 1) {
        const [x, y] = worldPoint(
          placement,
          localX,
          localY,
          face.width,
          face.height
        );
        const cellKey = key(x, y);
        if (cells.has(cellKey)) {
          throw new Error(`Course ${course.id} overlaps boards at ${cellKey}.`);
        }
        cells.set(cellKey, {
          x,
          y,
          boardInstanceId: placement.instanceId,
          boardId: placement.boardId,
          elements: (semantic.get(key(localX, localY)) ?? []).map((element) =>
            rotateElement(element, placement.rotation)
          )
        });
      }
    }
    for (const wall of face.walls) {
      const [x, y] = worldPoint(
        placement,
        wall.x,
        wall.y,
        face.width,
        face.height
      );
      walls.add(`${x},${y},${rotateDirection(wall.edge, placement.rotation)}`);
    }
  }

  const coordinates = [...cells.values()];
  const minX = Math.min(...coordinates.map(({ x }) => x));
  const minY = Math.min(...coordinates.map(({ y }) => y));
  const maxX = Math.max(...coordinates.map(({ x }) => x));
  const maxY = Math.max(...coordinates.map(({ y }) => y));
  return {
    course,
    cells,
    walls,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    minX,
    minY
  };
}

function hasPit(cell: CompiledCourseCell) {
  return cell.elements.some(({ kind }) => kind === 'pit');
}

function hasWall(course: CompiledCourse, x: number, y: number, direction: Direction) {
  const [dx, dy] = DELTA[direction];
  return (
    course.walls.has(`${x},${y},${direction}`) ||
    course.walls.has(`${x + dx},${y + dy},${OPPOSITE[direction]}`)
  );
}

function shortestSafePath(
  course: CompiledCourse,
  start: readonly [number, number],
  target: readonly [number, number]
): readonly (readonly [number, number])[] {
  const startKey = key(...start);
  const targetKey = key(...target);
  const queue = [startKey];
  const previous = new Map<string, string | null>([[startKey, null]]);

  for (let index = 0; index < queue.length; index += 1) {
    const currentKey = queue[index];
    if (currentKey === targetKey) break;
    const current = course.cells.get(currentKey);
    if (!current) continue;
    for (const direction of DIRECTIONS) {
      const [dx, dy] = DELTA[direction];
      const nextKey = key(current.x + dx, current.y + dy);
      const next = course.cells.get(nextKey);
      if (
        !next ||
        hasPit(next) ||
        hasWall(course, current.x, current.y, direction) ||
        previous.has(nextKey)
      ) {
        continue;
      }
      previous.set(nextKey, currentKey);
      queue.push(nextKey);
    }
  }

  if (!previous.has(targetKey)) {
    throw new Error(`No safe geometry route from ${startKey} to ${targetKey} on ${course.course.id}.`);
  }
  const path: [number, number][] = [];
  for (let cursor: string | null = targetKey; cursor; cursor = previous.get(cursor) ?? null) {
    path.push(cursor.split(',').map(Number) as [number, number]);
  }
  return path.reverse();
}

export interface RepresentativeRaceAudit {
  courseId: string;
  start: readonly [number, number];
  touchedFlags: readonly number[];
  route: readonly (readonly [number, number])[];
  crossedBoardInstances: readonly string[];
  winner: 'geometry-auditor';
}

export function completeRepresentativeRace(
  courseId = 'around-the-world'
): RepresentativeRaceAudit {
  const course = compilePublishedCourse(courseId);
  const dock = [...course.cells.values()]
    .filter(({ elements }) =>
      elements.some((element) => element.kind === 'dock' && element.number === 1)
    )
    .sort((left, right) => left.y - right.y || left.x - right.x)[0];
  if (!dock) throw new Error(`Course ${courseId} has no Dock 1 starting cell.`);

  let cursor: readonly [number, number] = [dock.x, dock.y];
  const route: (readonly [number, number])[] = [cursor];
  const crossed = new Set<string>([dock.boardInstanceId]);
  for (const flag of [...course.course.flags].sort((left, right) => left.number - right.number)) {
    const leg = shortestSafePath(course, cursor, [flag.x, flag.y]);
    route.push(...leg.slice(1));
    for (const [x, y] of leg) {
      const instance = course.cells.get(key(x, y))?.boardInstanceId;
      if (instance) crossed.add(instance);
    }
    cursor = [flag.x, flag.y];
  }

  return {
    courseId,
    start: [dock.x, dock.y],
    touchedFlags: course.course.flags.map(({ number }) => number),
    route,
    crossedBoardInstances: [...crossed],
    winner: 'geometry-auditor'
  };
}
