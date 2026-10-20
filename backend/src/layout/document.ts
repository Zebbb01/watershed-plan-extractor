import type { PageModel } from './page-model';

/*
 * Document-level clean-up that one page cannot do alone: running headers and footers,
 * page numbers, tables of contents, and sections such as acknowledgements or references
 * whose names, titles and numbers must never be read as plan content.
 */

const ADMIN_SECTION = /^(acknowledge?ments?|references|literature cited|bibliography|works cited|table of contents|contents|list of (figures|tables|maps)|abbreviations|acronyms|glossary|distribution list|signature page)\b/i;
const PAGE_NUMBER = /^(page\s+)?([0-9]{1,4}|[ivxlc]{1,7})(\s+of\s+\d+)?$/i;
const TOC_LINE = /(\.{4,}|\s{3,}|…+)\s*\d{1,4}\s*$/;

// A header read as a table row on some pages ("Plan | FY19") is the same header as plain text on others.
const repeatKey = (text: string) => text.toLowerCase().replace(/\|/g, ' ').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const inBand = (y: number, height: number | undefined) => height !== undefined && (y < height * 0.12 || y > height * 0.88);

export function annotateDocument(pages: PageModel[]): PageModel[] {
  // Lines in the top or bottom band that repeat on at least half the pages are running heads.
  const counts = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.lines) if (inBand(l.y, p.height)) seen.add(repeatKey(l.text));
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const minRepeats = Math.max(2, Math.ceil(pages.length / 2));
  const running = new Set([...counts].filter(([k, n]) => n >= minRepeats && k !== '#').map(([k]) => k));

  let inAdminSection = false;
  return pages.map((p) => {
    const lines = p.lines.map((l) => ({ ...l }));
    for (const l of lines) {
      if (inBand(l.y, p.height) && (running.has(repeatKey(l.text)) || PAGE_NUMBER.test(l.text.trim()))) {
        l.kind = 'admin';
        continue;
      }
      if (l.kind === 'heading') inAdminSection = ADMIN_SECTION.test(l.text.trim());
      if (inAdminSection) l.kind = 'admin';
    }
    const content = lines.filter((l) => l.kind !== 'admin');
    const tocLines = content.filter((l) => TOC_LINE.test(l.text)).length;
    // A contents page: dot leaders, a "Contents" title, or a side column of bare page numbers.
    const asides = content.filter((l) => l.kind === 'aside');
    const numberColumn = asides.length >= 5 && asides.filter((l) => PAGE_NUMBER.test(l.text.trim())).length / asides.length >= 0.6;
    const isToc =
      (content.length > 0 && tocLines / content.length >= 0.4) ||
      lines.some((l) => /^(table of )?contents( \(continued\))?$/i.test(l.text.trim())) ||
      numberColumn;
    if (isToc) for (const l of lines) l.kind = 'admin';
    const adminOnly = p.flags.adminOnly || isToc || (lines.length > 0 && lines.every((l) => l.kind === 'admin'));
    return { ...p, lines, flags: { ...p.flags, adminOnly } };
  });
}

/** Headings with their page numbers, for the model's sense of where a unit sits. */
export function outline(pages: PageModel[], maxChars = 4_000): string {
  const out: string[] = [];
  let size = 0;
  for (const p of pages) {
    for (const l of p.lines) {
      if (l.kind !== 'heading') continue;
      const entry = `p${p.n} ${l.text}`;
      if (size + entry.length + 1 > maxChars) return out.join('\n');
      out.push(entry);
      size += entry.length + 1;
    }
  }
  return out.join('\n');
}
