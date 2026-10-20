import { describe, expect, it } from 'vitest';
import type { ExtractRequest } from './api';
import type { LlmClient } from './llm/provider';
import { handleExtract } from './handlers';

const request: ExtractRequest = {
  docId: 'abc',
  unit: {
    index: 3,
    pages: [{ n: 5, markup: '[TABLE — see image]\n| Cover Crops | ac | 500 | $55.86 | $27,930.00 |', source: 'text' }],
    context: { title: null, outline: '', totalPages: 11, hints: [] },
  },
  images: [{ page: 5, jpegBase64: '/9j/x' }],
};

const bmp = (name: string, quote: string) => ({
  name, text: name, kind: 'main' as const, parentName: null, evidence: [{ page: 5, quote }],
  quantities: [{ raw: '500 ac', scope: null }], unitCost: null, estimatedCost: null, pollutants: [],
});

describe('handleExtract', () => {
  it('returns only verified items, lists the rest as rejected, and passes usage through', async () => {
    const client: LlmClient = {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      extract: async () => ({
        data: {
          goals: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [],
          bmps: [bmp('Cover Crops', 'Cover Crops | ac | 500'), bmp('Bioswale', 'Bioswale 2 ea')],
        },
        usage: { inputTokens: 900, outputTokens: 120, costUsd: 0.006 },
      }),
      ocr: async () => ({ pages: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }),
    };
    const res = await handleExtract(request, client, new AbortController().signal);
    expect(res.unitIndex).toBe(3);
    expect(res.items.bmps.map((b) => b.name)).toEqual(['Cover Crops']);
    expect(res.items.bmps[0]).toMatchObject({ source: 'table', quantities: [{ value: 500, unit: 'ac' }] });
    expect(res.rejected).toEqual([expect.objectContaining({ name: 'Bioswale', reason: 'quote-not-found' })]);
    expect(res.usage).toEqual({ inputTokens: 900, outputTokens: 120, costUsd: 0.006 });
  });
});
