import type { Direction } from '$lib/game/course-manifest';
import type {
  ProgramPlaybackFrame,
  ProgramResolution,
  RaceRobotPosition
} from '$lib/game/movement';

const facingQuarterTurns: Record<Direction, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3
};

export function facingDegrees(facing: Direction): number {
  return facingQuarterTurns[facing] * 90;
}

export function nextFacingDegrees(
  previousFacing: Direction,
  previousDegrees: number,
  nextFacing: Direction
): number {
  const previousQuarterTurn = facingQuarterTurns[previousFacing];
  const nextQuarterTurn = facingQuarterTurns[nextFacing];
  const clockwiseDelta = (nextQuarterTurn - previousQuarterTurn + 4) % 4;
  const shortestDelta = clockwiseDelta === 3 ? -1 : clockwiseDelta;
  return previousDegrees + shortestDelta * 90;
}

export function robotsForPlaybackPresentation(
  resolution: Pick<ProgramResolution, 'robots' | 'playback'> | null | undefined,
  playbackRobots: RaceRobotPosition[] | undefined,
  resolutionKey: string,
  playbackKey: string
): RaceRobotPosition[] | undefined {
  if (playbackRobots) return playbackRobots;
  if (resolution?.playback.frames.length && resolutionKey !== playbackKey) {
    return resolution.playback.initialRobots;
  }
  return resolution?.robots;
}

function sameFrame(left: ProgramPlaybackFrame, right: ProgramPlaybackFrame): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Resolution resumes by replaying from the immutable turn-start state. An
 * answered Option decision can therefore replace the last provisional frame
 * without changing the number of frames.
 */
export function firstChangedPlaybackFrame(
  previous: readonly ProgramPlaybackFrame[],
  next: readonly ProgramPlaybackFrame[]
): number | null {
  const sharedLength = Math.min(previous.length, next.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (!sameFrame(previous[index], next[index])) return index;
  }
  return previous.length === next.length ? null : sharedLength;
}
