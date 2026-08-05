import { PUBLISHED_COURSES_BY_ID, type PublishedCourseManifest } from './course-catalog';
import { compilePublishedCourse, type CompiledCourse } from './course-geometry';

export type PlayableCourseId =
  | 'risky-exchange'
  | 'risky-exchange-a'
  | 'option-lab'
  | 'factory-rejects'
  | 'option-world';

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
  ['factory-rejects', requireCatalogCourse('factory-rejects')],
  ['option-world', requireCatalogCourse('option-world')]
]);

export function playableCourse(courseId: PlayableCourseId): PublishedCourseManifest {
  const course = PLAYABLE_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Unsupported playable course ${courseId}.`);
  return course;
}

export function compilePlayableCourse(courseId: PlayableCourseId): CompiledCourse {
  return compilePublishedCourse(playableCourse(courseId));
}
