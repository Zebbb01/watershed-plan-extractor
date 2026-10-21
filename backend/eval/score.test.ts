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
    expect(s.numeric).toMatchObject({ correct: 1, total: 2, accuracy: 0.5 });
  });

  it('scores number precision too: a wrong extra number on a found item counts against it', () => {
    const extra = score(result([bmp('Cover Crops', 5, [q(500, 'ac'), q(900, 'ac')])]), gt, pdfText);
    expect(extra.numeric).toMatchObject({ correct: 1, total: 1, predicted: 2, predictedCorrect: 1, precision: 0.5 });
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

describe('score is not lenient with names', () => {
  const heavy: GroundTruth = {
    doc: 'toy', scope: 'all',
    items: [{ category: 'bmps', name: 'Heavy Use Area Protection', page: 5, quote: 'Heavy Use Area Protection', kind: 'main' }],
  };
  const text = new Map([[5, 'Heavy Use Area Protection ac 3'], [20, 'Heavy Use Area appendix']]);

  it('matches a partial name only near the labelled page', () => {
    expect(score(result([bmp('Heavy Use Area', 5)]), heavy, text).categories.bmps.matched).toBe(1);
    expect(score(result([bmp('Heavy Use Area', 20)]), heavy, text).categories.bmps.matched).toBe(0);
  });

  it('does not let a one-word name match a longer one by containment', () => {
    expect(score(result([bmp('Protection', 5)]), heavy, text).categories.bmps.matched).toBe(0);
  });

  it('checks a monitoring item by its parameter, and skips items read only from scanned pages', () => {
    const page = new Map([[5, 'Dissolved Oxygen daily average of 5.0 mg/L'], [9, '12']]);
    const metric = (name: string, parameter: string, p: number) => ({ ...bmp(name, p), parameter, threshold: null, location: null, frequency: null });
    const r = result([]);
    r.quality.ocrPages = [9];
    r.report.monitoring = [metric('Oxygen monitoring', 'Dissolved Oxygen', 5), metric('Turbidity', 'Turbidity', 5), metric('Phosphorus', 'Phosphorus', 9)] as never;
    expect(score(r, { doc: 'toy', scope: 'all', items: [] }, page).verbatimViolations).toEqual(['monitoring: Turbidity']);
  });

  it('checks names against the PDF as whole words, with its own test, keeping decimal points', () => {
    const page = new Map([[5, 'Crews will plant terrain gardens on 2.5 acres']]);
    const s = score(result([bmp('Rain Garden', 5), bmp('25 acres', 5), bmp('2.5 acres', 5)]), { doc: 'toy', scope: 'all', items: [] }, page);
    expect(s.verbatimViolations).toEqual(['bmps: Rain Garden', 'bmps: 25 acres']);
  });
});
