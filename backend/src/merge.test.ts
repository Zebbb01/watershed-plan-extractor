import { describe, expect, it } from 'vitest';
import type { ActivityItem, AreaItem, BmpItem, GoalItem, Quantity, UnitItems } from './schema';
import { mergeUnits } from './merge';
import { computeSummary } from './summary';

const q = (raw: string, value: number, unit: string, scope: string | null = null): Quantity =>
  ({ raw, value, valueMax: null, unit, comparator: '=', scope });
const baseItem = (name: string, page: number) => ({
  id: `${name}-${page}`, name, text: name, kind: 'main' as const, parentId: null,
  evidence: [{ page, quote: name }], verified: true, confidence: 'high' as const, source: 'text' as const, needsReview: null,
});
const bmp = (name: string, page: number, quantities: Quantity[] = []): BmpItem => ({
  ...baseItem(name, page), quantities, unitCost: null, estimatedCost: null, pollutants: [],
});
const goal = (name: string, page: number, kind: GoalItem['kind'] = 'main', parentName?: string): GoalItem & { parentName?: string } => ({
  ...baseItem(name, page), kind, targets: [], pollutant: null, deadline: null, ...(parentName ? { parentName } : {}),
});
const activity = (name: string, status: ActivityItem['status']): ActivityItem => ({
  ...baseItem(name, 7), responsible: [], timeframe: null, start: null, end: null, timeUnit: null, status, milestone: false,
});
const area = (name: string, role: AreaItem['role']): AreaItem => ({
  ...baseItem(name, 1), type: 'county', code: null, areaAcres: null, role,
});
const unit = (items: Partial<UnitItems>) => ({
  items: { goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [], ...items },
  rejected: [],
});

describe('mergeUnits', () => {
  it('returns six empty arrays and zero summary for no units', () => {
    const { report, conflicts } = mergeUnits([]);
    expect(report).toEqual({ goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] });
    expect(conflicts).toEqual([]);
    expect(computeSummary(report)).toEqual({
      summary: { totalGoals: 0, totalBMPs: 0, completionRate: 0 },
      completionBasis: 'No implementation activities found',
    });
  });

  it('merges the same BMP named in singular and plural across units', () => {
    const { report } = mergeUnits([
      unit({ bmps: [bmp('Grade Stabilization Structures', 3)] }),
      unit({ bmps: [bmp('grade stabilization structure', 5)] }),
    ]);
    expect(report.bmps).toHaveLength(1);
    expect(report.bmps[0].evidence.map((e) => e.page)).toEqual([3, 5]);
  });

  it('merges Fence with Fencing and a shorter name contained in a longer one', () => {
    const { report } = mergeUnits([
      unit({ bmps: [bmp('Fence', 4), bmp('Herbaceous Weed Management', 4)] }),
      unit({ bmps: [bmp('fencing', 3), bmp('weed management', 3)] }),
    ]);
    expect(report.bmps.map((b) => b.name).sort()).toEqual(['Fence', 'Herbaceous Weed Management']);
  });

  it('keeps one item and flags a conflict when the same scope gives two values', () => {
    const { report, conflicts } = mergeUnits([
      unit({ bmps: [bmp('Grade Stabilization Structure', 19, [q('12 grade stabilization structures', 12, 'grade stabilization structures')])] }),
      unit({ bmps: [bmp('Grade Stabilization Structure', 40, [q('8 grade stabilization structures', 8, 'grade stabilization structures')])] }),
    ]);
    expect(report.bmps).toHaveLength(1);
    expect(report.bmps[0].needsReview).toMatch(/12.*8|8.*12/);
    expect(conflicts).toEqual([{
      category: 'bmps', name: 'Grade Stabilization Structure',
      values: [{ raw: '12 grade stabilization structures', page: 19 }, { raw: '8 grade stabilization structures', page: 40 }],
    }]);
  });

  it('keeps quantities from different scopes without a conflict, and drops exact duplicates', () => {
    const { report, conflicts } = mergeUnits([
      unit({ bmps: [bmp('Grade Stabilization Structure', 4, [q('18', 18, 'ea', 'Cost Estimate: Full Project Implementation')])] }),
      unit({ bmps: [bmp('Grade Stabilization Structure', 5, [
        q('8', 8, 'ea', 'Cost Estimate: Phase 1 Implementation'),
        q('8', 8, 'ea', 'Cost Estimate: Phase 1 Implementation'),
      ])] }),
    ]);
    expect(report.bmps[0].quantities.map((x) => x.value)).toEqual([18, 8]);
    expect(conflicts).toEqual([]);
  });

  it('links a sub-item to its parent by name, and leaves an unknown parent empty', () => {
    const { report } = mergeUnits([unit({
      goals: [
        goal('Reduce sediment loads', 8),
        goal('Stabilize stream channels', 8, 'sub', 'Reduce sediment loads'),
        goal('Restore habitat', 8, 'sub', 'A goal that does not exist'),
      ],
    })]);
    const parent = report.goals.find((g) => g.name === 'Reduce sediment loads')!;
    expect(report.goals.find((g) => g.name === 'Stabilize stream channels')!.parentId).toBe(parent.id);
    expect(report.goals.find((g) => g.name === 'Restore habitat')!.parentId).toBeNull();
  });

  it('prefers the primary role when an area appears twice', () => {
    const { report } = mergeUnits([
      unit({ geographicAreas: [area('Noxubee County', 'mentioned')] }),
      unit({ geographicAreas: [area('Noxubee county', 'primary')] }),
    ]);
    expect(report.geographicAreas).toHaveLength(1);
    expect(report.geographicAreas[0].role).toBe('primary');
  });

  it('collects rejections from every unit', () => {
    const r = { category: 'bmps' as const, name: 'Bioswale', page: 3, reason: 'name-not-in-source' as const };
    expect(mergeUnits([{ ...unit({}), rejected: [r] }, { ...unit({}), rejected: [r] }]).rejected).toHaveLength(2);
  });
});

