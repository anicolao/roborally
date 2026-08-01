import { PUBLISHED_COURSES_BY_ID, type PublishedCourseManifest } from './course-catalog';
import { compilePublishedCourse, type CompiledCourse } from './course-geometry';

export type PlayableCourseId = 'risky-exchange' | 'factory-rejects' | 'option-world';

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

export const PLAYABLE_COURSES_BY_ID = new Map<PlayableCourseId, PublishedCourseManifest>([
  ['risky-exchange', legacyRiskyExchange],
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
