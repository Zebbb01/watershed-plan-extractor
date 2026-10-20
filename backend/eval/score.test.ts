import { describe, expect, it } from 'vitest';
import type { BmpItem, ExtractionResult, Quantity } from '../src/schema';
import { score, type GroundTruth } from './score';

const q = (value: number, unit: string): Quantity => ({ raw: `${value} ${unit}`, value, valueMax: null, unit, comparator: '=', scope: null });
const bmp = (name: string, page: number, quantities: Quantity[] = []): BmpItem => ({
  id: name, name, text: name, kind: 'main', parentId: null, evidence: [{ page, quote: name }], verified: true,
  confidence: 'high', source: 'text', needsReview: null, quantities, unitCost: null, estimatedCost: null, pollutants: [],
});
const result = (bmps: BmpItem[]): ExtractionResult => ({
  report: { summary: { totalGoals: 0, totalBMPs: bmps.length, completionRate: 0 }, goals: [], bmps, implementation: [], monitoring: [], outreach: [], geographicAreas: [] },
  document: { id: 'x', fileName: 'x.pdf', pages: 6, title: null, year: null },
  quality: {
    verifiedRate: 1, rejected: [], conflicts: [], ocrPages: [], skippedPages: [], emptyPages: [], failedUnits: [],
    provider: 'anthropic', model: 'claude-opus-5-5', durationMs: 1000, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.5 },
    completionBasis: '', structure: [],
  },
});
const gt: GroundTruth = {
  doc: 'toy',
  scope: 'all',
  items: [
    { category: 'bmps', name: 'Cover Crops', page: 5, quote: 'Cover Crops ac 500', kind: 'main', quantities: [{ raw: '500', value: 500, unit: 'ac' }] },
    { category: 'bmps', name: 'Fencing', page: 5, quote: 'Fencing ft 5509', kind: 'main', quantities: [{ raw: '5509', value: 5509, unit: 'ft' }] },
    { category: 'bmps', name: 'Terraces', page: 5, quote: 'Terraces ft 25200', kind: 'main' },
  ],
};
const pdfText = new Map([[5, 'Cover Crops ac 500 $55.86\nFencing ft 5509 $2.22\nTerraces ft 25200 $1.59']]);

describe('score', () => {
  const s = score(result([bmp('Cover Crops', 5, [q(500, 'ac')]), bmp('Fencing', 5, [q(5500, 'ft')]), bmp('Bioswale', 5)]), gt, pdfText);

  it('matches by name and gives precision and recall per category', () => {
    expect(s.categories.bmps).toMatchObject({ gt: 3, predicted: 3, matched: 2 });
    expect(s.categories.bmps.precision).toBeCloseTo(2 / 3);
    expect(s.categories.bmps.recall).toBeCloseTo(2 / 3);
  });

  it('counts a quantity as right only when value and unit both match', () => {
    expect(s.numeric).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
  });

  it('counts predicted names that are not in the PDF text', () => {
    expect(s.verbatimViolations).toEqual(['bmps: Bioswale']);
  });

  it('reports the core F1 over goals, BMPs and activities, and time and cost', () => {
    expect(s.core.f1).toBeCloseTo(2 / 3);
    expect(s).toMatchObject({ timeMs: 1000, costUsd: 0.5 });
  });

  it('matches a plural or stemmed name, and an alias', () => {
    const alias: GroundTruth = { ...gt, items: [{ ...gt.items[2], aliases: ['Terrace'] }] };
    expect(score(result([bmp('terrace', 5)]), alias, pdfText).categories.bmps.matched).toBe(1);
  });
});
