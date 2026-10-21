import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractionResult } from '../src/schema';
import { DOCS, EVAL_DIR, pdfPath } from './doc-set';
import { pageTexts } from './page-text';
import { readPdfNode } from './read-pdf';
import { score, type GroundTruth } from './score';

/*
 * npm run eval:rescore -w backend -- <model>
 * Scores the saved outputs of a model again with the current scorer and ground truth, without
 * calling the model, so a scorer or ground-truth fix costs nothing to re-check.
 */

const model = process.argv[2];
if (!model) {
  console.error('Usage: tsx eval/rescore.ts <model id>');
  process.exit(1);
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const doc of DOCS) {
  const run = join(EVAL_DIR, 'results', 'runs', `${doc.id}.${model}.json`);
  const gtFile = join(EVAL_DIR, 'ground-truth', `${doc.id}.json`);
  if (!existsSync(run) || !existsSync(gtFile)) continue;
  const result: ExtractionResult = JSON.parse(readFileSync(run, 'utf8'));
  const gt: GroundTruth = JSON.parse(readFileSync(gtFile, 'utf8'));
  const { pages } = await readPdfNode(pdfPath(doc.id));
  const s = score(result, gt, pageTexts(pages));
  const cats = Object.entries(s.categories).map(([k, v]) => `${k} ${v.matched}/${v.gt} (${v.predicted})`).join(', ');
  console.log(
    `${doc.id}: core F1 ${pct(s.core.f1)} (P ${pct(s.core.precision)}, R ${pct(s.core.recall)}), numbers ${pct(s.numeric.accuracy)} ` +
      `(precision ${pct(s.numeric.precision)}), violations ${s.verbatimViolations.length}${s.verbatimViolations.length ? ` ${JSON.stringify(s.verbatimViolations)}` : ''}\n  ${cats}`,
  );
}
