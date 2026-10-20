import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findQuote } from '../src/text/normalize';
import { EVAL_DIR, pdfPath } from './doc-set';
import { pageTexts } from './page-text';
import { readPdfNode } from './read-pdf';
import type { GroundTruth } from './score';

// Ground truth must itself be grounded: every quote on its page, every name in the PDF.
// Scanned documents (no text layer) are skipped and say so.

let problems = 0;
const dir = join(EVAL_DIR, 'ground-truth');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const gt: GroundTruth = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const path = pdfPath(gt.doc);
  if (!existsSync(path)) {
    console.log(`${gt.doc}: PDF missing, skipped`);
    continue;
  }
  const texts = pageTexts((await readPdfNode(path)).pages);
  const all = [...texts.values()].join('\n');
  if (!all.trim()) {
    console.log(`${gt.doc}: no text layer (scanned), ${gt.items.length} items checked by eye only`);
    continue;
  }
  let bad = 0;
  for (const item of gt.items) {
    const onPage = findQuote(texts.get(item.page) ?? '', item.quote).found;
    if (!onPage) {
      const elsewhere = [...texts].find(([, t]) => findQuote(t, item.quote).found)?.[0];
      console.log(`  ${gt.doc} ${item.category} "${item.name}": quote ${elsewhere ? `is on page ${elsewhere}, not ${item.page}` : 'not found'}`);
      bad++;
    }
    const labelOnly = item.category === 'goals' || item.category === 'implementation';
    if (!labelOnly && !findQuote(all, item.name).found && !(item.aliases ?? []).some((a) => findQuote(all, a).found)) {
      console.log(`  ${gt.doc} ${item.category} "${item.name}": name not in the PDF`);
      bad++;
    }
  }
  console.log(`${gt.doc}: ${gt.items.length} items, ${bad} problems`);
  problems += bad;
}
process.exitCode = problems ? 1 : 0;
