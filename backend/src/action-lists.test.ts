import { describe, expect, it } from 'vitest';
import { moveActionItems } from './action-lists';
import type { UnitExtraction } from './schema';

const item = (name: string, page: number) => ({ name, text: name, kind: 'main' as const, parentName: null, evidence: [{ page, quote: name }] });
const goal = (name: string, page = 21) => ({ ...item(name, page), targets: [], pollutant: null, deadline: null });
const bmp = (name: string, page = 21) => ({ ...item(name, page), quantities: [], unitCost: null, estimatedCost: null, pollutants: [] });
const unit = (goals: UnitExtraction['goals'], bmps: UnitExtraction['bmps'] = []): UnitExtraction => ({
  goals, bmps, implementation: [], monitoring: [], outreach: [], geographicAreas: [],
});

// Buttahatchee 2004, pages 20-21: the actions list starts at the foot of page 20 and runs on.
const lead = 'This watershed implementation plan has the following goals:\n• [L1] Maintain existing populations of mussels,\nThe following actions will need to be taken to meet these goals:\n• [L1] Develop interstate stream alliance,';
const page21 = [
  '• [L1] Reduce sediment loads to streams,',
  '• [L2] Agricultural BMPs',
  '• [L1] Manage point source discharges, and',
  '• [L1] Grassed waterways',
  '## 3.3 Management Actions',
].join('\n');

describe('moveActionItems', () => {
  it('moves goals and nested BMPs of a list whose lead-in, on the page before, calls them actions', () => {
    const out = moveActionItems(
      unit([goal('Reduce sediment loads to streams'), goal('Manage point source discharges')], [bmp('Agricultural BMPs'), bmp('Grassed waterways')]),
      [{ n: 21, markup: page21 }],
      lead,
    );
    expect(out.goals).toEqual([]);
    expect(out.implementation.map((a) => a.name)).toEqual(['Reduce sediment loads to streams', 'Manage point source discharges', 'Agricultural BMPs']);
    expect(out.implementation[0]).toMatchObject({ responsible: [], timeframe: null, status: null, milestone: false });
    // A practice right under the lead-in, not under an action, stays a BMP.
    expect(out.bmps.map((b) => b.name)).toEqual(['Grassed waterways']);
  });

  it('leaves goals under a goals lead-in, and lead-ins that are about goals first', () => {
    const data = unit([goal('Maintain existing populations of mussels', 20)]);
    expect(moveActionItems(data, [{ n: 20, markup: lead }])).toBe(data);
    const both = unit([goal('Reduce sediment loads')]);
    expect(moveActionItems(both, [{ n: 21, markup: 'Goals and actions for the watershed:\n• [L1] Reduce sediment loads' }])).toBe(both);
  });

  it('reads past the wrapped lines of a long item, but not past a paragraph', () => {
    const wrapped = 'The following tasks will be completed:\n• [L1] Survey the stream banks of the\nupper watershed in the first year\n• [L1] Reduce sediment loads';
    expect(moveActionItems(unit([goal('Reduce sediment loads')]), [{ n: 21, markup: wrapped }]).implementation).toHaveLength(1);
    const broken = 'The following tasks will be completed:\n• [L1] Survey the stream banks.\nThe plan also sets goals.\n• [L1] Reduce sediment loads';
    expect(moveActionItems(unit([goal('Reduce sediment loads')]), [{ n: 21, markup: broken }]).goals).toHaveLength(1);
  });
});
