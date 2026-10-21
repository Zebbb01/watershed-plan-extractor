import type { PageModel } from './layout/page-model';
import { renderMarkup } from './layout/markup';

/*
 * Splits a document into work units: runs of consecutive pages small enough for one fast
 * model call. Pages with nothing to extract are skipped with a reason the user can see.
 * Units are ordered so the most relevant sections run first and fill the dashboard early.
 */

export interface UnitPage {
  n: number;
  markup: string;
  source: 'text' | 'ocr';
}

export interface Unit {
  index: number;
  pages: UnitPage[];
  /** pages whose image goes with the text (tables) */
  imagePages: number[];
  relevance: number;
}

const KEYWORDS =
  /\b(goals?|objectives?|bmps?|best management practices?|practices?|milestones?|schedule|implement\w*|monitor\w*|education|outreach|workshops?|acres?|feet|count(y|ies)|hucs?|load reductions?|tmdls?|costs?|budgets?|phase)\b/gi;
const CAPTION = /^(figure|fig\.|photo|map|image)\b/i;

const relevanceOf = (markup: string) => ((markup.match(KEYWORDS)?.length ?? 0) * 1000) / Math.max(500, markup.length);

/** Skip reason for a scanned page whose transcription came back empty. */
export const UNREADABLE_SCAN = 'Scanned page that could not be read';

export function buildUnits(
  pages: PageModel[],
  opts: { maxChars?: number; maxPages?: number } = {},
): { units: Unit[]; skipped: { page: number; reason: string }[] } {
  // Sized so an answer stays well inside one call's 50 s: three pages at most, and at most about
  // 40 table rows and list items, since every row or item tends to come back as an item.
  const maxChars = opts.maxChars ?? 12_000;
  const maxPages = opts.maxPages ?? 3;
  const maxRows = 40;
  const skipped: { page: number; reason: string }[] = [];
  const usable: (UnitPage & { table: boolean; rows: number })[] = [];

  for (const p of pages) {
    const content = p.lines.filter((l) => l.kind !== 'admin');
    const markup = renderMarkup(p);
    if (p.flags.scanned && p.source === 'text') {
      skipped.push({ page: p.n, reason: UNREADABLE_SCAN });
    } else if (p.flags.adminOnly) {
      skipped.push({ page: p.n, reason: content.length ? 'Contents or administrative page' : 'Blank page' });
    } else if (!markup.trim()) {
      skipped.push({ page: p.n, reason: 'Blank page' });
    } else if (content.every((l) => l.kind === 'aside') && content.some((l) => CAPTION.test(l.text))) {
      skipped.push({ page: p.n, reason: 'Figure or map page' });
    } else {
      const rows = content.filter((l) => l.kind === 'table' || l.kind === 'bullet' || l.kind === 'numbered').length;
      usable.push({ n: p.n, markup, source: p.source, table: p.flags.tableLike, rows });
    }
  }

  const groups: (typeof usable)[] = [];
  let current: typeof usable = [];
  let chars = 0;
  let rows = 0;
  for (const page of usable) {
    if (current.length && (current.length >= maxPages || chars + page.markup.length > maxChars || rows + page.rows > maxRows)) {
      groups.push(current);
      current = [];
      chars = 0;
      rows = 0;
    }
    current.push(page);
    chars += page.markup.length;
    rows += page.rows;
  }
  if (current.length) groups.push(current);

  const units = groups
    .map((g) => ({
      index: 0,
      pages: g.map(({ n, markup, source }) => ({ n, markup, source })),
      imagePages: g.filter((p) => p.table).map((p) => p.n),
      relevance: relevanceOf(g.map((p) => p.markup).join('\n')),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .map((u, index) => ({ ...u, index }));
  return { units, skipped };
}

/** Halves a unit that timed out or overflowed; null when it is already one page. */
export function splitUnit(u: Unit): [Unit, Unit] | null {
  if (u.pages.length < 2) return null;
  const mid = Math.ceil(u.pages.length / 2);
  const half = (pages: UnitPage[]): Unit => ({
    ...u,
    pages,
    imagePages: u.imagePages.filter((n) => pages.some((p) => p.n === n)),
  });
  return [half(u.pages.slice(0, mid)), half(u.pages.slice(mid))];
}

/** Places, sizes, codes and dates found by pattern, given to the model as a checklist. */
export function regexHints(text: string): string[] {
  const hints = new Set<string>();
  for (const m of text.matchAll(/\bHUCs?\s*(?:#|no\.?)?\s*(\d{8,12})\b/gi)) hints.add(`HUC ${m[1]}`);
  for (const m of text.matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s+(?:acres|ac)\b/gi)) hints.add(m[0]);
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:County|Co\.)/g)) hints.add(`${m[1]} County`);
  for (const m of text.matchAll(/\b((?:[A-Z][a-z]+,? )+)and ([A-Z][a-z]+) [Cc]ounties\b/g)) {
    for (const name of m[1].split(/,? /).filter(Boolean)) hints.add(`${name} County`);
    hints.add(`${m[2]} County`);
  }
  for (const m of text.matchAll(/\bMonths? ?\d{1,3}(?: ?- ?\d{1,3})?/g)) hints.add(m[0]);
  for (const m of text.matchAll(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)) hints.add(m[0]);
  return [...hints].slice(0, 120);
}
