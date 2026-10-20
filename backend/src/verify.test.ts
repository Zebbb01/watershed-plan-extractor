import { describe, expect, it } from 'vitest';
import type { UnitExtraction } from './schema';
import { verifyUnit } from './verify';

const pages = [
  {
    n: 1,
    source: 'text' as const,
    markup:
      '## Element a: Identification of Causes and Sources of Impairment\n' +
      'The Broken Pumpkin Creek watershed is located in Noxubee and Lowndes counties in east\n' +
      'central Mississippi covering 24,573 acres. Based on the ranges of stable\n' +
      'and unstable yield values, a reduction in sediment of 77% to 97% is recommended in the Broken\n' +
      'Pumpkin Creek watershed.',
  },
  {
    n: 3,
    source: 'text' as const,
    markup:
      '## Element c: Proposed Management Measures\n' +
      'installation of the following BMPs would help to mitigate sediment issues in Broken Pumpkin Creek\n' +
      'watershed: brush management; weed management; prescribed burning; cover crops; critical area\n' +
      'planting; sediment basins; diversions; ponds; fencing; filter strips and field borders;\n' +
      '• [L1] Fencing,',
  },
  {
    n: 5,
    source: 'text' as const,
    markup:
      '## Cost Estimate: Phase 1 Implementation\n[TABLE — see image]\n' +
      'Cover Crops ac 500 $55.86 $27,930.00\n' +
      'Diversion cu yd 8000 $2.40 $19,200.00',
  },
  {
    n: 7,
    source: 'text' as const,
    markup:
      '[L1] 1. Work to develop, execute, and implement a Subgrant Agreement that specifies the roles, tasks,\n' +
      'requirements, and milestones for project implementation. (Month 1)\n' +
      '[L1] 2. Facilitate, in coordination with MDEQ and other partners, meetings, media and social media\n' +
      'promotion of the project, and coordinate activities to fully implement this plan. (Months 1-36)',
  },
  {
    n: 12,
    source: 'ocr' as const,
    markup: 'The goal of the Buttahatchee River project is to reduce sediment loading from agricultural land.',
  },
];

const empty = (): UnitExtraction => ({ goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] });
const base = (name: string, page: number, quote: string) => ({
  name, text: name, kind: 'main' as const, parentName: null, evidence: [{ page, quote }],
});
const bmp = (name: string, page: number, quote: string, extra: Partial<UnitExtraction['bmps'][number]> = {}) => ({
  ...base(name, page, quote), quantities: [], unitCost: null, estimatedCost: null, pollutants: [], ...extra,
});
const goal = (name: string, page: number, quote: string, raw: string) => ({
  ...base(name, page, quote), targets: [{ raw, scope: null }], pollutant: 'sediment', deadline: null,
});

