import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, STATIC_SECURITY_HEADERS } from './security-headers';

describe('contentSecurityPolicy', () => {
  it('loads scripts only from the app origin in production', () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('lets pdf.js compile its WebAssembly image decoders, and nothing more', () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('allows eval only in development, where React needs it for error overlays', () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });

  it('is sent with every response, with no middleware involved', () => {
    expect(STATIC_SECURITY_HEADERS['Content-Security-Policy']).toContain("default-src 'self'");
  });
});
