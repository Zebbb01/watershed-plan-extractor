import type {
  ActivityItem, AnyItem, AreaItem, BmpItem, CategoryKey, Conflict, Evidence, GoalItem, MetricItem, OutreachItem,
  Quantity, Rejection, UnitItems,
} from './schema';
import { normalizeForMatch, stem } from './text/normalize';

/*
 * Joins the verified items of every unit into one report. The same BMP named in a list,
 * a cost table and an appendix becomes one item with all its evidence; amounts for
 * different phases stay separate; two different amounts for the same thing are flagged
 * for review instead of one being picked silently.
 */

type Loose<T> = T & { parentName?: string | null };
type LooseItems = { [K in keyof UnitItems]?: Loose<UnitItems[K][number]>[] };

const STOP = new Set(['and', 'of', 'for', 'the', 'to', 'in', 'with', 'a', 'an', 'on', 'at', 'by']);
const stems = (name: string) =>
  new Set(normalizeForMatch(name).replace(/&/g, ' and ').split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w)).map(stem));

/** Same thing under two spellings? Equal stems, high overlap, or (when allowed) one name inside the other. */
function sameName(a: string, b: string, minSubset: number): boolean {
  const A = stems(a);
  const B = stems(b);
  if (!A.size || !B.size) return false;
  const inter = [...A].filter((w) => B.has(w)).length;
  if (inter === A.size && inter === B.size) return true;
  if (inter / (A.size + B.size - inter) >= 0.8) return true;
  const smaller = Math.min(A.size, B.size);
  return minSubset > 0 && smaller >= minSubset && inter === smaller;
}

// How readily two names merge, per category. 0 = only on equal stems or high overlap.
const SUBSET_RULE: Record<CategoryKey, number> = {
  goals: 3, bmps: 2, implementation: 3, monitoring: 0, outreach: 2, geographicAreas: 2,
};

const quantityKey = (q: Quantity) => `${q.scope ?? ''}|${q.value}|${q.valueMax}|${q.unit ?? ''}`;
const sameQuantitySlot = (a: Quantity, b: Quantity) => (a.scope ?? '') === (b.scope ?? '') && (a.unit ?? '') === (b.unit ?? '');

function mergeEvidence(a: Evidence[], b: Evidence[]): Evidence[] {
  const seen = new Set(a.map((e) => `${e.page}|${e.quote}`));
  return [...a, ...b.filter((e) => !seen.has(`${e.page}|${e.quote}`))].sort((x, y) => x.page - y.page);
}

const first = <T>(a: T | null, b: T | null) => (a !== null && a !== undefined ? a : b);
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

export function mergeUnits(results: { items: LooseItems; rejected: Rejection[] }[]): {
  report: UnitItems;
  conflicts: Conflict[];
  rejected: Rejection[];
} {
  const conflicts: Conflict[] = [];
  const rejected = results.flatMap((r) => r.rejected);
  // page of the item a quantity came from, so a conflict can point at both places
  const quantityPage = new WeakMap<Quantity, number>();

  function mergeCategory<T extends AnyItem>(key: CategoryKey, combine: (into: Loose<T>, from: Loose<T>) => void): T[] {
    const out: Loose<T>[] = [];
    for (const r of results) {
      for (const raw of (r.items[key as keyof LooseItems] ?? []) as unknown as Loose<T>[]) {
        const item = structuredClone(raw);
        if (key === 'bmps') for (const q of (item as unknown as BmpItem).quantities) quantityPage.set(q, item.evidence[0]?.page ?? 0);
        const match = out.find((o) =>
          (key !== 'geographicAreas' || (o as unknown as AreaItem).type === (item as unknown as AreaItem).type) &&
          sameName(key === 'monitoring' ? (o as unknown as MetricItem).parameter : o.name,
            key === 'monitoring' ? (item as unknown as MetricItem).parameter : item.name, SUBSET_RULE[key]));
        if (!match) {
          out.push(item);
          continue;
        }
        match.evidence = mergeEvidence(match.evidence, item.evidence);
        if (item.kind === 'main') match.kind = 'main';
        if (item.confidence === 'high') match.confidence = 'high';
        match.needsReview = [match.needsReview, item.needsReview].filter(Boolean).join(' ') || null;
        match.parentName = match.parentName ?? item.parentName ?? null;
        combine(match, item);
      }
    }
    // Resolve sub-items to their parent's id; an unknown parent stays empty.
    for (const item of out) {
      if (item.parentName) {
        const parent = out.find((o) => o !== item && sameName(o.name, item.parentName!, 0));
        item.parentId = parent ? parent.id : null;
      }
      delete item.parentName;
    }
    return out as T[];
  }

  const goals = mergeCategory<GoalItem>('goals', (into, from) => {
    const seen = new Set(into.targets.map((t) => normalizeForMatch(t.raw)));
    into.targets.push(...from.targets.filter((t) => !seen.has(normalizeForMatch(t.raw))));
    into.pollutant = first(into.pollutant, from.pollutant);
    into.deadline = first(into.deadline, from.deadline);
  });

  const bmps = mergeCategory<BmpItem>('bmps', (into, from) => {
    const keys = new Set(into.quantities.map(quantityKey));
    for (const q of from.quantities) {
      if (keys.has(quantityKey(q))) continue;
      const clash = into.quantities.find((x) => sameQuantitySlot(x, q) && x.value !== q.value);
      if (clash) {
        const values = [clash, q].map((x) => ({ raw: x.raw, page: quantityPage.get(x) ?? 0 }));
        const existing = conflicts.find((c) => c.category === 'bmps' && c.name === into.name);
        if (existing) existing.values.push(values[1]);
        else conflicts.push({ category: 'bmps', name: into.name, values });
        const note = `The document gives different amounts: ${clash.raw} (p. ${values[0].page}) and ${q.raw} (p. ${values[1].page}).`;
        into.needsReview = [into.needsReview, note].filter(Boolean).join(' ');
      }
      into.quantities.push(q);
      keys.add(quantityKey(q));
    }
    into.unitCost = first(into.unitCost, from.unitCost);
    into.estimatedCost = first(into.estimatedCost, from.estimatedCost);
    into.pollutants = union(into.pollutants, from.pollutants);
  });

  const implementation = mergeCategory<ActivityItem>('implementation', (into, from) => {
    into.responsible = union(into.responsible, from.responsible);
    if (into.timeframe === null && from.timeframe !== null) {
      Object.assign(into, { timeframe: from.timeframe, start: from.start, end: from.end, timeUnit: from.timeUnit });
    }
    if (from.status === 'completed' || into.status === null) into.status = from.status ?? into.status;
    into.milestone = into.milestone || from.milestone;
  });

  const monitoring = mergeCategory<MetricItem>('monitoring', (into, from) => {
    into.threshold = first(into.threshold, from.threshold);
    into.location = first(into.location, from.location);
    into.frequency = first(into.frequency, from.frequency);
  });

  const outreach = mergeCategory<OutreachItem>('outreach', (into, from) => {
    into.audience = first(into.audience, from.audience);
    into.quantity = first(into.quantity, from.quantity);
    into.timeframe = first(into.timeframe, from.timeframe);
  });

  const geographicAreas = mergeCategory<AreaItem>('geographicAreas', (into, from) => {
    if (from.role === 'primary') into.role = 'primary';
    into.code = first(into.code, from.code);
    into.areaAcres = first(into.areaAcres, from.areaAcres);
  });

  return { report: { goals, bmps, implementation, monitoring, outreach, geographicAreas }, conflicts, rejected };
}
