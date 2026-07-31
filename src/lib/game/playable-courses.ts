import { PUBLISHED_COURSES_BY_ID, type PublishedCourseManifest } from './course-catalog';
import { compilePublishedCourse, type CompiledCourse } from './course-geometry';

export type PlayableCourseId = 'risky-exchange' | 'factory-rejects';

function requireCatalogCourse(courseId: PlayableCourseId): PublishedCourseManifest {
  const course = PUBLISHED_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Missing playable course ${courseId}.`);
  return course;
}

const riskyExchange = requireCatalogCourse('risky-exchange');

/**
 * The MVP shipped Risky Exchange with Docking Bay A under the legacy v1
 * manifest. Keep that immutable event geometry stable while newer scenarios
 * use their reviewed complete-catalog placements.
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
      instanceId: 'docking-bay-a-1',
      boardId: 'docking-bay-a',
      origin: [1, 13] as const,
      rotation: 0 as const
    }
  ])
});

export const PLAYABLE_COURSES_BY_ID = new Map<PlayableCourseId, PublishedCourseManifest>([
  ['risky-exchange', legacyRiskyExchange],
  ['factory-rejects', requireCatalogCourse('factory-rejects')]
]);

export function playableCourse(courseId: PlayableCourseId): PublishedCourseManifest {
  const course = PLAYABLE_COURSES_BY_ID.get(courseId);
  if (!course) throw new Error(`Unsupported playable course ${courseId}.`);
  return course;
}

export function compilePlayableCourse(courseId: PlayableCourseId): CompiledCourse {
  return compilePublishedCourse(playableCourse(courseId));
}
