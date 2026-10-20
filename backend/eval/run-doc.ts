import { handleExtract, handleOcr } from '../src/handlers';
import type { LlmClient } from '../src/llm/provider';
import { runPipeline } from '../src/pipeline';
import type { ExtractionResult, RawPage } from '../src/schema';
import { pdfPath, type EvalDoc } from './doc-set';
import { readPdfNode, renderPageJpeg } from './read-pdf';

/**
 * Runs the production pipeline on one eval document, calling the handlers directly with the
 * same 50 s per-call deadline the API routes use.
 */
export async function runDoc(doc: EvalDoc, client: LlmClient, concurrency = 4): Promise<{ result: ExtractionResult; pages: RawPage[] }> {
  const path = pdfPath(doc.id);
  const { pages, title } = await readPdfNode(path);
  const deadline = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(50_000)]);
  const result = await runPipeline(
    {
      doc: { id: doc.id, fileName: doc.file, pages: pages.length, title: doc.title.replace(/\s*\(.*\)$/, '') || title, year: Number(/\d{4}/.exec(doc.title)?.[0]) || null },
      rawPages: pages,
    },
    {
      extract: (req, signal) => handleExtract(req, client, deadline(signal)),
      ocr: (req, signal) => handleOcr(req, client, deadline(signal)),
      renderPage: (n) => renderPageJpeg(path, n),
    },
    { concurrency, provider: client.provider, model: client.model },
  );
  return { result, pages };
}
