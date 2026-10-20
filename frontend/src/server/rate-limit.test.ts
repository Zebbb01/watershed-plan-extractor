import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('rate limiter', () => {
  it('allows the per-minute budget, then asks the caller to wait', () => {
    const take = createRateLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 60; i++) expect(take('1.2.3.4', now, 60).ok).toBe(true);
    const blocked = take('1.2.3.4', now, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('refills over time and keeps callers apart', () => {
    const take = createRateLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 60; i++) take('a', now, 60);
    expect(take('b', now, 60).ok).toBe(true);
    expect(take('a', now + 2_000, 60).ok).toBe(true);
  });
});
