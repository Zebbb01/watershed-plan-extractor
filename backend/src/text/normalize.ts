/*
 * Text matching for verification. PDF text layers differ from what a model copies in small,
 * predictable ways: bullet glyphs from symbol fonts, curly quotes, en dashes, words split
 * across lines, ligatures. Normalising both sides removes those differences and nothing else,
 * so a quote that matches really is on the page.
 */

const PRIVATE_USE = /[-]/g; // Wingdings and Symbol bullets land here
const BULLET_GLYPHS = /[•●◦▪■□◆◇►▸‣⁃∙·]/g;
const DASHES = /[‐-―−]/g;
const DOUBLE_QUOTES = /[“-‟″]/g;
const SINGLE_QUOTES = /[‘-‛′]/g;

export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(PRIVATE_USE, ' ')
    .replace(BULLET_GLYPHS, ' ')
    .replace(/�/g, ' ')
    .replace(DASHES, '-')
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(/(\w)-[ \t]*\r?\n\s*(\w)/g, '$1$2') // "stream-\nbank" -> "streambank"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// A decimal point is kept (as "d") so that "2.5 miles" never matches "25 miles".
const keepDecimals = (s: string) => s.replace(/(\d)\.(?=\d)/g, '$1d');

/** Letters and digits only: immune to spacing, punctuation and line-end hyphenation. */
const skeleton = (s: string) => keepDecimals(normalizeForMatch(s)).replace(/[^\p{L}\p{N}]+/gu, '');

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * Is `name` written on the page as whole words? Spacing, punctuation and line-end hyphenation
 * may differ, and a plural ending ("Rain Gardens" for "Rain Garden") still counts, but a name
 * inside other words ("terrain gardens") does not.
 */
export function findName(haystack: string, name: string): boolean {
  const target = skeleton(name);
  if (!target) return false;
  const text = keepDecimals(normalizeForMatch(haystack));
  let sk = '';
  const pos: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (isWordChar(text[i])) {
      sk += text[i];
      pos.push(i);
    }
  }
  for (let at = sk.indexOf(target); at !== -1; at = sk.indexOf(target, at + 1)) {
    const start = pos[at];
    let end = pos[at + target.length - 1] + 1;
    if (isWordChar(text[start - 1])) continue;
    if (text.startsWith('es', end) && !isWordChar(text[end + 2])) end += 2;
    else if (text[end] === 's' && !isWordChar(text[end + 1])) end += 1;
    if (!isWordChar(text[end])) return true;
  }
  return false;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

const ANCHOR = 8;
const FUZZY_MIN = 0.92;

/**
 * Is `quote` on the page? Exact on the skeleton first; with `fuzzy` (OCR pages), the best
 * window of the same length anchored on an exact 8-character run must reach 0.92 similarity.
 */
export function findQuote(haystack: string, quote: string, opts: { fuzzy?: boolean } = {}): { found: boolean; score: number } {
  const h = skeleton(haystack);
  const q = skeleton(quote);
  if (q.length === 0) return { found: false, score: 0 };
  if (h.includes(q)) return { found: true, score: 1 };
  if (!opts.fuzzy || q.length < ANCHOR * 2) return { found: false, score: 0 };

  const starts = new Set<number>();
  for (const offset of [0, q.length >> 2, q.length >> 1, (3 * q.length) >> 2, q.length - ANCHOR]) {
    const anchor = q.slice(offset, offset + ANCHOR);
    for (let at = h.indexOf(anchor); at !== -1 && starts.size < 60; at = h.indexOf(anchor, at + 1)) {
      starts.add(at - offset);
    }
  }
  let best = 0;
  for (const s of starts) {
    for (let jitter = -3; jitter <= 3; jitter++) {
      const from = Math.max(0, s + jitter);
      best = Math.max(best, similarity(h.slice(from, from + q.length), q));
    }
  }
  return { found: best >= FUZZY_MIN, score: best };
}

const tokens = (s: string) => normalizeForMatch(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * For table pages, where a cell's text is interleaved with its neighbours' cells: every word
 * of the quote, in order, within a short window. Used only where a page image shows the table.
 */
export function findQuoteInOrder(haystack: string, quote: string): boolean {
  const h = tokens(haystack);
  const q = tokens(quote);
  if (q.length < 3) return false;
  const maxSpan = Math.max(3 * q.length, q.length + 12);
  for (let start = h.indexOf(q[0]); start !== -1; start = h.indexOf(q[0], start + 1)) {
    let at = start;
    let k = 1;
    while (k < q.length && at - start < maxSpan) {
      at++;
      if (at >= h.length) break;
      if (h[at] === q[k]) k++;
    }
    if (k === q.length && at - start < maxSpan) return true;
  }
  return false;
}

const SUFFIXES = ['ations', 'ation', 'tions', 'tion', 'ings', 'ing', 'ies', 'es', 'ed', 's', 'e'];

/** A light English stemmer: enough to match "Fencing" with "Fence" and "reduction" with "reduce". */
export function stem(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length) + (suffix === 'ies' ? 'y' : '');
      break;
    }
  }
  return w.endsWith('e') && w.length > 4 ? w.slice(0, -1) : w;
}

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Every number written in `s`, thousands separators removed. */
export function numbersIn(s: string): number[] {
  return [...s.normalize('NFKC').matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, '')));
}
