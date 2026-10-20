import { describe, expect, it } from 'vitest';
import type { RawPage, TextItemLite } from '../schema';
import { buildPageModel } from './page-model';
import { annotateDocument, outline } from './document';
import { renderMarkup, stripMarkup } from './markup';

const W = 612;
const H = 792;
const item = (str: string, x: number, y: number, o: Partial<TextItemLite> = {}): TextItemLite => ({
  str, x, y, w: o.w ?? str.length * 5.5, h: o.h ?? 11, font: o.font ?? 'body', bold: o.bold ?? false,
});
const raw = (n: number, items: TextItemLite[], hasImage = false): RawPage => ({ n, width: W, height: H, items, hasImage });
const prose = (y0: number, count: number, x = 72) =>
  Array.from({ length: count }, (_, i) =>
    item(`Body sentence number ${i} explains the watershed and keeps going for a while.`, x, y0 + i * 14));

describe('buildPageModel', () => {
  it('groups items on one baseline into one line, left to right', () => {
    const p = buildPageModel(raw(1, [
      item('Identification', 128, 99.8, { w: 70 }),
      item('Element', 72, 100, { w: 38 }),
      item('a:', 113, 100.3, { w: 10 }),
    ]));
    expect(p.lines.map((l) => l.text)).toEqual(['Element a: Identification']);
  });

  it('detects a private-use bullet glyph and indents it one level', () => {
    const p = buildPageModel(raw(1, [
      ...prose(100, 5),
      item('', 90, 200, { w: 5 }),
      item('Streambank and Shoreline Protection,', 108, 200),
    ]));
    const line = p.lines.find((l) => l.text.startsWith('Streambank'))!;
    expect(line.kind).toBe('bullet');
    expect(line.level).toBeGreaterThanOrEqual(1);
    expect(line.text).toBe('Streambank and Shoreline Protection,');
  });

  it('keeps the number of a numbered list item', () => {
    const p = buildPageModel(raw(1, [
      ...prose(100, 5),
      item('1.', 90, 200, { w: 8 }),
      item('Work to develop, execute, and implement a Subgrant Agreement', 108, 200),
    ]));
    const line = p.lines.find((l) => l.text.includes('Subgrant'))!;
    expect(line.kind).toBe('numbered');
    expect(line.text.startsWith('1. Work to develop')).toBe(true);
  });

  it('reads a page with a narrow sidebar column by column and tags the sidebar as aside', () => {
    const left = Array.from({ length: 12 }, (_, i) =>
      item(`Main column line ${i} about the reservoir and its watershed area.`, 72, 100 + i * 14, { w: 300 }));
    const right = Array.from({ length: 12 }, (_, i) =>
      item(`Sidebar ${i} words`, 440, 100 + i * 14, { w: 110 }));
    const p = buildPageModel(raw(1, [...right, ...left]));
    expect(p.flags.multiColumn).toBe(true);
    const md = renderMarkup(p);
    expect(md.indexOf('Main column line 11')).toBeLessThan(md.indexOf('Sidebar 0 words'));
    expect(p.lines.filter((l) => l.text.startsWith('Sidebar')).every((l) => l.kind === 'aside')).toBe(true);
  });

  it('flags a cost table as table-like and leaves a prose page alone', () => {
    const rows = ['Cover Crops', 'Diversion', 'Fencing', 'Terraces'].map((name, i) => [
      item(name, 72, 300 + i * 14, { w: 80 }),
      item('ac', 250, 300 + i * 14, { w: 12 }),
      item(String(500 + i), 320, 300 + i * 14, { w: 20 }),
      item('$55.86', 400, 300 + i * 14, { w: 30 }),
      item('$27,930.00', 480, 300 + i * 14, { w: 50 }),
    ]).flat();
    expect(buildPageModel(raw(4, [...prose(100, 5), ...rows])).flags.tableLike).toBe(true);
    expect(buildPageModel(raw(1, prose(100, 20))).flags.tableLike).toBe(false);
  });

  it('flags an image-only page as scanned and an empty page as blank', () => {
    expect(buildPageModel(raw(1, [], true)).flags.scanned).toBe(true);
    const blank = buildPageModel(raw(2, [], false));
    expect(blank.flags.scanned).toBe(false);
    expect(blank.flags.adminOnly).toBe(true);
  });

  it('detects headings by size and by the nine-element pattern', () => {
    const p = buildPageModel(raw(1, [
      item('Broken Pumpkin Watershed Plan', 72, 60, { h: 16, w: 220 }),
      ...prose(100, 5),
      item('Element c: Proposed Management Measures', 72, 200, { w: 220 }),
      ...prose(220, 3),
    ]));
    expect(p.lines.find((l) => l.text.startsWith('Broken Pumpkin'))!.kind).toBe('heading');
    expect(p.lines.find((l) => l.text.startsWith('Element c'))!.kind).toBe('heading');
  });
});

