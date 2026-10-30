import type { ActivityItem, GoalItem } from '@app/backend';
import { describe, expect, it } from 'vitest';
import { responsibleCounts, scheduleSpan, targetRows, tickStep } from './insights';

const pct = (raw: string, value: number, valueMax: number | null = null) => ({ raw, value, valueMax, unit: '%', comparator: null, scope: null });
const goal = (name: string, targets: ReturnType<typeof pct>[], pollutant: string | null = null) => ({ name, targets, pollutant }) as unknown as GoalItem;
const activity = (a: Partial<ActivityItem>) => ({ name: 'x', responsible: [], start: null, end: null, timeUnit: null, ...a }) as ActivityItem;

describe('targetRows', () => {
  it('gives each percentage target once, as the range written, highest first', () => {
    const rows = targetRows([
      goal('Reduce sediment', [pct('77% to 97%', 77, 97), { ...pct('500 tons', 500), unit: 'ton' }], 'Sediment'),
      goal('Reduce fecal coliform', [pct('50%', 50), pct('50 percent', 50)]),
    ]);
    expect(rows.map((r) => [r.name, r.range, r.lo, r.hi])).toEqual([
      ['Reduce sediment', '77–97%', 77, 97],
      ['Reduce fecal coliform', '50%', 50, 50],
    ]);
    // a single value is still drawn, as a sliver
    expect(rows[1].span).toBeGreaterThan(0);
  });

  it('leaves out values that are not a share of the whole', () => {
    expect(targetRows([goal('Odd', [pct('150%', 150)])])).toEqual([]);
  });
});

describe('responsibleCounts', () => {
  it('counts an organization once per activity, splitting lists written as one entry', () => {
    const rows = responsibleCounts([
      activity({ responsible: ['MDEQ, NRCS', 'mdeq'] }),
      activity({ responsible: ['MDEQ; Soil and Water Conservation District'] }),
      activity({ responsible: [] }),
    ]);
    expect(rows).toEqual([
      { name: 'MDEQ', value: 2 },
      { name: 'NRCS', value: 1 },
      { name: 'Soil and Water Conservation District', value: 1 },
    ]);
  });
});

describe('scheduleSpan', () => {
  it('spans the schedule in the unit most activities use', () => {
    expect(
      scheduleSpan([
        activity({ start: 1, end: 6, timeUnit: 'month' }),
        activity({ start: 3, end: 36, timeUnit: 'month' }),
        activity({ start: 2020, end: 2022, timeUnit: 'year' }),
      ]),
    ).toBe('Months 1–36');
    expect(scheduleSpan([activity({ start: 2020, end: 2025, timeUnit: 'year' })])).toBe('2020–2025');
    expect(scheduleSpan([activity({})])).toBeNull();
  });
});

describe('tickStep', () => {
  it('keeps about eight page labels on the axis', () => {
    expect(tickStep(11)).toBe(2);
    expect(tickStep(108)).toBe(20);
    expect(tickStep(647)).toBe(100);
  });
});
