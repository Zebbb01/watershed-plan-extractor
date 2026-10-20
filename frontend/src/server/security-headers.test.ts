import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './security-headers';

describe('contentSecurityPolicy', () => {
  it('locks scripts to the nonce and the app origin in production', () => {
    const csp = contentSecurityPolicy('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('allows eval only in development, where React needs it for error overlays', () => {
    expect(contentSecurityPolicy('abc123', true)).toContain("'unsafe-eval'");
  });
});
