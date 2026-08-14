export const MAX_PRESENTATION_REVEAL_RETRY_MS = 15_000;

export function presentationRevealRetryDelay(failedAttempts: number) {
  return Math.min(
    1_000 * 2 ** Math.max(0, failedAttempts - 1),
    MAX_PRESENTATION_REVEAL_RETRY_MS
  );
}

interface PresentationRevealRetryOptions {
  reveal: () => Promise<void>;
  shouldContinue: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
  onRetry?: (error: unknown, delay: number, failedAttempts: number) => void;
  onSuccess?: () => void;
}

const waitForRetry = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Keep a tabletop presentation checkpoint live until Firestore accepts it or
 * the canonical decision changes. A rejected first write must not permanently
 * hide the next controller task.
 */
export async function persistPresentationEventWithRetry({
  reveal,
  shouldContinue,
  wait = waitForRetry,
  onRetry = () => {},
  onSuccess = () => {}
}: PresentationRevealRetryOptions): Promise<boolean> {
  let failedAttempts = 0;
  while (shouldContinue()) {
    try {
      await reveal();
      onSuccess();
      return true;
    } catch (error) {
      failedAttempts += 1;
      if (!shouldContinue()) return false;
      const delay = presentationRevealRetryDelay(failedAttempts);
      onRetry(error, delay, failedAttempts);
      await wait(delay);
    }
  }
  return false;
}

/** Legacy name retained for callers and deployed-room compatibility tests. */
export const revealPresentationDecisionWithRetry = persistPresentationEventWithRetry;
