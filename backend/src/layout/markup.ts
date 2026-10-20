import type { PageModel } from './page-model';

/*
 * The text the model reads for a page. Structure travels as light tags:
 *   ## heading      • [L2] bullet      [L1] 1. numbered      [ASIDE] caption or sidebar
 *   [TABLE — see image] followed by "| cell | cell |" rows
 * Administrative lines (running heads, page numbers, acknowledgements) are left out, so the
 * model cannot quote them. stripMarkup() removes the tags again for quote verification.
 */

export const TABLE_MARK = '[TABLE — see image]';

export function renderMarkup(page: PageModel): string {
  const out: string[] = [];
  let inTable = false;
  for (const l of page.lines) {
    if (l.kind === 'admin') continue;
    if (l.kind === 'table') {
      if (!inTable) out.push(TABLE_MARK);
      inTable = true;
      out.push(`| ${l.text} |`);
      continue;
    }
    inTable = false;
    if (l.kind === 'heading') out.push(`## ${l.text}`);
    else if (l.kind === 'bullet') out.push(`• [L${l.level}] ${l.text}`);
    else if (l.kind === 'numbered') out.push(`[L${l.level}] ${l.text}`);
    else if (l.kind === 'aside') out.push(`[ASIDE] ${l.text}`);
    else out.push(l.text);
  }
  return out.join('\n');
}

export function stripMarkup(markup: string): string {
  return markup
    .split('\n')
    .filter((l) => l.trim() !== TABLE_MARK)
    .map((l) =>
      l
        .replace(/^## /, '')
        .replace(/^• \[L\d+\] /, '')
        .replace(/^\[L\d+\] /, '')
        .replace(/^\[(ASIDE|ADMIN)\] /, '')
        .replace(/^\| | \|$/g, '')
        .replace(/ \| /g, ' '),
    )
    .join('\n');
}
