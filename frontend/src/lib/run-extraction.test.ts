import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '@app/backend';
import { apiCall, prepareFile } from './run-extraction';

afterEach(() => vi.unstubAllGlobals());
const signal = new AbortController().signal;
const respond = (status: number, body: string, headers: Record<string, string> = {}) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers })));

describe('apiCall', () => {
  it('returns the JSON body on success', async () => {
    respond(200, JSON.stringify({ unitIndex: 1 }));
    await expect(apiCall('/api/extract', {}, signal)).resolves.toEqual({ unitIndex: 1 });
  });

  it('turns a coded 429 into RATE_LIMITED with its wait', async () => {
    respond(429, JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'slow', retryAfter: 7, requestId: 'r' } }));
    await expect(apiCall('/api/extract', {}, signal)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 7 });
  });

  it('treats a host error page (502, not JSON) as UPSTREAM_ERROR', async () => {
    respond(502, '<html>Bad gateway</html>');
    await expect(apiCall('/api/extract', {}, signal)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('treats a host timeout page (504) as TIMEOUT, so the pipeline splits the unit', async () => {
    respond(504, '<html>Timeout</html>');
    await expect(apiCall('/api/extract', {}, signal)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('treats a network failure as UPSTREAM_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(apiCall('/api/extract', {}, signal)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('prepareFile', () => {
  const file = new File([new TextEncoder().encode('%PDF-1.7 test')], 'plan.pdf', { type: 'application/pdf' });

  it('returns a stored result for the same file and its sha256 id', async () => {
    const stored = { document: { id: 'cached' }, quality: { failedUnits: [] } } as unknown as ExtractionResult;
    const open = vi.fn(async () => null);
    const out = await prepareFile(file, { load: async () => stored, open });
    expect(out.cached).toBe(stored);
    expect(out.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('runs the file again when the stored result has failed sections', async () => {
    const stored = { document: { id: 'partial' }, quality: { failedUnits: [{ index: 3, pages: [9], error: 'TIMEOUT' }] } } as unknown as ExtractionResult;
    const doc = { numPages: 11 };
    const out = await prepareFile(file, { load: async () => stored, open: async () => doc as never });
    expect(out.cached).toBeNull();
    expect(out.doc).toBe(doc);
  });

  it('opens the PDF when nothing is stored', async () => {
    const doc = { numPages: 11 };
    const out = await prepareFile(file, { load: async () => null, open: async () => doc as never });
    expect(out.cached).toBeNull();
    expect(out.doc).toBe(doc);
  });
});
