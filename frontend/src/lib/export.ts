import { categoryByKey, type AnyItem, type CategoryKey, type ExtractionResult } from '@app/backend';

/*
 * Exports. JSON is the whole result with ChowaCo's ExtractedReport first; CSV is one category
 * with columns that trace every row back to its page. Cells are made safe for spreadsheets:
 * a value starting with = + - @ tab or CR would otherwise run as a formula.
 */

export function safeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(category: CategoryKey, items: AnyItem[]): string {
  const cols = categoryByKey(category).csv;
  const rows = [cols.map((c) => safeCell(c.label)).join(',')];
  for (const item of items) rows.push(cols.map((c) => safeCell(c.get(item))).join(','));
  return rows.join('\r\n') + '\r\n';
}

/** The full result for download; the page-structure dump is left out (it is for the Quality tab). */
export function toJson(result: ExtractionResult): string {
  // JSON.stringify leaves out undefined fields.
  const quality = { ...result.quality, structure: undefined };
  return JSON.stringify({ report: result.report, document: result.document, quality }, null, 2);
}

export function download(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const fileStem = (r: ExtractionResult) =>
  (r.document.title ?? r.document.fileName.replace(/\.pdf$/i, '')).replace(/[^\w-]+/g, '_').slice(0, 60);
