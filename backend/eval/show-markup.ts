import { buildPageModel } from '../src/layout/page-model';
import { annotateDocument } from '../src/layout/document';
import { renderMarkup } from '../src/layout/markup';
import { pdfPath } from './doc-set';
import { readPdfNode } from './read-pdf';

// Prints the markup the model would read: tsx eval/show-markup.ts <docId> [first] [last]
const [docId, first, last] = process.argv.slice(2);
const { pages } = await readPdfNode(pdfPath(docId), { firstPage: Number(first ?? 1), lastPage: Number(last ?? first ?? 9999) });
const models = annotateDocument(pages.map(buildPageModel));
for (const m of models) {
  const f = Object.entries(m.flags).filter(([, v]) => v).map(([k]) => k).join(',');
  console.log(`\n===== page ${m.n} ${f ? `[${f}]` : ''}`);
  console.log(renderMarkup(m));
}
