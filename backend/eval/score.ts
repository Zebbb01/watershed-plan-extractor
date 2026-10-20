import type { AnyItem, CategoryKey, ExtractionResult, Kind } from '../src/schema';
import { CATEGORY_KEYS } from '../src/schema';
import { findQuote, normalizeForMatch, stem } from '../src/text/normalize';

/*
 * Scores one extraction against hand-checked ground truth. Items match by name (stems, so
 * "Terraces" matches "terrace"; aliases allowed), one-to-one, best match first. Numbers count
 * as right only when value and unit both match. Any predicted name that is not written in the
 * PDF is a verbatim violation: the brief allows zero.
 */

export interface GtQuantity {
  raw: string;
  value: number;
  unit?: string;
  scope?: string;
}
export interface GtItem {
  category: CategoryKey;
  name: string;
  page: number;
  quote: string;
  kind: Kind;
  quantities?: GtQuantity[];
  aliases?: string[];
}
export interface GroundTruth {
  doc: string;
  /** 'all' or the pages the ground truth covers (scanned documents are labelled in part) */
  scope: 'all' | number[];
  notes?: string;
  items: GtItem[];
}

interface Prf {
  gt: number;
  predicted: number;
  matched: number;
  precision: number;
  recall: number;
  f1: number;
}
export interface DocScore {
  doc: string;
  categories: Record<CategoryKey, Prf>;
  core: Prf;
  all: Prf;
  numeric: { correct: number; total: number; accuracy: number };
  categoryAccuracy: number;
  kindAccuracy: number;
  verbatimViolations: string[];
  timeMs: number;
  costUsd: number | null;
}

const CORE: CategoryKey[] = ['goals', 'bmps', 'implementation', 'outreach'];
const THRESHOLD = 0.6;
const STOP = new Set(['and', 'of', 'for', 'the', 'to', 'in', 'with', 'a', 'an', 'on', 'at', 'by']);
const stems = (s: string) => new Set(normalizeForMatch(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w)).map(stem));

