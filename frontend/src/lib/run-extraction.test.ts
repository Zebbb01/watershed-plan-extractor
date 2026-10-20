import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '@app/backend';
import { apiCall, startExtraction } from './run-extraction';

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

describe('startExtraction', () => {
  it('returns a stored result for the same file without running the pipeline again', async () => {
    const stored = { document: { id: 'cached' } } as unknown as ExtractionResult;
    const run = vi.fn();
    const file = new File([new TextEncoder().encode('%PDF-1.7 test')], 'plan.pdf', { type: 'application/pdf' });
    const out = await startExtraction(file, () => {}, signal, {
      load: async () => stored,
      save: async () => {},
      run,
      open: async () => null,
    });
    expect(out.result).toBe(stored);
    expect(out.fromCache).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});
