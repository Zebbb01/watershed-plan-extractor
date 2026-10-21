import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '../src/llm/client';
import { CATEGORY_KEYS, type ExtractionResult } from '../src/schema';
import { docById, EVAL_DIR, pdfPath } from './doc-set';
import { loadEnv } from './env';
import { runDoc } from './run-doc';

/*
 * Builds the site's one-click samples: runs the pipeline on a few plans (or reuses a saved eval
 * run with --from-runs), writes frontend/public/samples/<id>.json, copies PDFs small enough to
 * the site (scripts/package-submission.mjs leaves the large ones out of the zip), and writes
 * the sample list the home page imports.
 *   npm run samples -w backend -- [--from-runs] [--model id]
 */

const { values: args } = parseArgs({ options: { 'from-runs': { type: 'boolean', default: false }, model: { type: 'string' } } });
const SAMPLES = ['broken-pumpkin-2019', 'bell-creek-2012', 'fuller-creek-2022', 'buttahatchee-2004'];
const FORMAT: Record<string, string> = { 'nine-element': '9-element plan', narrative: 'Narrative plan', scanned: 'Scanned plan', 'action-plan': 'Action plan' };

const frontend = join(EVAL_DIR, '..', '..', 'frontend');
const out = join(frontend, 'public', 'samples');
mkdirSync(out, { recursive: true });

const env = loadEnv();
const client = createClient(env, { extractionModel: args.model, ocrModel: args.model });
const index = [];
for (const id of SAMPLES) {
  const doc = docById(id);
  let result: ExtractionResult;
  const saved = client && join(EVAL_DIR, 'results', 'runs', `${id}.${client.model}.json`);
  if (args['from-runs'] && saved && existsSync(saved)) {
    result = JSON.parse(readFileSync(saved, 'utf8'));
  } else {
    if (!client) throw new Error('No API key: set one in frontend/.env.local, or use --from-runs after an eval run.');
    process.stdout.write(`${id} ... `);
    result = (await runDoc(doc, client)).result;
    console.log(`${Math.round(result.quality.durationMs / 1000)} s`);
  }
  result.document.id = `sample-${id}`;
  writeFileSync(join(out, `${id}.json`), JSON.stringify(result));
  const pdf = pdfPath(id);
  copyFileSync(pdf, join(out, `${id}.pdf`));
  index.push({
    slug: id,
    title: result.document.title ?? doc.title,
    year: result.document.year,
    pages: result.document.pages,
    format: FORMAT[doc.format] ?? doc.format,
    source: 'MDEQ',
    pdf: `/samples/${id}.pdf`,
    sourceUrl: doc.url,
    counts: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, result.report[k].length])),
  });
}
writeFileSync(join(frontend, 'src', 'data', 'samples.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${index.length} samples`);