export function nameSimilarity(a: string, b: string): number {
  const A = stems(a);
  const B = stems(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  if (inter === Math.min(A.size, B.size) && Math.max(A.size, B.size) - inter <= 3) return Math.max(0.9, (2 * inter) / (A.size + B.size));
  return (2 * inter) / (A.size + B.size);
}

const prf = (gt: number, predicted: number, matched: number): Prf => {
  const precision = predicted ? matched / predicted : gt ? 0 : 1;
  const recall = gt ? matched / gt : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { gt, predicted, matched, precision, recall, f1 };
};

// Measures compare as written; counted things ("12 structures", "5 each", "2 demonstration farms") compare as counts.
const MEASURES = new Set(["ac", "ft", "mi", "cu yd", "%", "usd", "mg/l", "ntu", "°f", "°c", "gal", "lb", "ton", "sq ft", "micromhos/cm"]);
const UNIT = (u: string | null | undefined) => {
  const n = normalizeForMatch(u ?? "").replace(/^acres?$/, "ac").replace(/^(feet|foot)$/, "ft");
  return MEASURES.has(n) ? n : n ? "count" : "";
};

/** Every number an item reports, with its unit. */
function valuesOf(category: CategoryKey, item: AnyItem): { value: number; unit: string | null }[] {
  const out: { value: number | null; unit: string | null }[] = [];
  const i = item as unknown as Record<string, unknown>;
  const push = (q: unknown) => {
    if (q && typeof q === 'object' && 'value' in q) out.push(q as { value: number | null; unit: string | null });
  };
  if (category === 'bmps') (i.quantities as unknown[]).forEach(push), push(i.unitCost), push(i.estimatedCost);
  if (category === 'goals') (i.targets as unknown[]).forEach(push);
  if (category === 'monitoring') push(i.threshold);
  if (category === 'outreach') push(i.quantity);
  if (category === 'geographicAreas' && typeof i.areaAcres === 'number') out.push({ value: i.areaAcres, unit: 'ac' });
  return out.filter((v): v is { value: number; unit: string | null } => v.value !== null);
}

export function score(result: ExtractionResult, gt: GroundTruth, pdfText: Map<number, string>): DocScore {
  const inScope = (item: AnyItem) => gt.scope === 'all' || item.evidence.some((e) => (gt.scope as number[]).includes(e.page));
  const categories = {} as Record<CategoryKey, Prf>;
  const unmatchedGt: GtItem[] = [];
  const unmatchedPred: { category: CategoryKey; item: AnyItem }[] = [];
  let numericCorrect = 0;
  let numericTotal = 0;
  let kindRight = 0;
  let kindTotal = 0;

  for (const category of CATEGORY_KEYS) {
    const truth = gt.items.filter((g) => g.category === category);
    const preds = (result.report[category] as AnyItem[]).filter(inScope);
    const pairs: { g: number; p: number; sim: number }[] = [];
    truth.forEach((g, gi) =>
      preds.forEach((p, pi) => {
        const sim = Math.max(...[g.name, ...(g.aliases ?? [])].map((n) => nameSimilarity(n, p.name)));
        const near = p.evidence.some((e) => Math.abs(e.page - g.page) <= 1) ? 0.01 : 0;
        if (sim >= THRESHOLD) pairs.push({ g: gi, p: pi, sim: sim + near });
      }),
    );
    pairs.sort((a, b) => b.sim - a.sim);
    const usedG = new Set<number>();
    const usedP = new Set<number>();
    for (const { g, p } of pairs) {
      if (usedG.has(g) || usedP.has(p)) continue;
      usedG.add(g);
      usedP.add(p);
      const truthItem = truth[g];
      const pred = preds[p];
      kindTotal++;
      if (truthItem.kind === pred.kind) kindRight++;
      const got = valuesOf(category, pred);
      for (const q of truthItem.quantities ?? []) {
        numericTotal++;
        const ok = got.some((v) => Math.abs(v.value - q.value) <= Math.abs(q.value) * 1e-6 && (!q.unit || UNIT(q.unit) === UNIT(v.unit)));
        if (ok) numericCorrect++;
      }
    }
    truth.forEach((g, gi) => !usedG.has(gi) && unmatchedGt.push(g));
    preds.forEach((p, pi) => !usedP.has(pi) && unmatchedPred.push({ category, item: p }));
    categories[category] = prf(truth.length, preds.length, usedG.size);
  }

  // A truth item found under the wrong category counts against placement.
  let misplaced = 0;
  const taken = new Set<AnyItem>();
  for (const g of unmatchedGt) {
    const hit = unmatchedPred.find(
      (p) => p.category !== g.category && !taken.has(p.item) && Math.max(...[g.name, ...(g.aliases ?? [])].map((n) => nameSimilarity(n, p.item.name))) >= THRESHOLD,
    );
    if (hit) {
      misplaced++;
      taken.add(hit.item);
    }
  }

  const sum = (keys: CategoryKey[]) => keys.reduce((acc, k) => ({
    gt: acc.gt + categories[k].gt, predicted: acc.predicted + categories[k].predicted, matched: acc.matched + categories[k].matched,
  }), { gt: 0, predicted: 0, matched: 0 });
  const core = sum(CORE);
  const all = sum([...CATEGORY_KEYS]);

  const docText = [...pdfText.values()].join('\n');
  const verbatimViolations = docText.trim()
    ? CATEGORY_KEYS.filter((c) => c !== 'goals' && c !== 'implementation').flatMap((c) => (result.report[c] as AnyItem[]).filter((i) => !findQuote(docText, i.name).found).map((i) => `${c}: ${i.name}`))
    : [];

  return {
    doc: gt.doc,
    categories,
    core: prf(core.gt, core.predicted, core.matched),
    all: prf(all.gt, all.predicted, all.matched),
    numeric: { correct: numericCorrect, total: numericTotal, accuracy: numericTotal ? numericCorrect / numericTotal : 1 },
    categoryAccuracy: all.matched + misplaced ? all.matched / (all.matched + misplaced) : 1,
    kindAccuracy: kindTotal ? kindRight / kindTotal : 1,
    verbatimViolations,
    timeMs: result.quality.durationMs,
    costUsd: result.quality.usage.costUsd,
  };
}
