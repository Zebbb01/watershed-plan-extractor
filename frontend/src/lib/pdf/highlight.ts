import { normalizeForMatch } from '@app/backend';

export interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Box = Omit<Run, 'str'>;

// When the page splits a long quote differently (columns, a figure in between), its first and
// last words still anchor it: this many characters at each end.
const ANCHOR = 30;

// Words read off a scanned image have misread letters; a stretch this close to the quote
// (edits per character of the quote) still counts as the quote.
const MAX_EDITS = 0.2;

/**
 * The text runs of a page that hold the quotes. The page's runs are joined in order into one
 * text, each quote is found in it, and exactly the runs inside that stretch are marked: the
 * lines a quote wraps over, one long line holding it, or the cells of its table row. A phrase
 * the quote shares with other lines (the plan's name in a running header) is not marked.
 * With `fuzzy`, for words read off a scanned page, the closest stretch is taken when no
 * stretch matches exactly.
 */
export function pickHighlightRuns<T extends Run>(runs: T[], quotes: string[], { fuzzy = false } = {}): T[] {
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
    const found = findExact(text, q) ?? (fuzzy ? findClosest(text, q) : null);
    if (!found) {
      for (const i of findRowWords(runs, q, fuzzy ? ROW_COVER : 1)) marked.add(i);
      continue;
    }
    const [from, to] = found;
    spans.forEach((s, i) => {
      if (s && s.start < to && s.end > from) marked.add(i);
    });
  }
  return runs.filter((_, i) => marked.has(i));
}

// Share of a quote's words that must sit together, read row by row, to mark them on a scanned
// page (misread words); a text layer needs them all.
const ROW_COVER = 0.8;
const wordsOf = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * A table row is often not one stretch in reading order: Tesseract may read a table column by
 * column, and a cell that wraps puts its second line after the rest of the row ("Fix failing
 * onsite $3,300 72 systems $237,600 wastewater systems"). Here the words are read row by row,
 * top to bottom and left to right, and the shortest stretch holding `cover` of the quote's
 * words gives the runs to mark: only those of its words that are in the quote.
 */
function findRowWords(runs: Run[], q: string, cover: number): number[] {
  const want = new Map<string, number>();
  for (const w of wordsOf(q)) want.set(w, (want.get(w) ?? 0) + 1);
  const total = [...want.values()].reduce((a, b) => a + b, 0);
  if (total < 3) return [];

  // Rows: runs whose vertical middles lie within half a height of the row's first run.
  const order = runs.map((r, i) => ({ r, i, mid: r.y + r.h / 2 })).sort((a, b) => a.mid - b.mid);
  const rows: (typeof order)[] = [];
  for (const o of order) {
    const row = rows.at(-1);
    if (row && Math.abs(o.mid - row[0].mid) < Math.max(o.r.h, row[0].r.h) / 2) row.push(o);
    else rows.push([o]);
  }
  const tokens = rows.flatMap((row) => row.sort((a, b) => a.r.x - b.r.x)).flatMap((o) => wordsOf(normalizeForMatch(o.r.str)).map((w) => ({ w, i: o.i })));

  // The stretch that holds the most of the quote's words, the shorter one on a tie.
  let best = { hits: 0, from: 0, to: -1 };
  const limit = Math.ceil(total * 1.5) + 2;
  for (let from = 0; from < tokens.length; from++) {
    if (!want.has(tokens[from].w)) continue;
    const seen = new Map<string, number>();
    let hits = 0;
    for (let to = from; to < tokens.length && to - from < limit; to++) {
      const w = tokens[to].w;
      const n = seen.get(w) ?? 0;
      if (n < (want.get(w) ?? 0)) hits++;
      seen.set(w, n + 1);
      if (hits > best.hits || (hits === best.hits && to - from < best.to - best.from)) best = { hits, from, to };
    }
  }
  if (best.hits < total * cover) return [];
  return [...new Set(tokens.slice(best.from, best.to + 1).filter((t) => want.has(t.w)).map((t) => t.i))];
}

function findExact(text: string, q: string): [number, number] | null {
  const at = text.indexOf(q);
  if (at >= 0) return [at, at + q.length];
  if (q.length <= 2 * ANCHOR) return null;
  const head = text.indexOf(q.slice(0, ANCHOR));
  const tail = head < 0 ? -1 : text.indexOf(q.slice(-ANCHOR), head);
  return tail >= 0 && tail + ANCHOR - head <= q.length * 1.5 ? [head, tail + ANCHOR] : null;
}

/**
 * The stretch of text with the fewest edits from the quote (Sellers' algorithm: edit distance
 * where the match may start and end anywhere in the text), if few enough to be the quote.
 */
function findClosest(text: string, q: string): [number, number] | null {
  const m = q.length;
  let prev = Int32Array.from({ length: m + 1 }, (_, i) => i);
  let cur = new Int32Array(m + 1);
  // Where in the text the match ending here begins.
  let prevFrom = new Int32Array(m + 1);
  let curFrom = new Int32Array(m + 1);
  let best = { edits: Infinity, from: 0, to: 0 };
  for (let j = 1; j <= text.length; j++) {
    cur[0] = 0;
    curFrom[0] = j;
    for (let i = 1; i <= m; i++) {
      const swap = prev[i - 1] + (q[i - 1] === text[j - 1] ? 0 : 1);
      const extra = prev[i] + 1; // a character of the text that is not in the quote
      const missing = cur[i - 1] + 1; // a character of the quote that is not in the text
      if (swap <= extra && swap <= missing) {
        cur[i] = swap;
        curFrom[i] = prevFrom[i - 1];
      } else if (extra <= missing) {
        cur[i] = extra;
        curFrom[i] = prevFrom[i];
      } else {
        cur[i] = missing;
        curFrom[i] = curFrom[i - 1];
      }
    }
    if (cur[m] < best.edits) best = { edits: cur[m], from: curFrom[m], to: j };
    [prev, cur] = [cur, prev];
    [prevFrom, curFrom] = [curFrom, prevFrom];
  }
  return best.edits <= Math.max(2, m * MAX_EDITS) ? [best.from, best.to] : null;
}

/** Marked words in reading order as one box per line, so a marked line reads as one stroke. */
export function joinLines(words: Box[]): Box[] {
  const lines: Box[] = [];
  for (const w of words) {
    const last = lines.at(-1);
    const sameLine = last && w.x >= last.x && Math.abs(w.y + w.h / 2 - (last.y + last.h / 2)) < Math.max(w.h, last.h) / 2;
    if (!last || !sameLine) {
      lines.push({ x: w.x, y: w.y, w: w.w, h: w.h });
      continue;
    }
    const right = Math.max(last.x + last.w, w.x + w.w);
    const bottom = Math.max(last.y + last.h, w.y + w.h);
    last.y = Math.min(last.y, w.y);
    last.w = right - last.x;
    last.h = bottom - last.y;
  }
  return lines;
}
