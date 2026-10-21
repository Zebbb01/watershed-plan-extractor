import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import type { ExtractRequest } from '../api';
import type { UnitExtraction } from '../schema';
import { createOpenAIClient, openaiSdk } from './openai';

const request: ExtractRequest = {
  docId: 'abc',
  unit: { index: 0, pages: [{ n: 4, markup: '| Cover Crop | ac | 2500 |', source: 'text' }], context: { title: null, outline: '', totalPages: 11, hints: [] } },
  images: [{ page: 4, jpegBase64: '/9j/AAAA' }],
};
const empty: UnitExtraction = { goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] };
const opts = { apiKey: 'k', extractionModel: 'gpt-6.1-sol', ocrModel: 'gpt-6.1-sol', effort: 'low' as 'low' | null };

describe('OpenAI adapter', () => {
  it('sends the page image as a data URL and returns the parsed output', async () => {
    let body: Record<string, unknown> = {};
    const sdk = { responses: { parse: async (b: Record<string, unknown>) => {
      body = b;
      return { status: 'completed', output_parsed: empty, usage: { input_tokens: 10, output_tokens: 5 } };
    } } } as unknown as OpenAI;
    const r = await createOpenAIClient(opts, sdk).extract(request, new AbortController().signal);
    expect(r.data).toEqual(empty);
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: null });
    expect(JSON.stringify(body.input)).toContain('data:image/jpeg;base64,/9j/AAAA');
  });

  it('reports an incomplete answer as OUTPUT_TRUNCATED', async () => {
    const sdk = { responses: { parse: async () => ({
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_parsed: null, usage: { input_tokens: 1, output_tokens: 1 },
    }) } } as unknown as OpenAI;
    await expect(createOpenAIClient(opts, sdk).extract(request, new AbortController().signal)).rejects.toMatchObject({ code: 'OUTPUT_TRUNCATED' });
  });

  it('leaves every retry to the pipeline', () => {
    expect(openaiSdk('k').maxRetries).toBe(0);
  });

  it('sends reasoning effort only to reasoning models', async () => {
    const bodies: Record<string, unknown>[] = [];
    const sdk = { responses: { parse: async (b: Record<string, unknown>) => {
      bodies.push(b);
      return { status: 'completed', output_parsed: empty, usage: { input_tokens: 1, output_tokens: 1 } };
    } } } as unknown as OpenAI;
    const signal = new AbortController().signal;
    await createOpenAIClient({ ...opts, effort: null, extractionModel: 'gpt-4.1' }, sdk).extract(request, signal);
    await createOpenAIClient({ ...opts, effort: null, extractionModel: 'gpt-6.1-sol' }, sdk).extract(request, signal);
    expect(bodies[0]).not.toHaveProperty('reasoning');
    expect(bodies[1]).toMatchObject({ reasoning: { effort: 'low' } });
  });

  it('reports a 429 as RATE_LIMITED', async () => {
    const sdk = { responses: { parse: async () => {
      throw new OpenAI.RateLimitError(429, undefined, 'slow down', new Headers({ 'retry-after': '3' }));
    } } } as unknown as OpenAI;
    await expect(createOpenAIClient(opts, sdk).extract(request, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 3 });
  });
});
