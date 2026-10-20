import { stripMarkup } from './layout/markup';
import type {
  ActivityItem, AreaItem, BmpItem, CategoryKey, Confidence, Evidence, GoalItem, LlmQuantityValue, MetricItem,
  OutreachItem, Quantity, Rejection, Source, UnitExtraction, UnitItems,
} from './schema';
import { findQuote, findQuoteInOrder, normalizeForMatch, numbersIn, stem } from './text/normalize';
import { parseQuantity, parseTimeframe } from './text/quantity';

/*
 * The trust boundary between the model and the screen. Nothing reaches the report unless
 * its quote is on the page, its name is in the source, and every number it carries is
 * written there too. Failures are returned as rejections with a reason, never shown as data.
 */

export interface VerifyPage {
  n: number;
  markup: string;
  source: 'text' | 'ocr';
}

type WithParent<T> = T & { parentName: string | null };
export type VerifiedItems = { [K in keyof UnitItems]: WithParent<UnitItems[K][number]>[] };

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'will', 'are', 'its', 'all', 'any', 'per']);
const words = (s: string) => normalizeForMatch(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

/** FNV-1a: a stable, dependency-free id that works in the browser and in Node. */
export function stableId(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface Context {
  category: CategoryKey;
  pages: Map<number, { text: string; source: 'text' | 'ocr' }>;
  imagePages: Set<number>;
  rejected: Rejection[];
}

interface Checked {
  evidence: Evidence[];
  sourceText: string;
  quotes: string;
  exact: boolean;
  source: Source;
}

/** Finds each quote on its page (or another page of the unit); null when none is found. */
function checkEvidence(ctx: Context, evidence: { page: number; quote: string }[]): Checked | null {
  const found: { page: number; quote: string; exact: boolean }[] = [];
  const order = [...ctx.pages.keys()];
  for (const e of evidence) {
    const quote = stripMarkup(e.quote).trim();
    if (!quote) continue;
    const candidates = [Math.round(e.page), ...order.filter((n) => n !== Math.round(e.page))];
    let hit: { page: number; exact: boolean } | null = null;
    for (const n of candidates) {
      const page = ctx.pages.get(n);
      if (!page) continue;
      const r = findQuote(page.text, quote, { fuzzy: page.source === 'ocr' });
      if (r.found) {
        hit = { page: n, exact: r.score === 1 && page.source === 'text' && n === Math.round(e.page) };
        break;
      }
    }
    if (!hit) {
      // On a table page whose image was sent, a cell's words may be split by neighbouring cells.
      const n = candidates.find((c) => ctx.imagePages.has(c) && ctx.pages.has(c) && findQuoteInOrder(ctx.pages.get(c)!.text, quote));
      if (n !== undefined) hit = { page: n, exact: false };
    }
    if (!hit) {
      // A quote may run over a page break.
      for (let i = 0; i < order.length - 1 && !hit; i++) {
        const joined = `${ctx.pages.get(order[i])!.text}\n${ctx.pages.get(order[i + 1])!.text}`;
        if (findQuote(joined, quote).found) hit = { page: order[i], exact: false };
      }
    }
    if (hit) found.push({ page: hit.page, quote, exact: hit.exact });
  }
  if (!found.length) return null;
  const pagesUsed = [...new Set(found.map((f) => f.page))];
  const source: Source = pagesUsed.some((n) => ctx.imagePages.has(n))
    ? 'table'
    : pagesUsed.some((n) => ctx.pages.get(n)?.source === 'ocr')
      ? 'ocr'
      : 'text';
  return {
    evidence: found.map(({ page, quote }) => ({ page, quote })),
    sourceText: pagesUsed.map((n) => ctx.pages.get(n)!.text).join('\n'),
    quotes: found.map((f) => f.quote).join('\n'),
    exact: found.every((f) => f.exact),
    source,
  };
}

/** Is a name written in the quotes or on the evidence pages? */
function inSource(name: string, checked: Checked, ocr: boolean): boolean {
  return findQuote(checked.quotes, name).found || findQuote(checked.sourceText, name, { fuzzy: ocr }).found;
}

/** For labels a model may shorten (goals, activities): most of their word stems must be in the source. */
function wordsInSource(name: string, checked: Checked): boolean {
  const ws = words(name).map(stem);
  if (!ws.length) return false;
  const hay = new Set(words(`${checked.quotes}\n${checked.sourceText}`).map(stem));
  return ws.filter((w) => hay.has(w)).length / ws.length >= 0.7;
}

export function verifyUnit(data: UnitExtraction, pages: VerifyPage[], imagePages: number[]): { items: VerifiedItems; rejected: Rejection[] } {
  const rejected: Rejection[] = [];
  const pageMap = new Map(pages.map((p) => [p.n, { text: stripMarkup(p.markup), source: p.source }]));
  const ctxFor = (category: CategoryKey): Context => ({ category, pages: pageMap, imagePages: new Set(imagePages), rejected });

  // Shared steps for every category: evidence, name, numbers, ids.
  function base<T extends { name: string; text: string; kind: GoalItem['kind']; parentName: string | null; evidence: { page: number; quote: string }[] }>(
    ctx: Context,
    item: T,
    verbatimName: boolean,
  ) {
    const reject = (reason: Rejection['reason']) => {
      rejected.push({ category: ctx.category, name: item.name, page: item.evidence[0]?.page ?? null, reason });
      return null;
    };
    if (!item.name?.trim() || !item.evidence?.length) return reject('invalid');
    const checked = checkEvidence(ctx, item.evidence);
    if (!checked) return reject('quote-not-found');
    const ocr = checked.source === 'ocr';
    const nameOk = verbatimName ? inSource(item.name, checked, ocr) : inSource(item.name, checked, ocr) || wordsInSource(item.name, checked);
    if (!nameOk) return reject('name-not-in-source');

    let confidence: Confidence = checked.exact && !ocr ? 'high' : 'medium';
    const quoteNumbers = new Set(numbersIn(checked.quotes));
    const pageNumbers = new Set(numbersIn(checked.sourceText));
    /** Parses an amount in code; drops it when one of its numbers is not in the source. */
    const quantity = (q: LlmQuantityValue | null | undefined): Quantity | null => {
      if (!q?.raw?.trim()) return null;
      const nums = numbersIn(q.raw);
      if (nums.some((n) => !quoteNumbers.has(n) && !pageNumbers.has(n))) {
        rejected.push({ category: ctx.category, name: `${item.name}: ${q.raw}`, page: checked.evidence[0].page, reason: 'number-not-in-quote' });
        return null;
      }
      if (nums.some((n) => !quoteNumbers.has(n))) confidence = 'medium';
      return parseQuantity(q.raw, q.scope ?? null);
    };
    /** Keeps only names written in the source, rejecting the rest. */
    const verbatimList = (names: string[]) =>
      names.filter((n) => {
        const ok = Boolean(n?.trim()) && inSource(n, checked, ocr);
        if (!ok && n?.trim()) rejected.push({ category: ctx.category, name: n, page: checked.evidence[0].page, reason: 'name-not-in-source' });
        return ok;
      });

    const common = {
      id: stableId(`${ctx.category}|${normalizeForMatch(item.name)}|${checked.evidence[0].page}`),
      name: item.name.trim(),
      text: item.text,
      kind: item.kind,
      parentId: null,
      parentName: item.parentName,
      evidence: checked.evidence,
      verified: true,
      source: checked.source,
      needsReview: null as string | null,
    };
    return { common, checked, quantity, verbatimList, confidence: () => confidence };
  }

  const keep = <T>(x: T | null): x is T => x !== null;

  const goals = data.goals.map((g) => {
    const b = base(ctxFor('goals'), g, false);
    if (!b) return null;
    const targets = g.targets.map(b.quantity).filter(keep);
    return { ...b.common, confidence: b.confidence(), targets, pollutant: g.pollutant, deadline: g.deadline } satisfies WithParent<GoalItem>;
  }).filter(keep);

  const bmps = data.bmps.map((m) => {
    const b = base(ctxFor('bmps'), m, true);
    if (!b) return null;
    const quantities = m.quantities.map(b.quantity).filter(keep);
    const unitCost = b.quantity(m.unitCost);
    const estimatedCost = b.quantity(m.estimatedCost);
    let needsReview: string | null = null;
    if (unitCost?.value && estimatedCost?.value && quantities.some((q) => q.value !== null)) {
      const matches = quantities.some((q) => q.value !== null && Math.abs(q.value * unitCost.value! - estimatedCost.value!) <= Math.max(1, estimatedCost.value! * 0.01));
      if (!matches) needsReview = 'Quantity × unit cost does not match the estimated cost.';
    }
    const pollutants = m.pollutants.filter((p) => normalizeForMatch(b.checked.sourceText).includes(normalizeForMatch(p)));
    return { ...b.common, needsReview, confidence: b.confidence(), quantities, unitCost, estimatedCost, pollutants } satisfies WithParent<BmpItem>;
  }).filter(keep);

  const implementation = data.implementation.map((a) => {
    const b = base(ctxFor('implementation'), a, false);
    if (!b) return null;
    const responsible = b.verbatimList(a.responsible);
    const time = a.timeframe ? parseTimeframe(a.timeframe) : { start: null, end: null, timeUnit: null };
    return {
      ...b.common, confidence: b.confidence(), responsible, timeframe: a.timeframe, ...time, status: a.status, milestone: a.milestone,
    } satisfies WithParent<ActivityItem>;
  }).filter(keep);

  const monitoring = data.monitoring.map((m) => {
    const b = base(ctxFor('monitoring'), m, false);
    if (!b) return null;
    if (!inSource(m.parameter, b.checked, b.checked.source === 'ocr')) {
      rejected.push({ category: 'monitoring', name: m.parameter, page: b.checked.evidence[0].page, reason: 'name-not-in-source' });
      return null;
    }
    const threshold = b.quantity(m.threshold);
    const location = m.location && inSource(m.location, b.checked, false) ? m.location : null;
    return { ...b.common, confidence: b.confidence(), parameter: m.parameter, threshold, location, frequency: m.frequency } satisfies WithParent<MetricItem>;
  }).filter(keep);

  const outreach = data.outreach.map((o) => {
    const b = base(ctxFor('outreach'), o, true);
    if (!b) return null;
    const quantity = b.quantity(o.quantity);
    return { ...b.common, confidence: b.confidence(), audience: o.audience, quantity, timeframe: o.timeframe } satisfies WithParent<OutreachItem>;
  }).filter(keep);

  const geographicAreas = data.geographicAreas.map((a) => {
    const b = base(ctxFor('geographicAreas'), a, true);
    if (!b) return null;
    let code = a.code?.trim() || null;
    if (code && !findQuote(b.checked.sourceText, code).found) {
      rejected.push({ category: 'geographicAreas', name: code, page: b.checked.evidence[0].page, reason: 'name-not-in-source' });
      code = null;
    }
    const acres = b.quantity(a.areaAcres);
    return { ...b.common, confidence: b.confidence(), type: a.type, code, areaAcres: acres?.value ?? null, role: a.role } satisfies WithParent<AreaItem>;
  }).filter(keep);

  return { items: { goals, bmps, implementation, monitoring, outreach, geographicAreas }, rejected };
}
