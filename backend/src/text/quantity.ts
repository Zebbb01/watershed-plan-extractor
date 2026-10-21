import type { Comparator, Quantity } from '../schema';

/*
 * The model copies an amount's words ("no fewer than 1,000 informational fact sheets");
 * this file turns those words into numbers. Keeping the arithmetic in code means a number
 * on screen is always one that is written in the document.
 */

const NUM = String.raw`\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$?\d+(?:\.\d+)?`;
const RANGE = new RegExp(String.raw`(${NUM})\s*(%|°\s?[FC])?\s*(?:-|to|through|thru)\s*(${NUM})`, 'i');
const FIRST_NUMBER = new RegExp(NUM);

const AT_MOST = /\b(not to exceed|not exceeding|no more than|not more than|less than|up to|at most|a maximum of|maximum of|below|under)\b/i;
const AT_LEAST = /\b(no fewer than|no less than|not less than|at least|a minimum of|minimum of|or more|more than|greater than|over|exceeds?)\b/i;
const ABOUT = /\b(approximately|approx\.?|about|around|roughly|nearly|almost|an estimated)\b/i;

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

const RESTATED = new RegExp(String.raw`\b(?:${Object.keys(WORD_NUMBERS).join('|')})\s*\((\d[\d,]*(?:\.\d+)?)\)`, 'i');

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(ac|acre|acres)$/i, 'ac'],
  [/^(ft|feet|foot|linear feet|lf|lin ft)$/i, 'ft'],
  [/^(mi|mile|miles)$/i, 'mi'],
  [/^(cu ?yd|cubic yards?|cy)$/i, 'cu yd'],
  [/^(ea|each)$/i, 'ea'],
  [/^(lbs?|pounds?)$/i, 'lb'],
  [/^(tons?)$/i, 'ton'],
  [/^(gal|gallons?)$/i, 'gal'],
  [/^(sq ?ft|square feet)$/i, 'sq ft'],
  [/^mg\/l$/i, 'mg/L'],
  [/^ntu$/i, 'NTU'],
];
const STOP_WORDS = new Set(['of', 'to', 'in', 'for', 'per', 'that', 'which', 'with', 'at', 'on', 'from', 'by', 'and', 'or', 'will', 'are', 'is', 'be']);

const toNumber = (s: string) => Number(s.replace(/[$,]/g, ''));

function normalizeUnit(phrase: string): string {
  const p = phrase.trim();
  for (const [re, unit] of UNIT_ALIASES) if (re.test(p)) return unit;
  return p;
}

/** Up to three words after the number, stopping at punctuation or a function word. */
function unitAfter(rest: string): string | null {
  const s = rest.replace(/^[\s)\]]+/, '');
  const degrees = /^°\s?([FC])/.exec(s);
  if (degrees) return `°${degrees[1]}`;
  if (s.startsWith('%')) return '%';
  const twoWord = /^(cu\s+yd|sq\s+ft|linear\s+feet|lin\s+ft|cubic\s+yards?|square\s+feet)\b/i.exec(s);
  if (twoWord) return normalizeUnit(twoWord[1].replace(/\s+/g, ' '));
  const words: string[] = [];
  for (const w of s.split(/\s+/)) {
    const word = w.replace(/[,;:.()]+$/, '');
    if (!word || !/^[\p{L}][\p{L}\p{N}/\-]*$/u.test(word) || STOP_WORDS.has(word.toLowerCase())) break;
    words.push(word);
    if (words.length === 3 || /[,;:.()]$/.test(w)) break;
  }
  return words.length ? normalizeUnit(words.join(' ')) : null;
}

export function parseQuantity(raw: string, scope: string | null = null): Quantity {
  const text = raw.normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ');
  const base = { raw, scope };

  const range = RANGE.exec(text);
  if (range) {
    const value = toNumber(range[1]);
    const valueMax = toNumber(range[3]);
    const after = text.slice(range.index + range[0].length);
    const unit = range[1].startsWith('$') ? 'USD' : range[2] ? normalizeUnit(range[2].replace(/\s/g, '')) : unitAfter(after);
    return { ...base, value, valueMax, unit, comparator: 'range' };
  }

  let value: number | null = null;
  let after = '';
  let dollars = false;
  // "two (2) demonstration farms": digits in brackets win only when they restate a number word;
  // otherwise the first number does ("12 structures (410)" carries a practice code, not an amount).
  const restated = RESTATED.exec(text);
  const first = restated ?? FIRST_NUMBER.exec(text);
  if (first) {
    value = toNumber(first[1] ?? first[0]);
    dollars = first[0].startsWith('$');
    after = text.slice(first.index + first[0].length);
  } else {
    const word = new RegExp(String.raw`\b(${Object.keys(WORD_NUMBERS).join('|')})\b`, 'i').exec(text);
    if (word) {
      value = WORD_NUMBERS[word[1].toLowerCase()];
      after = text.slice(word.index + word[0].length);
    }
  }
  if (value === null) return { ...base, value: null, valueMax: null, unit: null, comparator: null };

  const comparator: Comparator = AT_MOST.test(text) ? '<=' : AT_LEAST.test(text) ? '>=' : ABOUT.test(text) ? '~' : '=';
  const unit = dollars ? 'USD' : unitAfter(after);
  return { ...base, value, valueMax: null, unit, comparator };
}

/** "(Months 1-36)" -> months 1..36; "2011 to September 2014" -> years 2011..2014. */
export function parseTimeframe(s: string): { start: number | null; end: number | null; timeUnit: 'month' | 'year' | null } {
  const text = s.replace(/[‐-―]/g, '-');
  const monthRange = /\bmonths?\s*(\d{1,3})\s*(?:-|to|through)\s*(\d{1,3})\b/i.exec(text);
  if (monthRange) return { start: Number(monthRange[1]), end: Number(monthRange[2]), timeUnit: 'month' };
  const month = /\bmonths?\s*(\d{1,3})\b/i.exec(text);
  if (month) return { start: Number(month[1]), end: Number(month[1]), timeUnit: 'month' };
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (years.length) return { start: Math.min(...years), end: Math.max(...years), timeUnit: 'year' };
  const bare = /^\(?\s*(\d{1,3})\s*-\s*(\d{1,3})\s*\)?$/.exec(text.trim());
  if (bare) return { start: Number(bare[1]), end: Number(bare[2]), timeUnit: 'month' };
  return { start: null, end: null, timeUnit: null };
}
