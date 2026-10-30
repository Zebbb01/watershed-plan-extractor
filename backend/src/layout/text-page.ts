import type { Line, PageModel } from './page-model';

/*
 * A page model built from transcribed text (OCR of a scanned page). There are no positions,
 * so structure comes from how the transcript is written: "• " bullets ("○", "◦", "-", the
 * letter "o", diamonds and similar for sub-items), "1." items, "| a | b |" table rows, numbered or
 * capitalised short lines as headings. Line order stands in for height, so the first and
 * last lines of each page can be recognised as running headers and page numbers like on a
 * text page.
 */

const TOP_BULLET = /^[•●*]\s+/;
// A hollow-circle sub-bullet often comes back from the transcriber as the letter "o".
const SUB_BULLET = /^(?:[○◦▪■□‣⁃–-]|o(?=\s+[A-Z0-9]))\s+/;
// Diamonds, arrows and ticks: a sub-item under a bullet, or a list of their own when no bullet comes before.
const OTHER_BULLET = /^[♦◆◇❖►▸➢➤✓✔]\s*/;
const SECTION_TITLE = /^\d{1,2}(\.\d{1,2}){1,3}\.?\s+[A-Z][^.;:]{1,70}$/;

export function pageFromText(n: number, text: string): PageModel {
  const lines: Line[] = [];
  let otherLevel = 0; // level of the diamond list in progress, 0 when none
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    const base = { x: 0, y: lines.length, size: 11, bold: false, level: 0 };
    const other = OTHER_BULLET.test(t);
    if (!other) otherLevel = 0;
    if (TOP_BULLET.test(t)) lines.push({ ...base, text: t.replace(TOP_BULLET, ''), kind: 'bullet', level: 1 });
    else if (SUB_BULLET.test(t)) lines.push({ ...base, text: t.replace(SUB_BULLET, ''), kind: 'bullet', level: 2 });
    else if (other) {
      otherLevel ||= lines.at(-1)?.kind === 'bullet' ? 2 : 1;
      lines.push({ ...base, text: t.replace(OTHER_BULLET, ''), kind: 'bullet', level: otherLevel });
    }
    else if (/\|/.test(t) && t.split('|').filter((c) => c.trim()).length >= 2) {
      lines.push({ ...base, text: t.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/).join(' | '), kind: 'table' });
    } else if (SECTION_TITLE.test(t)) lines.push({ ...base, text: t, kind: 'heading' });
    else if (/^(\(?\d{1,2}[.)]|\(?[a-z][.)])\s+\S/i.test(t)) lines.push({ ...base, text: t, kind: 'numbered', level: 1 });
    else if (t.length <= 80 && /^[A-Z][A-Z0-9 &,/()'-]{3,}$/.test(t)) lines.push({ ...base, text: t, kind: 'heading' });
    else lines.push({ ...base, text: t, kind: 'para' });
  }
  const tableRows = lines.filter((l) => l.kind === 'table').length;
  return {
    n,
    source: 'ocr',
    lines,
    flags: { scanned: false, tableLike: tableRows >= 3, multiColumn: false, adminOnly: lines.length === 0 },
    charCount: lines.reduce((s, l) => s + l.text.length, 0),
    // One unit of height per line, so annotateDocument's top and bottom bands are the first and last lines.
    // A page of one or two lines has no header band: its only text is content.
    height: lines.length >= 3 ? lines.length - 1 : undefined,
  };
}
