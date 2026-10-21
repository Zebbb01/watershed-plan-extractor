import { describe, expect, it } from 'vitest';
import type { Line, PageModel } from './layout/page-model';
import { buildUnits, regexHints, splitUnit } from './units';

const line = (text: string, kind: Line['kind'] = 'para'): Line => ({ text, x: 72, y: 100, size: 11, bold: false, kind, level: 0 });
const page = (n: number, lines: Line[], flags: Partial<PageModel['flags']> = {}, source: PageModel['source'] = 'text'): PageModel => ({
  n,
  source,
  lines,
  flags: { scanned: false, tableLike: false, multiColumn: false, adminOnly: false, ...flags },
  charCount: lines.reduce((s, l) => s + l.text.length, 0),
});
const filler = (chars: number, word = 'background') => line(`${word} `.repeat(Math.ceil(chars / (word.length + 1))).slice(0, chars));

describe('buildUnits', () => {
  it('keeps every unit within 3 pages and 12 000 characters', () => {
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, [filler(3000)]));
    const { units } = buildUnits(pages);
    for (const u of units) {
      expect(u.pages.length).toBeLessThanOrEqual(3);
      expect(u.pages.reduce((s, p) => s + p.markup.length, 0)).toBeLessThanOrEqual(12_000);
    }
    expect(units.flatMap((u) => u.pages.map((p) => p.n)).sort((a, b) => a - b)).toEqual(pages.map((p) => p.n));
  });

  it('splits a run of large pages by characters before the page cap', () => {
    const pages = Array.from({ length: 4 }, (_, i) => page(i + 1, [filler(6_000)]));
    const { units } = buildUnits(pages);
    expect(units.every((u) => u.pages.length <= 2)).toBe(true);
  });

  it('gives pages dense with rows and list items a unit of their own, so one answer stays short', () => {
    const dense = (n: number) => page(n, Array.from({ length: 30 }, (_, i) => line(`Practice ${i} | ac | ${i}`, 'table')), { tableLike: true });
    const { units } = buildUnits([dense(1), dense(2), dense(3)]);
    expect(units.map((u) => u.pages.length)).toEqual([1, 1, 1]);
  });

  it('skips admin-only, blank and figure-only pages with a reason', () => {
    const { units, skipped } = buildUnits([
      page(1, [filler(800, 'goal')]),
      page(2, [line('TABLE OF CONTENTS', 'heading')], { adminOnly: true }),
      page(3, []),
      page(4, [line('Figure 1: Broken Pumpkin Creek Watershed Landuse', 'aside')]),
      page(5, [filler(800, 'monitoring')]),
    ]);
    expect(skipped.map((s) => s.page)).toEqual([2, 3, 4]);
    expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
    expect(units.flatMap((u) => u.pages.map((p) => p.n))).toEqual([1, 5]);
  });

  it('lists table-like pages for page images', () => {
    const { units } = buildUnits([page(1, [filler(500)]), page(2, [filler(500)], { tableLike: true })]);
    expect(units.flatMap((u) => u.imagePages)).toEqual([2]);
  });

  it('carries the OCR source through to the unit', () => {
    const { units } = buildUnits([page(7, [filler(500)], {}, 'ocr')]);
    expect(units[0].pages[0].source).toBe('ocr');
  });

  it('orders units by relevance, most relevant first', () => {
    const pages = [
      ...Array.from({ length: 6 }, (_, i) => page(i + 1, [filler(3000, 'history')])),
      ...Array.from({ length: 6 }, (_, i) => page(i + 7, [filler(3000, 'BMP milestone monitoring acres')])),
    ];
    const { units } = buildUnits(pages);
    expect(units[0].pages[0].n).toBe(7);
    expect(units[0].relevance).toBeGreaterThan(units[units.length - 1].relevance);
  });

  it('numbers units 0..n-1 in the order returned', () => {
    const pages = Array.from({ length: 7 }, (_, i) => page(i + 1, [filler(3000)]));
    expect(buildUnits(pages).units.map((u) => u.index)).toEqual([0, 1, 2]);
  });
});

describe('splitUnit', () => {
  const { units } = buildUnits(Array.from({ length: 4 }, (_, i) => page(i + 1, [filler(500)], { tableLike: i === 3 })), { maxPages: 4 });

  it('halves a 4-page unit and keeps each half its own image pages', () => {
    const halves = splitUnit(units[0])!;
    expect(halves.map((h) => h.pages.map((p) => p.n))).toEqual([[1, 2], [3, 4]]);
    expect(halves.map((h) => h.imagePages)).toEqual([[], [4]]);
  });

  it('returns null for a one-page unit', () => {
    const one = buildUnits([page(9, [filler(500)])]).units[0];
    expect(splitUnit(one)).toBeNull();
  });
});

describe('regexHints', () => {
  it('finds HUC codes, acreage and counties', () => {
    const hints = regexHints(
      'HUC 031601060307 ... covering 24,573 acres ... located in Noxubee and Lowndes counties ... Tallahatchie County SWCD',
    );
    expect(hints).toEqual(expect.arrayContaining([
      'HUC 031601060307', '24,573 acres', 'Noxubee County', 'Lowndes County', 'Tallahatchie County',
    ]));
  });

  it('finds month timeframes and dollar amounts', () => {
    const hints = regexHints('Implement BMPs (Months 6-36) at an estimated $341,517.98');
    expect(hints).toEqual(expect.arrayContaining(['Months 6-36', '$341,517.98']));
  });
});
