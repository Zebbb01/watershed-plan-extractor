import { beforeEach, describe, expect, it, vi } from 'vitest';

// The routes' only outside dependency is the model client; everything else runs for real.
const env = { provider: 'anthropic' as 'anthropic' | null, extractionModel: 'claude-opus-5-5', ocrModel: 'claude-opus-5-5', effort: 'low', maxPages: 800, ratePerMin: 60 };
let extract: () => Promise<unknown> = async () => ({});
vi.mock('@/server/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/llm')>();
  return {
    ...actual,
    readEnv: () => env,
    createClient: () => ({ provider: 'anthropic', model: 'claude-opus-5-5', extract: () => extract(), ocr: async () => ({ pages: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) }),
  };
});

const { POST: extractRoute } = await import('@/app/api/extract/route');
const { POST: ocrRoute } = await import('@/app/api/ocr/route');

let ip = 0;
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/extract', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}`, ...headers } });
const validBody = JSON.stringify({
  docId: 'doc',
  unit: { index: 0, pages: [{ n: 1, markup: 'Cover Crops ac 500', source: 'text' }], context: { title: null, outline: '', totalPages: 1, hints: [] } },
  images: [],
});
const empty = { goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] };

describe('POST /api/extract', () => {
  beforeEach(() => {
    env.provider = 'anthropic';
    extract = async () => ({ data: empty, usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 } });
  });

  it('rejects a body that is not JSON', async () => {
    const res = await extractRoute(post('{not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: 'INVALID_INPUT', requestId: expect.any(String) });
  });

  it('rejects a request that breaks the schema', async () => {
    const res = await extractRoute(post(JSON.stringify({ docId: 'doc', extra: 1 })));
    expect(res.status).toBe(400);
  });

  it('rejects a body over 4 MB', async () => {
    const res = await extractRoute(post(validBody.replace('Cover Crops', 'x'.repeat(4_100_000))));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('INPUT_TOO_LARGE');
  });

  it('says so when no provider is configured', async () => {
    env.provider = null;
    const res = await extractRoute(post(validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('NO_PROVIDER');
  });

  it('limits one address to the per-minute budget', async () => {
    const headers = { 'x-forwarded-for': '192.168.9.9' };
    for (let i = 0; i < 60; i++) await extractRoute(post(validBody, headers));
    const res = await extractRoute(post(validBody, headers));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: expect.any(Number) });
  });

  it('returns verified items with a request id', async () => {
    const res = await extractRoute(post(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(await res.json()).toMatchObject({ unitIndex: 0, items: empty, rejected: [] });
  });

  it('maps a model failure to a code and never leaks a stack trace', async () => {
    extract = async () => {
      throw new Error('boom at secretFunction (internal.ts:12:3)');
    };
    const res = await extractRoute(post(validBody));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain('UPSTREAM_ERROR');
    expect(text).not.toContain('internal.ts');
  });
});

describe('POST /api/ocr', () => {
  it('rejects more than 8 page images', async () => {
    const pages = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, jpegBase64: '/9j/AAAA' }));
    const res = await ocrRoute(post(JSON.stringify({ docId: 'doc', pages })));
    expect(res.status).toBe(400);
  });
});
