import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractionResult } from '../src/schema';
import { DOCS, EVAL_DIR, pdfPath } from './doc-set';
import { pageTexts } from './page-text';
import { readPdfNode } from './read-pdf';
import { findVerbatimViolations, score, type GroundTruth } from './score';

/*
 * npm run eval:rescore -w backend -- <model> [runs folder]
 * Scores the saved outputs of a model again with the current scorer and ground truth, without
 * calling the model, so a scorer or ground-truth fix costs nothing to re-check. A plan without an
 * answer key gets the verbatim check only. The folder defaults to results/runs;
 * results/baseline-2026-10-29 holds the held-out plans' outputs from before the generalisation changes.
 */

const [model, runsDir = join(EVAL_DIR, 'results', 'runs')] = process.argv.slice(2);
if (!model) {
  console.error('Usage: tsx eval/rescore.ts <model id> [runs folder]');
  process.exit(1);
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const doc of DOCS) {
  const run = join(runsDir, `${doc.id}.${model}.json`);
  const gtFile = join(EVAL_DIR, 'ground-truth', `${doc.id}.json`);
  if (!existsSync(run)) continue;
  const result: ExtractionResult = JSON.parse(readFileSync(run, 'utf8'));
  if (!existsSync(gtFile)) {
    // no answer key: only the verbatim check, which needs none
    const v = findVerbatimViolations(result, pageTexts((await readPdfNode(pdfPath(doc.id))).pages));
    console.log(`${doc.id}: no answer key, names not in the PDF ${v.length}${v.length ? ` ${JSON.stringify(v)}` : ''}`);
    continue;
  }
  const gt: GroundTruth = JSON.parse(readFileSync(gtFile, 'utf8'));
  const { pages } = await readPdfNode(pdfPath(doc.id));
  const s = score(result, gt, pageTexts(pages));
  const cats = Object.entries(s.categories).map(([k, v]) => `${k} ${v.matched}/${v.gt} (${v.predicted})`).join(', ');
  console.log(
    `${doc.id}: core F1 ${pct(s.core.f1)} (P ${pct(s.core.precision)}, R ${pct(s.core.recall)}), numbers ${pct(s.numeric.accuracy)} ` +
      `(precision ${pct(s.numeric.precision)}), violations ${s.verbatimViolations.length}${s.verbatimViolations.length ? ` ${JSON.stringify(s.verbatimViolations)}` : ''}\n  ${cats}`,
  );
}
