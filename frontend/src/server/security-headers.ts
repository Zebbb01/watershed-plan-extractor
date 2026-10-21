/*
 * Content Security Policy for every response. Scripts load only from this origin; pdf.js runs
 * in a worker from this origin; the page may only call its own API. Next.js's inline bootstrap
 * scripts need 'unsafe-inline': a per-request nonce needs middleware, which Netlify's Next.js
 * runtime cannot bundle from this build (DEPLOYMENT.md). No document text is ever rendered as
 * HTML, so an inline script has no way in. 'wasm-unsafe-eval' lets pdf.js compile its
 * WebAssembly image decoders (scanned pages); it does not allow JavaScript eval. Inline style
 * attributes are allowed because the chart and dialog libraries set them.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** Headers for every response, pages and API alike. */
export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': contentSecurityPolicy(process.env.NODE_ENV === 'development'),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Frame-Options': 'DENY',
};