describe('verifyUnit', () => {
  it('keeps an item whose quote is on its page, with high confidence', () => {
    const data = { ...empty(), bmps: [bmp('cover crops', 3, 'prescribed burning; cover crops; critical area')] };
    const { items, rejected } = verifyUnit(data, pages, []);
    expect(rejected).toEqual([]);
    expect(items.bmps[0]).toMatchObject({ name: 'cover crops', verified: true, confidence: 'high', source: 'text' });
  });

  it('rejects a fabricated quote', () => {
    const data = { ...empty(), bmps: [bmp('cover crops', 3, 'install 40 acres of cover crops each spring')] };
    const { items, rejected } = verifyUnit(data, pages, []);
    expect(items.bmps).toEqual([]);
    expect(rejected[0]).toMatchObject({ category: 'bmps', name: 'cover crops', reason: 'quote-not-found' });
  });

  it('rejects a name that appears in neither the quote nor the page', () => {
    const data = { ...empty(), bmps: [bmp('Bioswale', 3, 'prescribed burning; cover crops; critical area')] };
    const { items, rejected } = verifyUnit(data, pages, []);
    expect(items.bmps).toEqual([]);
    expect(rejected[0].reason).toBe('name-not-in-source');
  });

  it('drops a quantity whose number is nowhere in the source but keeps the item', () => {
    const data = {
      ...empty(),
      bmps: [bmp('Cover Crops', 5, 'Cover Crops ac 500 $55.86 $27,930.00', { quantities: [{ raw: '600 acres', scope: null }] })],
    };
    const { items, rejected } = verifyUnit(data, pages, [5]);
    expect(items.bmps[0].quantities).toEqual([]);
    expect(rejected[0]).toMatchObject({ reason: 'number-not-in-quote' });
  });

  it('parses quantities in code and marks table evidence', () => {
    const data = {
      ...empty(),
      bmps: [bmp('Cover Crops', 5, 'Cover Crops ac 500 $55.86 $27,930.00', {
        quantities: [{ raw: '500 ac', scope: 'Cost Estimate: Phase 1 Implementation' }],
        unitCost: { raw: '$55.86', scope: null },
        estimatedCost: { raw: '$27,930.00', scope: null },
      })],
    };
    const b = verifyUnit(data, pages, [5]).items.bmps[0];
    expect(b.source).toBe('table');
    expect(b.quantities[0]).toMatchObject({ value: 500, unit: 'ac', scope: 'Cost Estimate: Phase 1 Implementation' });
    expect(b.estimatedCost).toMatchObject({ value: 27930, unit: 'USD' });
    expect(b.needsReview).toBeNull();
  });

  it('flags a cost row whose quantity times unit cost does not give the estimated cost', () => {
    const data = {
      ...empty(),
      bmps: [bmp('Diversion', 5, 'Diversion cu yd 8000 $2.40 $19,200.00', {
        quantities: [{ raw: '8000 cu yd', scope: null }],
        unitCost: { raw: '$2.40', scope: null },
        estimatedCost: { raw: '$27,930.00', scope: null },
      })],
    };
    const b = verifyUnit(data, pages, [5]).items.bmps[0];
    expect(b.needsReview).toMatch(/unit cost/i);
  });

  it('accepts an OCR quote with one slipped character at medium confidence', () => {
    const data = {
      ...empty(),
      goals: [goal('reduce sediment loading', 12, 'is to reduce sedirnent loading from agricultural land', '')],
    };
    data.goals[0].targets = [];
    const g = verifyUnit(data, pages, []).items.goals[0];
    expect(g).toMatchObject({ verified: true, confidence: 'medium', source: 'ocr' });
  });

  it('corrects the page when the quote sits on another page of the unit', () => {
    const data = { ...empty(), bmps: [bmp('Diversion', 3, 'Diversion cu yd 8000 $2.40 $19,200.00')] };
    const b = verifyUnit(data, pages, []).items.bmps[0];
    expect(b.evidence[0].page).toBe(5);
  });

  it('strips layout markers that the model copied into a quote', () => {
    const data = { ...empty(), bmps: [bmp('Fencing', 3, '• [L1] Fencing,')] };
    expect(verifyUnit(data, pages, []).items.bmps).toHaveLength(1);
  });

  it('parses goal targets and activity timeframes in code', () => {
    const data = {
      ...empty(),
      goals: [goal('Reduce sediment', 1, 'a reduction in sediment of 77% to 97% is recommended', '77% to 97%')],
      implementation: [{
        ...base('Facilitate meetings and media promotion', 7, 'coordinate activities to fully implement this plan. (Months 1-36)'),
        responsible: ['MDEQ', 'Imaginary Agency'], timeframe: '(Months 1-36)', status: null, milestone: false,
      }],
    };
    const { items, rejected } = verifyUnit(data, pages, []);
    expect(items.goals[0].targets[0]).toMatchObject({ value: 77, valueMax: 97, unit: '%', comparator: 'range' });
    expect(items.implementation[0]).toMatchObject({ start: 1, end: 36, timeUnit: 'month', responsible: ['MDEQ'] });
    expect(rejected).toEqual([expect.objectContaining({ reason: 'name-not-in-source', name: 'Imaginary Agency' })]);
  });

  it('gives the same id to the same item every time', () => {
    const data = { ...empty(), bmps: [bmp('cover crops', 3, 'prescribed burning; cover crops; critical area')] };
    expect(verifyUnit(data, pages, []).items.bmps[0].id).toBe(verifyUnit(data, pages, []).items.bmps[0].id);
  });

  it('rejects an item without evidence as invalid', () => {
    const data = { ...empty(), bmps: [{ ...bmp('cover crops', 3, 'x'), evidence: [] }] };
    expect(verifyUnit(data, pages, []).rejected[0].reason).toBe('invalid');
  });
});
