import type { PublishedFlag, CourseRotation } from './course-catalog';

export interface ScenarioFlag extends PublishedFlag {
  offBoard?: boolean;
  carrierUid?: string;
  teamId?: string;
}

/** Persistent course changes, copied into playback frames and turn-start snapshots. */
export interface ScenarioState {
  flags: ScenarioFlag[];
  boardRotations: Record<string, CourseRotation>;
  flagControl: Record<number, string>;
}

export function cloneScenario(state: ScenarioState): ScenarioState {
  return {
    flags: state.flags.map((flag) => ({ ...flag })),
    boardRotations: { ...state.boardRotations },
    flagControl: { ...state.flagControl }
  };
}
