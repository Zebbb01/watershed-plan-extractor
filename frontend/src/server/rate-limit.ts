/*
 * A token bucket per client address. Each serverless instance keeps its own buckets, so this
 * slows a burst from one browser but is not a hard global cap; the provider's spend limit is.
 */
// ponytail: per-instance memory; a shared store (e.g. Netlify Blobs or Upstash) if abuse appears.
const MAX_KEYS = 10_000;

export function createRateLimiter() {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return function take(key: string, now: number, perMin: number): { ok: boolean; retryAfter: number } {
    const refillPerMs = perMin / 60_000;
    const b = buckets.get(key) ?? { tokens: perMin, at: now };
    b.tokens = Math.min(perMin, b.tokens + (now - b.at) * refillPerMs);
    b.at = now;
    if (buckets.size >= MAX_KEYS && !buckets.has(key)) buckets.delete(buckets.keys().next().value!);
    buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, retryAfter: 0 };
    }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / refillPerMs / 1000)) };
  };
}

export const takeToken = createRateLimiter();

/** The caller's address as the host reports it. */
export function clientAddress(req: Request): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
