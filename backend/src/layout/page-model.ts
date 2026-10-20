import type { LineKind, RawPage, TextItemLite } from '../schema';

/*
 * Rebuilds the reading structure of one page from pdf.js text runs: lines, columns,
 * headings, bullets with indent levels, table rows and captions. The model then reads
 * "• [L2] Fencing" instead of a flat stream, which is how it tells a sub-bullet from a
 * main item and a table row from prose.
 */

export interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  kind: LineKind;
  /** 0 for prose; 1+ for list items, from the indent */
  level: number;
}

export interface PageModel {
  n: number;
  source: 'text' | 'ocr';
  lines: Line[];
  flags: { scanned: boolean; tableLike: boolean; multiColumn: boolean; adminOnly: boolean };
  charCount: number;
  /** page height in points; absent on pages built from OCR text */
  height?: number;
}

const SCANNED_MAX_CHARS = 30;
const BULLET_ONLY = /^[-•●◦▪■□◆◇►▸‣⁃∙·\-–*o]$/;
const BULLET_PREFIX = /^[-•●◦▪■□◆◇►▸‣⁃∙·]\s*/;
const NUMBERED = /^(\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|vi{0,3}|ix|x)[.)])\s+\S/i;
const LIST_MARKER = /^(\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|vi{0,3}|ix|x)[.)])$/i;
const CAPTION = /^(figure|fig\.|photo|map|image)\s*\d+[a-z]?\s*[.:-]/i;
const NINE_ELEMENT = /^(element|key element)\s+[a-i]\b/i;
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'at', 'by', 'with', 'from', '&']);

/** Median of values weighted by how many characters carry them. */
const weightedMedian = (pairs: [number, number][]) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [v, w] of [...pairs].sort((a, b) => a[0] - b[0])) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return 0;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface RowLine {
  items: TextItemLite[];
  y: number;
  x: number;
  width: number;
  size: number;
  text: string;
  cells: string[];
  aside: boolean;
}

/** Finds a clear vertical gutter and splits the page into a main column and a second one. */
function splitColumns(items: TextItemLite[], width: number): { groups: TextItemLite[][]; asideIndex: number | null } {
  if (items.length < 8) return { groups: [items], asideIndex: null };
  const bin = 2;
  const bins = new Array(Math.ceil(width / bin) + 1).fill(0);
  for (const it of items) {
    for (let b = Math.floor(it.x / bin); b <= Math.min(bins.length - 1, Math.floor((it.x + it.w) / bin)); b++) bins[b]++;
  }
  const tolerance = Math.max(1, Math.floor(items.length * 0.05));
  let best: { from: number; to: number } | null = null;
  let runStart = -1;
  const lo = Math.floor((width * 0.25) / bin);
  const hi = Math.ceil((width * 0.8) / bin);
  for (let b = lo; b <= hi + 1; b++) {
    const open = b <= hi && bins[b] <= tolerance;
    if (open && runStart < 0) runStart = b;
    if (!open && runStart >= 0) {
      if (!best || b - runStart > best.to - best.from) best = { from: runStart, to: b };
      runStart = -1;
    }
  }
  if (!best || (best.to - best.from) * bin < width * 0.03) return { groups: [items], asideIndex: null };
  const gutter = ((best.from + best.to) / 2) * bin;
  const left = items.filter((it) => it.x + it.w / 2 < gutter);
  const right = items.filter((it) => it.x + it.w / 2 >= gutter);
  const proseLike = left.filter((it) => it.w >= width * 0.25).length;
  if (left.length < 5 || right.length < 3 || proseLike < 3) return { groups: [items], asideIndex: null };
  const rightIsNarrow = Math.max(...right.map((it) => it.w)) < width * 0.3;
  return { groups: [left, right], asideIndex: rightIsNarrow ? 1 : null };
}

function groupLines(items: TextItemLite[], aside: boolean): RowLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const tol = Math.max(1.5, median(items.map((i) => i.h)) * 0.5);
  const rows: TextItemLite[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.y - row[0].y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    const cells: string[] = [];
    let cell = '';
    for (let i = 0; i < row.length; i++) {
      const it = row[i];
      const prev = row[i - 1];
      const gap = prev ? it.x - (prev.x + prev.w) : 0;
      const h = Math.max(it.h, prev?.h ?? 0);
      // The gap after a bullet or "1." marker is indentation, not a column boundary.
      const afterMarker = i === 1 && (BULLET_ONLY.test(row[0].str.trim()) || LIST_MARKER.test(row[0].str.trim()));
      if (prev && gap > h * 1.5 && !afterMarker) {
        cells.push(cell.trim());
        cell = '';
      }
      const needsSpace = prev && gap > h * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ');
      text += (needsSpace ? ' ' : '') + it.str;
      cell += (needsSpace && cell ? ' ' : '') + it.str;
    }
    cells.push(cell.trim());
    const last = row[row.length - 1];
    return {
      items: row,
      y: row[0].y,
      x: row[0].x,
      width: last.x + last.w - row[0].x,
      size: Math.max(...row.map((r) => r.h)),
      text: text.replace(/\s+/g, ' ').trim(),
      cells: cells.filter(Boolean),
      aside,
    };
  });
}