describe('computeSummary', () => {
  it('counts main goals, distinct BMPs and the share of activities reported completed', () => {
    const { report } = mergeUnits([unit({
      goals: [goal('Reduce sediment loads', 8), goal('Stabilize stream channels', 8, 'sub', 'Reduce sediment loads')],
      bmps: [bmp('Cover Crops', 5), bmp('Terraces', 5), bmp('Terrace', 4)],
      implementation: [
        activity('Initiate watershed monitoring', 'completed'),
        activity('Establish the Watershed Implementation Team', 'completed'),
        ...['Implement BMPs', 'Inspect installed BMPs', 'Hold WIT meetings', 'Collect post-BMP data', 'Finalize outreach plan', 'Submit final report']
          .map((n) => activity(n, null)),
      ],
    })]);
    expect(computeSummary(report)).toEqual({
      summary: { totalGoals: 1, totalBMPs: 2, completionRate: 0.25 },
      completionBasis: '2 of 8 activities reported completed',
    });
  });

  it('says so when activities exist but none states a status', () => {
    const { report } = mergeUnits([unit({ implementation: [activity('Implement BMPs', null)] })]);
    expect(computeSummary(report).completionBasis).toBe('No completion status reported in this document');
  });
});

describe('overviewSentence', () => {
  it('states the counts and the primary areas in one line, from code not prose', async () => {
    const { overviewSentence } = await import('./summary');
    const { report } = mergeUnits([unit({
      goals: [goal('Reduce sediment loads', 8)],
      bmps: [bmp('Cover Crops', 5), bmp('Terraces', 5)],
      geographicAreas: [area('Noxubee County', 'primary'), area('Tallahatchie County', 'mentioned')],
    })]);
    const { summary } = computeSummary(report);
    expect(overviewSentence({ ...report, summary }, 'Broken Pumpkin Watershed Plan')).toBe(
      'Broken Pumpkin Watershed Plan sets 1 goal and 2 BMPs, with 0 implementation activities, 0 monitoring metrics and 0 outreach activities, covering Noxubee County.',
    );
  });
});

describe('mergeUnits confidence', () => {
  it('keeps the lowest confidence of the copies it joins', () => {
    const high = bmp('Cover Crops', 3);
    const medium = { ...bmp('Cover Crops', 5), confidence: 'medium' as const };
    expect(mergeUnits([unit({ bmps: [high] }), unit({ bmps: [medium] })]).report.bmps[0].confidence).toBe('medium');
    expect(mergeUnits([unit({ bmps: [medium] }), unit({ bmps: [high] })]).report.bmps[0].confidence).toBe('medium');
  });
});
