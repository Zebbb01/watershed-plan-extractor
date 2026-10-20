import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawPage } from '../schema';
import { buildPageModel } from './page-model';
import { annotateDocument } from './document';
import { renderMarkup } from './markup';

// Pages captured from the real test PDFs (eval/capture-fixture.ts), so layout rules are
// checked against what pdf.js actually returns, not only against synthetic items.
const fixture = (name: string): RawPage =>
  JSON.parse(readFileSync(join(import.meta.dirname, '__fixtures__', `${name}.json`), 'utf8'));
const model = (name: string) => buildPageModel(fixture(name));

describe('layout on real pages', () => {
  it('reads Bell Creek bullets as bullets, not as a table', () => {
    const p = model('bell-creek-2012-p18');
    const line = p.lines.find((l) => l.text.startsWith('Streambank and Shoreline Protection'))!;
    expect(line.kind).toBe('bullet');
    expect(p.flags.tableLike).toBe(false);
  });

  it('keeps Broken Pumpkin schedule items numbered', () => {
    const line = model('broken-pumpkin-2019-p7').lines.find((l) => l.text.includes('Subgrant Agreement'))!;
    expect(line.kind).toBe('numbered');
    expect(line.text.startsWith('1. Work to develop')).toBe(true);
  });

  it('rebuilds the cost table rows of Broken Pumpkin page 4 cell by cell', () => {
    const p = model('broken-pumpkin-2019-p4');
    expect(p.flags.tableLike).toBe(true);
    expect(renderMarkup(p)).toContain('| Cover Crop | ac | 2500 | $55.86 | $139,650.00 |');
    expect(model('broken-pumpkin-2019-p1').flags.tableLike).toBe(false);
  });

  it('flags the milestone table on page 8 so its image is sent', () => {
    expect(model('broken-pumpkin-2019-p8').flags.tableLike).toBe(true);
  });

  it('reads the Ross Barnett main column before its sidebar, and tags the sidebar', () => {
    const p = model('ross-barnett-2011-p4');
    expect(p.flags.multiColumn).toBe(true);
    const md = renderMarkup(p);
    expect(md.indexOf('Supply District jointly developed')).toBeLessThan(md.indexOf('[ASIDE] Watershed Protection'));
  });

  it('treats the Bell Creek contents page as admin-only', () => {
    const [toc] = annotateDocument([model('bell-creek-2012-p3')]);
    expect(toc.flags.adminOnly).toBe(true);
  });
});

describe('body text size on a page that also has a table', () => {
  it('keeps prose as prose on Bell Creek page 16', () => {
    const line = model('bell-creek-2012-p16').lines.find((l) => l.text.startsWith('The designated beneficial uses'))!;
    expect(line.kind).toBe('para');
  });
});
