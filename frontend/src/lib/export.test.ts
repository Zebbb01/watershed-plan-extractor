import { describe, expect, it } from 'vitest';
import type { BmpItem, ExtractionResult } from '@app/backend';
import { safeCell, toCsv, toJson } from './export';

const bmp = (name: string): BmpItem => ({
  id: name, name, text: name, kind: 'main', parentId: null, evidence: [{ page: 4, quote: `${name} ac 5` }],
  verified: true, confidence: 'high', source: 'table', needsReview: null,
  quantities: [{ raw: '5 ac', value: 5, valueMax: null, unit: 'ac', comparator: '=', scope: null }],
  unitCost: null, estimatedCost: null, pollutants: [],
});

describe('safeCell', () => {
  it('neutralises spreadsheet formulas', () => {
    for (const s of ['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx', '\rx']) {
      const cell = safeCell(s);
      expect((cell.startsWith('"') ? cell.slice(1) : cell).startsWith("'")).toBe(true);
    }
  });

  it('quotes commas, quotes and line breaks the RFC 4180 way', () => {
    expect(safeCell('a, b')).toBe('"a, b"');
    expect(safeCell('say "hi"')).toBe('"say ""hi"""');
    expect(safeCell('two\nlines')).toBe('"two\nlines"');
  });

  it('writes numbers plainly and empties as nothing', () => {
    expect(safeCell(5)).toBe('5');
    expect(safeCell(null)).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header and one row per item with the trace columns', () => {
    const csv = toCsv('bmps', [bmp('Brush Management'), bmp('=HYPERLINK("x")')]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('Practice');
    expect(lines[0]).toContain('Evidence quote');
    expect(lines[1]).toContain('Brush Management');
    expect(lines[2].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});

describe('toJson', () => {
  it('puts the report first with exactly the brief keys', () => {
    const result = {
      report: { summary: { totalGoals: 0, totalBMPs: 1, completionRate: 0 }, goals: [], bmps: [bmp('A')], implementation: [], monitoring: [], outreach: [], geographicAreas: [] },
      document: { id: 'x', fileName: 'x.pdf', pages: 1, title: null, year: null },
      quality: { structure: [{ page: 1, kind: 'para', level: 0, text: 'long' }] },
    } as unknown as ExtractionResult;
    const parsed = JSON.parse(toJson(result));
    expect(Object.keys(parsed)[0]).toBe('report');
    expect(Object.keys(parsed.report)).toEqual(['summary', 'goals', 'bmps', 'implementation', 'monitoring', 'outreach', 'geographicAreas']);
    expect(parsed.quality.structure).toBeUndefined();
  });
});