const isTitleish = (text: string) => {
  const words = text.replace(/^[\d.()a-z]+\s+/i, '').split(/\s+/).filter((w) => /[a-z]/i.test(w) && !SMALL_WORDS.has(w.toLowerCase()));
  if (!words.length) return false;
  return words.filter((w) => /^[A-Z]/.test(w.replace(/^[^A-Za-z]+/, ''))).length / words.length >= 0.6;
};

const numericShare = (cells: string[]) => {
  const tokens = cells.join(' ').split(/\s+/).filter(Boolean);
  return tokens.filter((t) => /^\$?[\d,.]+%?$/.test(t)).length / Math.max(1, tokens.length);
};

export function buildPageModel(page: RawPage): PageModel {
  const items = page.items.filter((i) => i.str.trim().length > 0);
  const charCount = items.reduce((s, i) => s + i.str.replace(/\s/g, '').length, 0);
  const flags = { scanned: false, tableLike: false, multiColumn: false, adminOnly: false };
  if (charCount < SCANNED_MAX_CHARS) {
    flags.scanned = page.hasImage;
    flags.adminOnly = !page.hasImage && charCount === 0;
  }

  const { groups, asideIndex } = splitColumns(items, page.width);
  flags.multiColumn = groups.length > 1;
  const rows = groups.flatMap((g, i) => groupLines(g, i === asideIndex));


  // A table is three numeric rows of three cells (cost tables) or five rows split by wide gaps
  // (milestone tables). On such a page every multi-cell row is read as a table row.
  const multiCell = rows.filter((r) => !r.aside && r.cells.length >= 2);
  const numericRows = multiCell.filter((r) => r.cells.length >= 3 && numericShare(r.cells) >= 0.3);
  flags.tableLike = numericRows.length >= 3 || multiCell.length >= 5;
  const tableSet = new Set(flags.tableLike ? multiCell : []);

  // Body size and left margin come from prose rows only: a table set in smaller type must not
  // make every prose line look like a heading.
  const prose = rows.filter((r) => !r.aside && !tableSet.has(r) && r.text.length > 40);
  const bodySize = weightedMedian(prose.map((r) => [r.size, r.text.length])) || median(rows.map((r) => r.size));
  const margin = median(prose.map((r) => Math.round(r.x))) || Math.min(...rows.map((r) => r.x));

  // Length of the run of same-size lines each row sits in: a paragraph in larger type is not a heading.
  const runOf = new Map<RowLine, number>();
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && Math.abs(rows[j].size - rows[i].size) < 0.5 && rows[j].aside === rows[i].aside) j++;
    for (let k = i; k < j; k++) runOf.set(rows[k], j - i);
    i = j;
  }

  const lines: Line[] = rows.map((r) => {
    const base = { x: r.x, y: r.y, size: r.size, bold: false };
    if (r.aside) return { ...base, text: r.text, kind: 'aside', level: 0 };
    if (tableSet.has(r)) return { ...base, text: r.cells.join(' | '), kind: 'table', level: 0 };

    const first = r.items[0].str.trim();
    let text = r.text;
    let listItem: 'bullet' | 'numbered' | null = null;
    if (BULLET_ONLY.test(first) && r.items.length > 1) {
      listItem = 'bullet';
      text = r.items.slice(1).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    } else if (BULLET_PREFIX.test(text)) {
      listItem = 'bullet';
      text = text.replace(BULLET_PREFIX, '');
    } else if (NUMBERED.test(text)) {
      listItem = 'numbered';
    }

    const short = text.length <= 90 && !/[.;,]$/.test(text);
    const heading =
      (r.size >= bodySize * 1.15 && short && (runOf.get(r) ?? 1) <= 2) ||
      NINE_ELEMENT.test(text) ||
      (short && /^[A-Z][A-Z0-9 &,/()'-]{4,}$/.test(text)) ||
      (short && listItem === 'numbered' && text.length <= 60 && isTitleish(text));
    if (heading) return { ...base, text, kind: 'heading', level: 0 };
    if (CAPTION.test(text)) return { ...base, text, kind: 'aside', level: 0 };
    if (listItem) return { ...base, text, kind: listItem, level: Math.max(1, Math.round((r.x - margin) / 18)) };
    return { ...base, text, kind: 'para', level: 0 };
  });

  return { n: page.n, source: 'text', lines, flags, charCount, height: page.height };
}
