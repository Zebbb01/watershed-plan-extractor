import { describe, expect, it } from 'vitest';
import { findName, findQuote, findQuoteInOrder, normalizeForMatch, numbersIn, stem } from './normalize';

describe('normalizeForMatch', () => {
  it('treats en dashes and hyphens alike', () => {
    expect(normalizeForMatch('Teacher Workshops – train')).toBe(normalizeForMatch('teacher workshops - train'));
  });

  it('drops Wingdings private-use bullet glyphs', () => {
    expect(normalizeForMatch(' Fencing,')).toBe('fencing,');
  });

  it('joins a word hyphenated across a line break', () => {
    expect(normalizeForMatch('stream-\nbank')).toBe('streambank');
  });

  it('folds ligatures with NFKC', () => {
    expect(normalizeForMatch('ﬁlter strip')).toBe('filter strip');
  });

  it('collapses whitespace and curly quotes', () => {
    expect(normalizeForMatch('the  “Adopt”\n Stream')).toBe('the "adopt" stream');
  });
});

describe('findQuote', () => {
  const page =
    'Based on their analysis, installation of the following BMPs would help to mitigate sediment\n' +
    'issues in Broken Pumpkin Creek watershed: brush management; weed management; prescribed\n' +
    'burning; cover crops; critical area planting;';

  it('finds a quote that crosses a line break', () => {
    expect(findQuote(page, 'mitigate sediment issues in Broken Pumpkin Creek watershed').found).toBe(true);
  });

  it('does not find a quote with a changed word when fuzzy is off', () => {
    expect(findQuote(page, 'mitigate nutrient issues in Broken Pumpkin Creek watershed').found).toBe(false);
  });

  it('accepts a one-character OCR slip when fuzzy is on, scoring at least 0.92', () => {
    const r = findQuote(page, 'mitigate sediment issues in Broken Pumpkln Creek watershed', { fuzzy: true });
    expect(r.found).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.92);
  });

  it('rejects an unrelated sentence even when fuzzy is on', () => {
    expect(findQuote(page, 'Install twelve grade stabilization structures on Dry Creek', { fuzzy: true }).found).toBe(false);
  });
});

describe('stem', () => {
  it('maps word forms of one practice to one stem', () => {
    expect(stem('reduction')).toBe(stem('reduce'));
    expect(stem('Fencing')).toBe(stem('fence'));
    expect(stem('terraces')).toBe(stem('Terrace'));
    expect(stem('structures')).toBe(stem('structure'));
    expect(stem('diversions')).toBe(stem('diversion'));
  });

  it('keeps short words whole', () => {
    expect(stem('pond')).toBe('pond');
    expect(stem('ponds')).toBe('pond');
  });
});

describe('numbersIn', () => {
  it('reads plain, decimal and thousands-separated numbers', () => {
    expect(numbersIn('5000 $3.34 $7,317.50')).toEqual([5000, 3.34, 7317.5]);
  });

  it('reads both ends of a range and ignores HUC-length codes as one number', () => {
    expect(numbersIn('77% to 97% in HUC 031601060307')).toEqual([77, 97, 31601060307]);
  });
});

describe('findQuoteInOrder', () => {
  const table =
    'Coordinate with the MDEQ, NRCS, | Target priority | Months 1-2\n' +
    'MSWCC, USGS, and the Noxubee and | areas for BMPs\n' +
    'Lowndes Co. Soil and Water Districts to';

  it('finds a quote whose words are split by other table cells', () => {
    expect(findQuoteInOrder(table, 'Coordinate with the MDEQ, NRCS, MSWCC, USGS, and the Noxubee and Lowndes Co.')).toBe(true);
  });

  it('rejects the same words out of order', () => {
    expect(findQuoteInOrder(table, 'Lowndes Co. Coordinate with the MDEQ, NRCS, MSWCC')).toBe(false);
  });

  it('rejects a quote with a word that is not there', () => {
    expect(findQuoteInOrder(table, 'Coordinate with the EPA, NRCS, MSWCC, USGS')).toBe(false);
  });
});

describe('decimal points and whole words', () => {
  it('keeps decimal points: 25 miles is not 2.5 miles', () => {
    expect(findQuote('installed on 2.5 miles of creek', 'installed on 25 miles').found).toBe(false);
    expect(findQuote('installed on 2.5 miles of creek', 'installed on 2.5 miles').found).toBe(true);
    expect(findQuote('a total of $27,930.00 for the project', 'a total of $27,930.00').found).toBe(true);
  });

  it('finds a name only as whole words, allowing a plural ending', () => {
    expect(findName('drain garden and terrain gardens', 'Rain Garden')).toBe(false);
    expect(findName('install rain gardens near homes', 'Rain Garden')).toBe(true);
    expect(findName('Stream-\nbank Protection on 2 miles', 'Streambank Protection')).toBe(true);
    expect(findName('Cover Crops; Fencing', 'Cover Crop')).toBe(true);
    expect(findName('Fencing', 'Fence')).toBe(false);
  });
});
