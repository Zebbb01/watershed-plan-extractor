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
      '| Cover Crops | ac | 500 | $55.86 | $27,930.00 |\n' +
      '| Diversion | cu yd | 8000 | $2.40 | $19,000.00 |',
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
      bmps: [bmp('Diversion', 5, 'Diversion cu yd 8000 $2.40 $19,000.00', {
        quantities: [{ raw: '8000 cu yd', scope: null }],
        unitCost: { raw: '$2.40', scope: null },
        estimatedCost: { raw: '$19,000.00', scope: null },
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
    const data = { ...empty(), bmps: [bmp('Diversion', 3, 'Diversion cu yd 8000 $2.40 $19,000.00')] };
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

  it('rejects a section label as a name, and an outreach "activity" that is a line of its cost table', () => {
    const budget = [{
      n: 24, source: 'text' as const,
      markup: '## 3. Fact Sheets\nA fact sheet will be developed at the end of the project.\n## c. Budget\nTable 9.3 Projected Costs for Fact Sheets.\n| Item | Unit | Cost | Total Cost |\n| Printing | 1,000 | 1.00/each | $1,000.00 |',
    }];
    const outreach = (name: string, quote: string) => ({ ...base(name, 24, quote), audience: null, quantity: null, timeframe: null });
    const data = { ...empty(), bmps: [bmp('BMPs', 3, 'installation of the following BMPs would help to mitigate')], outreach: [outreach('Printing', 'Printing | 1,000 | 1.00/each | $1,000.00'), outreach('Fact Sheets', 'A fact sheet will be developed at the end of the project')] };
    const { items, rejected } = verifyUnit(data, [...pages, ...budget], []);
    expect(items.bmps).toEqual([]);
    expect(items.outreach.map((o) => o.name)).toEqual(['Fact Sheets']);
    expect(rejected.map((r) => [r.name, r.reason])).toEqual([['BMPs', 'not-an-item'], ['Printing', 'not-an-item']]);
  });
});

describe('verifyUnit: nothing the model wrote reaches the report unchecked', () => {
  const page = (n: number, markup: string, source: 'text' | 'ocr' = 'text') => [{ n, markup, source }];
  const prose = page(1, 'Streambank stabilization will be installed on 2.5 miles of Broken Pumpkin Creek to reduce sediment loads.');

  it('rejects a quote whose decimal point moved (2.5 miles quoted as 25 miles)', () => {
    const data = { ...empty(), bmps: [bmp('Streambank stabilization', 1, 'Streambank stabilization will be installed on 25 miles of Broken Pumpkin Creek', { quantities: [{ raw: '25 miles', scope: null }] })] };
    const r = verifyUnit(data, prose, []);
    expect(r.items.bmps).toEqual([]);
    expect(r.rejected[0].reason).toBe('quote-not-found');
  });

  it('drops an amount whose unit is not the one written (500 feet reported as 500 acres)', () => {
    const fence = page(1, 'Fencing will be installed along 500 feet of the creek to exclude cattle from the stream channel.');
    const data = { ...empty(), bmps: [bmp('Fencing', 1, 'Fencing will be installed along 500 feet of the creek', { quantities: [{ raw: '500 acres', scope: null }] })] };
    const r = verifyUnit(data, fence, []);
    expect(r.items.bmps[0].quantities).toEqual([]);
    expect(r.rejected[0]).toMatchObject({ reason: 'number-not-in-quote' });
  });

  it('takes a table amount only from the item’s own row', () => {
    const table = page(4, '[TABLE — see image]\n| Cover Crop | ac | 2500 | $55.86 | $139,650.00 |\n| Fencing | ft | 1200 | $3.00 | $3,600.00 |');
    const wrongRow = { ...empty(), bmps: [bmp('Cover Crop', 4, 'Cover Crop', { quantities: [{ raw: '1200 ac', scope: null }] })] };
    expect(verifyUnit(wrongRow, table, [4]).items.bmps[0].quantities).toEqual([]);
    const ownRow = { ...empty(), bmps: [bmp('Cover Crop', 4, 'Cover Crop', { quantities: [{ raw: '2500 ac', scope: null }] })] };
    const kept = verifyUnit(ownRow, table, [4]).items.bmps[0];
    expect(kept.quantities[0]).toMatchObject({ value: 2500, unit: 'ac' });
    expect(kept.confidence).toBe('medium');
  });

  it('drops a spelled-out amount that is not written, and details that are not on the page', () => {
    const days = page(1, 'Three field days will be held for landowners in the watershed each year of the project.');
    const data = {
      ...empty(),
      outreach: [{
        ...base('field days', 1, 'Three field days will be held for landowners in the watershed'),
        audience: 'county commissioners', quantity: { raw: 'five field days', scope: null }, timeframe: 'Months 1-60',
      }],
    };
    const r = verifyUnit(data, days, []);
    expect(r.items.outreach[0]).toMatchObject({ quantity: null, audience: null, timeframe: null });
    expect(r.rejected.map((x) => x.reason)).toEqual(['number-not-in-quote', 'detail-not-in-source', 'detail-not-in-source']);
  });

  it('keeps a timeframe and a status only when the document states them', () => {
    const list = page(7, '[L1] 1. Work to develop, execute, and implement a Subgrant Agreement (Month 1)\n[L1] 2. Conduct inspections of BMPs during construction (Months 3-36)');
    const act = (timeframe: string, status: 'completed' | null) => ({
      ...empty(),
      implementation: [{
        ...base('Conduct inspections of BMPs during construction', 7, 'Conduct inspections of BMPs during construction'),
        responsible: [], timeframe, status, milestone: true,
      }],
    });
    expect(verifyUnit(act('Months 3-48', 'completed'), list, []).items.implementation[0]).toMatchObject({ timeframe: null, start: null, end: null, status: null });
    expect(verifyUnit(act('(Months 3-36)', null), list, []).items.implementation[0]).toMatchObject({ timeframe: '(Months 3-36)', start: 3, end: 36 });
  });

  it('keeps a completed status when the item’s own quote says so', () => {
    const done = page(9, '[L1] 3. Initiate watershed monitoring – Completed using historical data');
    const data = {
      ...empty(),
      implementation: [{
        ...base('Initiate watershed monitoring', 9, 'Initiate watershed monitoring – Completed using historical data'),
        responsible: [], timeframe: null, status: 'completed' as const, milestone: true,
      }],
    };
    expect(verifyUnit(data, done, []).items.implementation[0].status).toBe('completed');
  });

  it('drops a goal pollutant and deadline that are not in the document', () => {
    const data = { ...empty(), goals: [{ ...goal('Reduce sediment loads', 1, 'Streambank stabilization will be installed on 2.5 miles of Broken Pumpkin Creek to reduce sediment loads', ''), targets: [], pollutant: 'Phosphorus', deadline: 'by 2030' }] };
    expect(verifyUnit(data, prose, []).items.goals[0]).toMatchObject({ pollutant: null, deadline: null });
    const kept = { ...empty(), goals: [{ ...goal('Reduce sediment loads', 1, 'Streambank stabilization will be installed on 2.5 miles of Broken Pumpkin Creek to reduce sediment loads', ''), targets: [], pollutant: 'sediment', deadline: null }] };
    expect(verifyUnit(kept, prose, []).items.goals[0].pollutant).toBe('sediment');
  });

  it('checks numbers against the page itself on OCR pages', () => {
    const ocr = page(12, 'Approximately 1500 feet of fencing will be installed along Buttahatchee River to exclude cattle from the stream and riparian area.', 'ocr');
    const data = { ...empty(), bmps: [bmp('fencing', 12, 'Approximately 1600 feet of fencing will be installed along Buttahatchee River to exclude cattle from the stream and riparian area.', { quantities: [{ raw: '1600 feet', scope: null }] })] };
    const r = verifyUnit(data, ocr, []);
    expect(r.items.bmps[0].quantities).toEqual([]);
  });

  it('drops a scope that is not on the page but keeps the amount', () => {
    const data = { ...empty(), bmps: [bmp('Cover Crops', 5, 'Cover Crops ac 500 $55.86 $27,930.00', { quantities: [{ raw: '500 ac', scope: 'Phase 9 Implementation' }] })] };
    expect(verifyUnit(data, pages, [5]).items.bmps[0].quantities[0]).toMatchObject({ value: 500, scope: null });
  });

  it('empties a description that carries a number the page does not', () => {
    const data = { ...empty(), bmps: [{ ...bmp('cover crops', 3, 'prescribed burning; cover crops; critical area'), text: 'Plant 900 acres of cover crops' }] };
    expect(verifyUnit(data, pages, []).items.bmps[0].text).toBe('');
  });

  it('gives high confidence only to a quote of four words or more', () => {
    const data = { ...empty(), bmps: [bmp('cover crops', 3, 'cover crops')] };
    expect(verifyUnit(data, pages, []).items.bmps[0].confidence).toBe('medium');
  });

  it('rejects a verbatim name found only inside other words', () => {
    const road = page(2, 'Crews will install terrain gardens along the county road ditches next spring.');
    const data = { ...empty(), bmps: [bmp('Rain Garden', 2, 'Crews will install terrain gardens along the county road')] };
    expect(verifyUnit(data, road, []).rejected[0].reason).toBe('name-not-in-source');
  });
});

describe('verifyUnit on a milestone table', () => {
  const tablePage = [{
    n: 8,
    source: 'text' as const,
    markup:
      '[TABLE — see image]\n| Coordinate with the MDEQ, NRCS, | Target priority | Months 1-2 |\n' +
      '| MSWCC, USGS, and the Noxubee and | areas for BMPs |\nLowndes Co. Soil and Water Districts to',
  }];
  const activity = {
    name: 'Coordinate with the MDEQ, NRCS, MSWCC, USGS, and the Noxubee and Lowndes Co. Soil and Water Districts',
    text: 'Determine priority areas', kind: 'main' as const, parentName: null,
    evidence: [{ page: 8, quote: 'Coordinate with the MDEQ, NRCS, MSWCC, USGS, and the Noxubee and Lowndes Co. Soil and Water Districts' }],
    responsible: [], timeframe: 'Months 1-2', status: null, milestone: true,
  };

  it('accepts a quote split across table cells when the page image was sent, at medium confidence', () => {
    const r = verifyUnit({ ...empty(), implementation: [activity] }, tablePage, [8]);
    expect(r.items.implementation[0]).toMatchObject({ confidence: 'medium', source: 'table' });
  });

  it('checks a verbatim name against the page, not against a quote stitched from table cells', () => {
    const stitched = {
      name: 'Target priority areas', text: 'x', kind: 'main' as const, parentName: null,
      evidence: [{ page: 8, quote: 'Target priority areas for BMPs' }],
      audience: null, quantity: null, timeframe: null,
    };
    const r = verifyUnit({ ...empty(), outreach: [stitched] }, tablePage, [8]);
    expect(r.items.outreach).toEqual([]);
    expect(r.rejected[0].reason).toBe('name-not-in-source');
  });

  it('does not accept the split quote on a page that is not a table', () => {
    const r = verifyUnit({ ...empty(), implementation: [activity] }, tablePage, []);
    expect(r.items.implementation).toEqual([]);
  });
});
