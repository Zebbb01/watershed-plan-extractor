import type { Line, PageModel } from './page-model';

/*
 * A page model built from transcribed text (OCR of a scanned page). There are no positions,
 * so structure comes from how the transcript is written: "• " bullets, "1." items,
 * "| a | b |" table rows, and short capitalised lines as headings.
 */

export function pageFromText(n: number, text: string): PageModel {
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    const base = { x: 0, y: lines.length, size: 11, bold: false, level: 0 };
    if (/^[•●◦▪\-*]\s+/.test(t)) lines.push({ ...base, text: t.replace(/^[•●◦▪\-*]\s+/, ''), kind: 'bullet', level: 1 });
    else if (/\|/.test(t) && t.split('|').filter((c) => c.trim()).length >= 2) {
      lines.push({ ...base, text: t.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/).join(' | '), kind: 'table' });
    } else if (/^(\(?\d{1,2}[.)]|\(?[a-z][.)])\s+\S/i.test(t)) lines.push({ ...base, text: t, kind: 'numbered', level: 1 });
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
  };
}
