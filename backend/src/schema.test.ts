import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ExtractedReportSchema, UnitExtractionSchema, CATEGORY_KEYS } from './schema';
import { CATEGORIES } from './categories';
import { ExtractRequestSchema, OcrRequestSchema } from './api';

const page = (n: number) => ({ n, markup: `page ${n}`, source: 'text' as const });
const request = (pages: ReturnType<typeof page>[]) => ({
  docId: 'abc',
  unit: { index: 0, pages, context: { title: null, outline: '', totalPages: 20, hints: [] } },
  images: [],
});

describe('ExtractedReport contract', () => {
  it('has exactly the keys ChowaCo specified', () => {
    expect(Object.keys(ExtractedReportSchema.shape)).toEqual([
      'summary', 'goals', 'bmps', 'implementation', 'monitoring', 'outreach', 'geographicAreas',
    ]);
    expect(Object.keys(ExtractedReportSchema.shape.summary.shape)).toEqual([
      'totalGoals', 'totalBMPs', 'completionRate',
    ]);
  });
});

describe('categories', () => {
  it('cover every report array, in report order', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual([...CATEGORY_KEYS]);
    expect([...CATEGORY_KEYS]).toEqual(Object.keys(ExtractedReportSchema.shape).slice(1));
  });

  it('each carry a definition, table columns and CSV columns', () => {
    for (const c of CATEGORIES) {
      expect(c.definition.length).toBeGreaterThan(80);
      expect(c.columns.length).toBeGreaterThan(1);
      expect(c.csv.length).toBeGreaterThan(2);
    }
  });
});

describe('extract request validation', () => {
  it('accepts a normal unit', () => {
    expect(ExtractRequestSchema.safeParse(request([page(1), page(2)])).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(ExtractRequestSchema.safeParse({ ...request([page(1)]), extra: true }).success).toBe(false);
  });

  it('rejects a unit with 13 pages', () => {
    const pages = Array.from({ length: 13 }, (_, i) => page(i + 1));
    expect(ExtractRequestSchema.safeParse(request(pages)).success).toBe(false);
  });

  it('rejects a unit whose text exceeds 60 000 characters', () => {
    const big = { n: 1, markup: 'x'.repeat(60_001), source: 'text' as const };
    expect(ExtractRequestSchema.safeParse(request([big])).success).toBe(false);
  });

  it('rejects more than 8 OCR images', () => {
    const pages = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, jpegBase64: '/9j/' }));
    expect(OcrRequestSchema.safeParse({ docId: 'abc', pages }).success).toBe(false);
  });
});

describe('LLM output schema', () => {
  it('has no optional properties anywhere (structured outputs need every field required)', () => {
    const schema = z.toJSONSchema(UnitExtractionSchema) as Record<string, unknown>;
    const problems: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object' && n.properties) {
        const props = Object.keys(n.properties as object);
        const required = (n.required as string[] | undefined) ?? [];
        for (const p of props) if (!required.includes(p)) problems.push(`${path}.${p}`);
      }
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    walk(schema, '$');
    expect(problems).toEqual([]);
  });
});
