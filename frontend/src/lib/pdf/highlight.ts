import { normalizeForMatch } from '@app/backend';

export interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// When the page splits a long quote differently (columns, a figure in between), its first and
// last words still anchor it: this many characters at each end.
const ANCHOR = 30;

/**
 * The text runs of a page that hold the quotes. The page's runs are joined in order into one
 * text, each quote is found in it, and exactly the runs inside that stretch are marked: the
 * lines a quote wraps over, one long line holding it, or the cells of its table row. A phrase
 * the quote shares with other lines (the plan's name in a running header) is not marked.
 */
export function pickHighlightRuns<T extends Run>(runs: T[], quotes: string[]): T[] {
  let text = '';
  const spans = runs.map((r) => {
    const t = normalizeForMatch(r.str);
    if (!t) return null;
    if (text) text += ' ';
    const start = text.length;
    text += t;
    return { start, end: text.length };
  });

  const marked = new Set<number>();
  for (const quote of quotes) {
    const q = normalizeForMatch(quote);
    if (q.length < 4) continue;
    let from = text.indexOf(q);
    let to = from + q.length;
    if (from < 0 && q.length > 2 * ANCHOR) {
      const head = text.indexOf(q.slice(0, ANCHOR));
      const tail = head < 0 ? -1 : text.indexOf(q.slice(-ANCHOR), head);
      if (tail >= 0 && tail + ANCHOR - head <= q.length * 1.5) {
        from = head;
        to = tail + ANCHOR;
      }
    }
    if (from < 0) continue;
    spans.forEach((s, i) => {
      if (s && s.start < to && s.end > from) marked.add(i);
    });
  }
  return runs.filter((_, i) => marked.has(i));
}
