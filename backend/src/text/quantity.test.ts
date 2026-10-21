import { describe, expect, it } from 'vitest';
import { parseQuantity, parseTimeframe } from './quantity';

describe('parseQuantity', () => {
  const cases: [string, Partial<ReturnType<typeof parseQuantity>>][] = [
    ['no fewer than 1,000 informational fact sheets', { value: 1000, comparator: '>=', unit: 'informational fact sheets' }],
    ['77% to 97%', { value: 77, valueMax: 97, unit: '%', comparator: 'range' }],
    ['2,500 feet', { value: 2500, unit: 'ft', comparator: '=' }],
    ['$27,930.00', { value: 27930, unit: 'USD', comparator: '=' }],
    ['Daily Average of 5.0 mg/L', { value: 5, unit: 'mg/L' }],
    ['Not to exceed 90°F', { value: 90, unit: '°F', comparator: '<=' }],
    ['70% -  125%', { value: 70, valueMax: 125, unit: '%', comparator: 'range' }],
    ['12 grade stabilization structures', { value: 12, unit: 'grade stabilization structures', comparator: '=' }],
    ['at least two (2) demonstration farms', { value: 2, unit: 'demonstration farms', comparator: '>=' }],
    ['approximately 37% cropland', { value: 37, unit: '%', comparator: '~' }],
    ['500 ac', { value: 500, unit: 'ac' }],
    ['8000 cu yd', { value: 8000, unit: 'cu yd' }],
    ['24,573 acres', { value: 24573, unit: 'ac' }],
    ['a minimum of 3 face-to-face meetings', { value: 3, comparator: '>=', unit: 'face-to-face meetings' }],
    ['Less Than 1000 micromhos/cm', { value: 1000, comparator: '<=', unit: 'micromhos/cm' }],
    ['75 NTU', { value: 75, unit: 'NTU' }],
  ];

  for (const [raw, expected] of cases) {
    it(`parses "${raw}"`, () => {
      const q = parseQuantity(raw);
      expect(q.raw).toBe(raw);
      expect(q).toMatchObject(expected);
    });
  }

  it('returns a null value when there is no number', () => {
    expect(parseQuantity('as needed')).toMatchObject({ value: null, valueMax: null, comparator: null });
  });

  it('keeps the scope it is given', () => {
    expect(parseQuantity('500', 'Cost Estimate: Phase 1 Implementation').scope).toBe('Cost Estimate: Phase 1 Implementation');
  });
});

describe('parseTimeframe', () => {
  it('reads a month range', () => {
    expect(parseTimeframe('(Months 1-36)')).toEqual({ start: 1, end: 36, timeUnit: 'month' });
  });

  it('reads a single month', () => {
    expect(parseTimeframe('Month 0')).toEqual({ start: 0, end: 0, timeUnit: 'month' });
  });

  it('reads a later month range', () => {
    expect(parseTimeframe('Months 42-48')).toEqual({ start: 42, end: 48, timeUnit: 'month' });
  });

  it('reads a year range written in words', () => {
    expect(parseTimeframe('2011 to September 2014')).toEqual({ start: 2011, end: 2014, timeUnit: 'year' });
  });

  it('reads a bare month range like (1-36)', () => {
    expect(parseTimeframe('(1-36)')).toEqual({ start: 1, end: 36, timeUnit: 'month' });
  });

  it('returns nulls for text without a time', () => {
    expect(parseTimeframe('Ongoing')).toEqual({ start: null, end: null, timeUnit: null });
  });
});

describe('parseQuantity with numbers in brackets', () => {
  it('takes the amount, not a practice code in brackets', () => {
    expect(parseQuantity('12 grade stabilization structures (410)')).toMatchObject({ value: 12, unit: 'grade stabilization structures' });
  });

  it('takes the digits in brackets when they restate a number word', () => {
    expect(parseQuantity('at least two (2) demonstration farms')).toMatchObject({ value: 2, comparator: '>=', unit: 'demonstration farms' });
  });
});
