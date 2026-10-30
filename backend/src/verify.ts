import { stripMarkup } from './layout/markup';
import type {
  ActivityItem, AreaItem, BmpItem, CategoryKey, Confidence, Evidence, GoalItem, LlmQuantityValue, MetricItem,
  OutreachItem, Quantity, Rejection, Source, UnitExtraction, UnitItems,
} from './schema';
import { findName, findQuote, findQuoteInOrder, normalizeForMatch, numbersIn, stem } from './text/normalize';
import { parseQuantity, parseTimeframe } from './text/quantity';

/*
 * The trust boundary between the model and the screen. Nothing the model wrote reaches the
 * report unless the document says it: the quote is on the page; names, organisations, codes,
 * timeframes, audiences and other details are written there; an amount is written in the
 * quote as reported, or on the item's own table row; and every number is one the page holds.
 * A detail that fails is dropped from its item; an item whose quote or name fails is dropped.
 * Every failure is returned as a rejection with a reason, never shown as data.
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

// Unit words compare in one spelling: a table's "ac" column is the "acres" a model may write.
const UNIT_WORDS: Record<string, string> = {
  acre: 'ac', acres: 'ac', feet: 'ft', foot: 'ft', lf: 'ft', mile: 'mi', miles: 'mi', each: 'ea', lbs: 'lb', pound: 'lb',
  pounds: 'lb', tons: 'ton', gallon: 'gal', gallons: 'gal', cubic: 'cu', yard: 'yd', yards: 'yd', square: 'sq',
};
const amountWords = (s: string) => normalizeForMatch(s).split(/[^\p{L}]+/u).filter(Boolean).map((w) => UNIT_WORDS[w] ?? w);

// A name made only of section words ("Goals/Objectives", "Desired Results/Benefits", "BMPs") labels a section; it is not an item.
const LABEL_WORDS = new Set([
  'goal', 'goals', 'objective', 'objectives', 'desired', 'result', 'results', 'benefit', 'benefits', 'bmp', 'bmps', 'best',
  'management', 'practice', 'practices', 'activity', 'activities', 'action', 'actions', 'task', 'tasks', 'milestone',
  'milestones', 'outreach', 'education', 'monitoring', 'implementation',
]);
const LABEL_GLUE = new Set(['and', 'or', 'of', 'the', 'for', 'to']);
const isLabel = (name: string) => {
  const ws = normalizeForMatch(name).split(/[^\p{L}]+/u).filter((w) => w && !LABEL_GLUE.has(w));
  return ws.length > 0 && ws.every((w) => LABEL_WORDS.has(w));
};

// "Goal: Reduce sediment loads" names "Reduce sediment loads": a label in front of a name is not part of it,
// and neither is a list number ("1a. 70% reduction", "ii) Fencing").
const LABEL_PREFIX = /^(?:goals?|objectives?|actions?|tasks?|milestones?|implementation(?:\s*\/\s*action)?)\s*(?:\d+[a-z]?|[ivx]+)?\s*[:–-]\s+/i;
const LIST_NUMBER = /^\(?(?:\d{1,2}[a-z]?|[a-z]|[ivx]{1,4})[.)]\s+/;
// A goal named by the words that introduce it ("The long-term goal of the plan") rather than by what it is.
const LEAD_IN = /^(?:the |our |this )?(?:(?:long|short)-term |overall |ultimate |primary |main |general |principal )?(?:goals?|objectives?|purpose|mission)\b/i;
const IS_TO = /\b(?:is|are|will be|shall be) to (.+)/i;

/** An item's name as the plan states the thing itself; a goal named by its lead-in takes what follows "is to". */
export function tidyName(name: string, quotes: string[], goal: boolean): string {
  const n = name.replace(LABEL_PREFIX, '').replace(LIST_NUMBER, '').trim() || name;
  if (!goal || !LEAD_IN.test(n)) return n;
  const m = IS_TO.exec(n) ?? quotes.map((q) => IS_TO.exec(q)).find(Boolean);
  const outcome = m?.[1].split(/\.(?:\s|$)|;/)[0].trim().replace(/[,:]$/, '');
  return outcome && outcome.split(/\s+/).length >= 3 ? outcome : n;
}

// A row priced per piece under an outreach activity ("| Event Flyers | 300 | .60/each | $180.00 |") is what the
// activity costs, not an activity.
const UNIT_PRICE = /\d\s*\/\s*(?:each|ea)\b/i;
const isCostLine = (name: string, rows: string[]) =>
  rows.some((row) => UNIT_PRICE.test(row) && normalizeForMatch(row.replace(/^\|\s*/, '').split(' | ')[0]) === normalizeForMatch(name));

// A status counts only when the item's own quote says it.
const STATUS_WORDS: Record<string, RegExp> = {
  completed: /\b(completed|complete|done|finished|accomplished)\b/,
  'in-progress': /\b(in progress|ongoing|underway|under way|currently)\b/,
  planned: /\b(planned|proposed|scheduled|will)\b/,
};

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
  pages: Map<number, { text: string; source: 'text' | 'ocr'; rows: string[] }>;
  imagePages: Set<number>;
  rejected: Rejection[];
}

