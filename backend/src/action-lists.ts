import { stripMarkup } from './layout/markup';
import type { UnitExtraction } from './schema';
import { findName } from './text/normalize';

/*
 * A list whose lead-in calls its items actions ("The following actions will need to be taken
 * to meet these goals:") holds implementation activities, even when an item reads like an
 * outcome ("Reduce sediment loads to streams"), and so do the sub-items under them. The prompt
 * says so, yet the model files such items as goals or BMPs on some runs and not on others,
 * most of all when the list starts on the page before. This moves them before verification,
 * so their category does not depend on the draw. A BMP moves only as a sub-item of an action:
 * "Install fencing" right under an actions lead-in may well be a practice the plan counts.
 */

const LIST = /^(?:• )?\[L(\d+)\] /;
const ACTION = /\b(?:actions?|tasks?|activities|steps)\b/i;

/** "The following actions will need to be taken:" calls its items actions; "Goals and actions:" does not. */
function callsItemsActions(line: string): boolean {
  const m = ACTION.exec(line);
  return m !== null && /:\s*$/.test(line) && !/\b(?:goals?|objectives?)\b/i.test(line.slice(0, m.index));
}

/** Whether lines[i] is an item of an action list, and whether it sits under another item of that list. */
function actionItem(lines: string[], i: number): { nested: boolean } | null {
  const level = Number(LIST.exec(lines[i])?.[1] ?? 0);
  if (!level) return null;
  let nested = false;
  for (let j = i - 1; j >= 0; j--) {
    const above = LIST.exec(lines[j]);
    if (above) nested ||= Number(above[1]) < level;
    // Anything else ends the list, except a wrapped item's next line and the "…" of a shortened lead.
    else if (!/^[a-z…]/.test(lines[j])) return callsItemsActions(lines[j]) ? { nested } : null;
  }
  return null;
}

export function moveActionItems(data: UnitExtraction, pages: { n: number; markup: string }[], lead = ''): UnitExtraction {
  // The unit's lines in reading order, after the end of the page before, so a list keeps its lead-in across a page break.
  const lines = lead ? lead.split('\n') : [];
  const span = new Map<number, [number, number]>();
  for (const p of pages) {
    const start = lines.length;
    lines.push(...p.markup.split('\n'));
    span.set(p.n, [start, lines.length]);
  }
  const isAction = (item: { name: string; evidence: { page: number }[] }, nestedOnly: boolean) =>
    item.evidence.some((e) => {
      const [start, end] = span.get(Math.round(e.page)) ?? [0, 0];
      for (let i = start; i < end; i++) {
        if (!LIST.test(lines[i]) || !findName(stripMarkup(lines[i]), item.name)) continue;
        const hit = actionItem(lines, i);
        return hit !== null && (hit.nested || !nestedOnly);
      }
      return false;
    });

  const goals = data.goals.filter((g) => !isAction(g, false));
  const bmps = data.bmps.filter((b) => !isAction(b, true));
  if (goals.length === data.goals.length && bmps.length === data.bmps.length) return data;
  const activity = { responsible: [], status: null, milestone: false };
  return {
    ...data,
    goals,
    bmps,
    implementation: [
      ...data.implementation,
      ...data.goals.filter((g) => !goals.includes(g)).map(({ targets, pollutant, deadline, ...rest }) => ({ ...rest, ...activity, timeframe: deadline })),
      ...data.bmps.filter((b) => !bmps.includes(b)).map(({ quantities, unitCost, estimatedCost, pollutants, ...rest }) => ({ ...rest, ...activity, timeframe: null })),
    ],
  };
}