describe('annotateDocument', () => {
  const pageWith = (n: number) => raw(n, [
    item('Broken Pumpkin Creek Watershed Plan', 72, 40, { w: 200 }),
    item('FY19', 500, 40, { w: 20 }),
    ...prose(100, 10),
    item(String(n), 540, 760, { w: 6 }),
  ]);

  it('marks running headers and page numbers repeated across pages as admin', () => {
    const pages = annotateDocument([1, 2, 3, 4].map((n) => buildPageModel(pageWith(n))));
    for (const p of pages) {
      expect(p.lines.find((l) => l.text.includes('Watershed Plan FY19'))!.kind).toBe('admin');
      expect(p.lines.find((l) => l.text === String(p.n))!.kind).toBe('admin');
      expect(p.lines.filter((l) => l.kind === 'para').length).toBe(10);
    }
  });

  it('marks a table-of-contents page as admin-only', () => {
    const toc = raw(2, [
      item('TABLE OF CONTENTS', 72, 60, { h: 14, w: 150 }),
      ...['1.0 Introduction', '2.0 Watershed Description', '3.0 Goals', '4.0 Management Measures', '5.0 Monitoring'].map(
        (t, i) => item(`${t} ........................................ ${i + 1}`, 72, 100 + i * 14, { w: 450 })),
    ]);
    const [, page] = annotateDocument([buildPageModel(pageWith(1)), buildPageModel(toc)]);
    expect(page.flags.adminOnly).toBe(true);
  });

  it('marks the acknowledgements section as admin until the next heading', () => {
    const p = raw(3, [
      item('ACKNOWLEDGEMENTS', 72, 60, { h: 14, w: 150 }),
      item('Hollis Allen, MDEQ', 72, 100, { w: 100 }),
      item('John Madsen, MSU Geosystems Research Institute', 72, 114, { w: 230 }),
      item('EXECUTIVE SUMMARY', 72, 200, { h: 14, w: 150 }),
      ...prose(230, 3),
    ]);
    const [page] = annotateDocument([buildPageModel(p)]);
    expect(page.lines.find((l) => l.text.startsWith('Hollis'))!.kind).toBe('admin');
    expect(page.lines.find((l) => l.text.startsWith('Body sentence number 0'))!.kind).toBe('para');
  });

  it('builds an outline of headings with page numbers', () => {
    const pages = annotateDocument([
      buildPageModel(raw(1, [item('Element a: Identification of Causes', 72, 100, { w: 200 }), ...prose(120, 3)])),
      buildPageModel(raw(3, [item('Element c: Proposed Management Measures', 72, 100, { w: 220 }), ...prose(120, 3)])),
    ]);
    expect(outline(pages)).toBe('p1 Element a: Identification of Causes\np3 Element c: Proposed Management Measures');
  });
});

describe('renderMarkup / stripMarkup', () => {
  it('round-trips every non-admin line', () => {
    const p = annotateDocument([buildPageModel(raw(1, [
      item('Element c: Proposed Management Measures', 72, 80, { w: 220 }),
      ...prose(100, 3),
      item('', 90, 160, { w: 5 }),
      item('Fencing,', 108, 160, { w: 40 }),
    ]))])[0];
    const plain = stripMarkup(renderMarkup(p));
    for (const l of p.lines.filter((x) => x.kind !== 'admin')) expect(plain).toContain(l.text);
    expect(renderMarkup(p)).toContain('## Element c: Proposed Management Measures');
    expect(renderMarkup(p)).toMatch(/• \[L1\] Fencing,/);
  });
});