interface Checked {
  evidence: Evidence[];
  sourceText: string;
  /** table rows of the evidence pages, as marked up ("| cell | cell |") */
  rows: string[];
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
        // High confidence needs a real passage: a two-word quote proves little.
        const long = quote.split(/\s+/).length >= 4;
        hit = { page: n, exact: r.score === 1 && page.source === 'text' && n === Math.round(e.page) && long };
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
    rows: pagesUsed.flatMap((n) => ctx.pages.get(n)!.rows),
    quotes: found.map((f) => f.quote).join('\n'),
    exact: found.every((f) => f.exact),
    source,
  };
}

/**
 * Is a name written, as whole words, on the evidence pages? Checked against the page text, not
 * the model's quotes: a quote matched across interleaved table cells is not text the page holds
 * in that order. OCR text gets a near match for long names.
 */
function inSource(name: string, checked: Checked, ocr: boolean): boolean {
  if (findName(checked.sourceText, name)) return true;
  return ocr && normalizeForMatch(name).length >= 16 && findQuote(checked.sourceText, name, { fuzzy: true }).found;
}

/** Share of a label's word stems found in `hay`. */
function stemShare(name: string, hay: string): number {
  const ws = words(name).map(stem);
  if (!ws.length) return 0;
  const have = new Set(words(hay).map(stem));
  return ws.filter((w) => have.has(w)).length / ws.length;
}

/**
 * Where an amount is written: in the item's quote exactly as reported ("quote"), or, on a
 * table page, on the item's own row with every number and word of it ("row"). Null when
 * neither, or when any of its numbers (decimals included) is not on the page at all.
 */
function amountSource(raw: string, name: string, checked: Checked): 'quote' | 'row' | null {
  const nums = numbersIn(raw);
  const pageNumbers = new Set(numbersIn(checked.sourceText));
  if (nums.some((n) => !pageNumbers.has(n))) return null;
  if (findQuote(checked.quotes, raw).found) return 'quote';
  if (!nums.length) return null;
  const want = amountWords(raw);
  const onRow = checked.rows.some((row) => {
    if (!findName(row, name) && stemShare(name, row) < 0.7) return false;
    const rowNumbers = new Set(numbersIn(row));
    const rowWords = new Set(amountWords(row));
    return nums.every((n) => rowNumbers.has(n)) && want.every((w) => rowWords.has(w));
  });
  return onRow ? 'row' : null;
}

