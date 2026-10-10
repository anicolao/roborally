import type { ScenarioState } from './scenario-state';
import { PUBLISHED_COURSES, PUBLISHED_COURSES_BY_ID, type PublishedCourseManifest } from './course-catalog';
import { compilePublishedCourse, type CompiledCourse } from './course-geometry';

export type PlayableCourseId = PublishedCourseManifest['id'];

function requireCatalogCourse(courseId: PlayableCourseId): PublishedCourseManifest {
  const course = PUBLISHED_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Missing playable course ${courseId}.`);
  return course;
}

const riskyExchange = requireCatalogCourse('risky-exchange');

/**
 * Risky Exchange uses the printed conveyor Docking Bay B. Keep the legacy
 * manifest version for existing rooms while correcting its board face.
 */
const legacyRiskyExchange: PublishedCourseManifest = Object.freeze({
  ...riskyExchange,
  boardPlacements: Object.freeze([
    {
      instanceId: 'exchange-1',
      boardId: 'exchange',
      origin: [1, 1] as const,
      rotation: 0 as const
    },
    {
      instanceId: 'docking-bay-b-1',
      boardId: 'docking-bay-b',
      origin: [1, 13] as const,
      rotation: 0 as const
    }
  ])
});

const testRiskyExchangeDockA: PublishedCourseManifest = Object.freeze({
  ...riskyExchange,
  boardPlacements: Object.freeze([
    {
      instanceId: 'exchange-1',
      boardId: 'exchange',
      origin: [1, 1] as const,
      rotation: 0 as const
    },
    {
      instanceId: 'docking-bay-a-1',
      boardId: 'docking-bay-a',
      origin: [1, 13] as const,
      rotation: 0 as const
    }
  ])
});

/**
 * Emulator-only rules course for focused Option behavior tests. It deliberately
 * reuses reviewed Risky Exchange geometry while granting one deterministic
 * starting Option, so browser tests exercise the real room/reducer/UI path
 * without playing several setup turns merely to draw a named card.
 */
const optionLab: PublishedCourseManifest = Object.freeze({
  ...testRiskyExchangeDockA,
  id: 'option-lab',
  name: 'Option Lab',
  specialRules: Object.freeze([
    ...testRiskyExchangeDockA.specialRules,
    { kind: 'starting-options' as const, count: 1 as const }
  ])
});

export const PLAYABLE_COURSES_BY_ID = new Map<PlayableCourseId, PublishedCourseManifest>([
  ['risky-exchange', legacyRiskyExchange],
  ['risky-exchange-a', testRiskyExchangeDockA],
  ['option-lab', optionLab],
  ...PUBLISHED_COURSES.filter(({ id }) => id !== 'risky-exchange').map(
    (course): [PlayableCourseId, PublishedCourseManifest] => [course.id, course]
  )
]);

export function playableCourse(courseId: PlayableCourseId): PublishedCourseManifest {
  const course = PLAYABLE_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Unsupported playable course ${courseId}.`);
  return course;
}

export function compilePlayableCourse(courseId: PlayableCourseId, scenario?: ScenarioState, legacyFactoryLayout = false): CompiledCourse {
  const manifest = playableCourse(courseId);
  const course = legacyFactoryLayout && courseId === 'factory-rejects' ? { ...manifest, boardPlacements: manifest.boardPlacements.map((placement) => ({ ...placement, rotation: 0 as const })) } : manifest;
  if (!scenario) return compilePublishedCourse(course);
  return compilePublishedCourse({
    ...course,
    flags: scenario.flags.filter(({ offBoard }) => !offBoard),
    boardPlacements: course.boardPlacements.map((placement) => ({
      ...placement,
      rotation: ((placement.rotation + (scenario.boardRotations[placement.instanceId] ?? 0)) % 4) as 0 | 1 | 2 | 3
    }))
  });
}
