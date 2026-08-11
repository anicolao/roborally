import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PRESENTATION_REVEAL_RETRY_MS,
  presentationRevealRetryDelay,
  revealPresentationDecisionWithRetry
} from './presentation-reveal';

describe('tabletop presentation reveal retries', () => {
  it('backs off quickly and caps persistent failures', () => {
    expect([1, 2, 3, 4, 5, 6].map(presentationRevealRetryDelay)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      MAX_PRESENTATION_REVEAL_RETRY_MS,
      MAX_PRESENTATION_REVEAL_RETRY_MS
    ]);
  });

  it('recovers after rejected writes without losing the pending checkpoint', async () => {
    const reveal = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue();
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue();
    const onRetry = vi.fn();
    const onSuccess = vi.fn();

    await expect(
      revealPresentationDecisionWithRetry({
        reveal,
        shouldContinue: () => true,
        wait,
        onRetry,
        onSuccess
      })
    ).resolves.toBe(true);

    expect(reveal).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('stops retrying when the canonical decision changes', async () => {
    let current = true;
    const reveal = vi.fn(async () => {
      current = false;
      throw new Error('stale write');
    });
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue();

    await expect(
      revealPresentationDecisionWithRetry({
        reveal,
        shouldContinue: () => current,
        wait
      })
    ).resolves.toBe(false);

    expect(reveal).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });
});