export function verifyUnit(raw: UnitExtraction, pages: VerifyPage[], imagePages: number[]): { items: VerifiedItems; rejected: Rejection[] } {
  const rejected: Rejection[] = [];
  const tidy = <T extends { name: string; evidence: { quote: string }[] }>(items: T[], goal = false) =>
    items.map((i) => ({ ...i, name: tidyName(i.name ?? '', (i.evidence ?? []).map((e) => e.quote), goal) }));
  const data: UnitExtraction = {
    goals: tidy(raw.goals, true), bmps: tidy(raw.bmps), implementation: tidy(raw.implementation),
    monitoring: tidy(raw.monitoring), outreach: tidy(raw.outreach), geographicAreas: tidy(raw.geographicAreas),
  };
  const pageMap = new Map(
    pages.map((p) => [
      p.n,
      { text: stripMarkup(p.markup), source: p.source, rows: p.markup.split('\n').filter((l) => l.startsWith('| ') || l.includes(' | ')) },
    ]),
  );
  const ctxFor = (category: CategoryKey): Context => ({ category, pages: pageMap, imagePages: new Set(imagePages), rejected });

  // Shared steps for every category: evidence, name, details, amounts, ids.
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
    const nameOk = verbatimName ? inSource(item.name, checked, ocr) : inSource(item.name, checked, ocr) || stemShare(item.name, `${checked.quotes}\n${checked.sourceText}`) >= 0.7;
    if (!nameOk) return reject('name-not-in-source');
    if (isLabel(item.name)) return reject('not-an-item');

    const page = checked.evidence[0].page;
    let confidence: Confidence = checked.exact && !ocr ? 'high' : 'medium';
    const pageNumbers = new Set(numbersIn(checked.sourceText));

    /** A detail (timeframe, audience, pollutant, scope...) is kept only when it is written in the source. */
    const detail = (value: string | null | undefined, label: string): string | null => {
      const v = value?.trim();
      if (!v) return null;
      if (inSource(v, checked, ocr)) return v;
      rejected.push({ category: ctx.category, name: `${item.name}: ${label} "${v}"`, page, reason: 'detail-not-in-source' });
      return null;
    };
    /** Parses an amount in code; drops it when it is not written as reported. */
    const quantity = (q: LlmQuantityValue | null | undefined): Quantity | null => {
      if (!q?.raw?.trim()) return null;
      const where = amountSource(q.raw, item.name, checked);
      if (!where) {
        rejected.push({ category: ctx.category, name: `${item.name}: ${q.raw}`, page, reason: 'number-not-in-quote' });
        return null;
      }
      if (where === 'row') confidence = 'medium';
      return parseQuantity(q.raw, q.scope ? detail(q.scope, 'scope') : null);
    };
    /** Keeps only names written in the source, rejecting the rest. */
    const verbatimList = (names: string[]) =>
      names.filter((n) => {
        const ok = Boolean(n?.trim()) && inSource(n, checked, ocr);
        if (!ok && n?.trim()) rejected.push({ category: ctx.category, name: n, page, reason: 'name-not-in-source' });
        return ok;
      });

    const common = {
      id: stableId(`${ctx.category}|${normalizeForMatch(item.name)}|${page}`),
      name: item.name.trim(),
      // The description is the model's wording, so it may not carry a number the page does not.
      text: numbersIn(item.text ?? '').every((n) => pageNumbers.has(n)) ? item.text : '',
      kind: item.kind,
      parentId: null,
      parentName: item.parentName,
      evidence: checked.evidence,
      verified: true,
      source: checked.source,
      needsReview: null as string | null,
    };
    return { common, checked, page, detail, quantity, verbatimList, confidence: () => confidence };
  }

  const keep = <T>(x: T | null): x is T => x !== null;

  const goals = data.goals.map((g) => {
    const b = base(ctxFor('goals'), g, false);
    if (!b) return null;
    const targets = g.targets.map(b.quantity).filter(keep);
    const pollutant = b.detail(g.pollutant, 'pollutant');
    const deadline = b.detail(g.deadline, 'deadline');
    return { ...b.common, confidence: b.confidence(), targets, pollutant, deadline } satisfies WithParent<GoalItem>;
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
    const pollutants = m.pollutants.filter((p) => findName(b.checked.sourceText, p));
    return { ...b.common, needsReview, confidence: b.confidence(), quantities, unitCost, estimatedCost, pollutants } satisfies WithParent<BmpItem>;
  }).filter(keep);

  const implementation = data.implementation.map((a) => {
    const b = base(ctxFor('implementation'), a, false);
    if (!b) return null;
    const responsible = b.verbatimList(a.responsible);
    const timeframe = b.detail(a.timeframe, 'timeframe');
    const time = timeframe ? parseTimeframe(timeframe) : { start: null, end: null, timeUnit: null };
    let status = a.status;
    if (status && !STATUS_WORDS[status].test(normalizeForMatch(b.checked.quotes))) {
      rejected.push({ category: 'implementation', name: `${a.name}: status "${status}"`, page: b.page, reason: 'detail-not-in-source' });
      status = null;
    }
    return {
      ...b.common, confidence: b.confidence(), responsible, timeframe, ...time, status, milestone: a.milestone,
    } satisfies WithParent<ActivityItem>;
  }).filter(keep);

  const monitoring = data.monitoring.map((m) => {
    const b = base(ctxFor('monitoring'), m, false);
    if (!b) return null;
    if (!inSource(m.parameter, b.checked, b.checked.source === 'ocr')) {
      rejected.push({ category: 'monitoring', name: m.parameter, page: b.page, reason: 'name-not-in-source' });
      return null;
    }
    const threshold = b.quantity(m.threshold);
    const location = b.detail(m.location, 'location');
    const frequency = b.detail(m.frequency, 'frequency');
    return { ...b.common, confidence: b.confidence(), parameter: m.parameter, threshold, location, frequency } satisfies WithParent<MetricItem>;
  }).filter(keep);

  const outreach = data.outreach.map((o) => {
    const b = base(ctxFor('outreach'), o, true);
    if (!b) return null;
    if (isCostLine(o.name, b.checked.rows)) {
      rejected.push({ category: 'outreach', name: o.name, page: b.page, reason: 'not-an-item' });
      return null;
    }
    const quantity = b.quantity(o.quantity);
    const audience = b.detail(o.audience, 'audience');
    const timeframe = b.detail(o.timeframe, 'timeframe');
    return { ...b.common, confidence: b.confidence(), audience, quantity, timeframe } satisfies WithParent<OutreachItem>;
  }).filter(keep);

  const geographicAreas = data.geographicAreas.map((a) => {
    const b = base(ctxFor('geographicAreas'), a, true);
    if (!b) return null;
    let code = a.code?.trim() || null;
    if (code && !findName(b.checked.sourceText, code)) {
      rejected.push({ category: 'geographicAreas', name: code, page: b.page, reason: 'name-not-in-source' });
      code = null;
    }
    const acres = b.quantity(a.areaAcres);
    return { ...b.common, confidence: b.confidence(), type: a.type, code, areaAcres: acres?.value ?? null, role: a.role } satisfies WithParent<AreaItem>;
  }).filter(keep);

  return { items: { goals, bmps, implementation, monitoring, outreach, geographicAreas }, rejected };
}
