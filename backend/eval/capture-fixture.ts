import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR, pdfPath } from './doc-set';
import { readPdfNode } from './read-pdf';

// Saves RawPage JSON for layout tests: tsx eval/capture-fixture.ts <docId> <page> [page...]
const [docId, ...pageArgs] = process.argv.slice(2);
const out = join(EVAL_DIR, '..', 'src', 'layout', '__fixtures__');
mkdirSync(out, { recursive: true });
for (const n of pageArgs.map(Number)) {
  const { pages } = await readPdfNode(pdfPath(docId), { firstPage: n, lastPage: n });
  const file = join(out, `${docId}-p${n}.json`);
  writeFileSync(file, JSON.stringify(pages[0]));
  console.log(`wrote ${file} (${pages[0].items.length} items)`);
}
