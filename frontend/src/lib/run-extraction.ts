import { runPipeline, type ErrorCode, type ExtractionResult, type PipelineDeps, type Progress } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf, readPdfBrowser, renderPageJpegBrowser, sha256Hex } from './pdf/browser-reader';
import { loadResult, saveResult } from './store';

/*
 * The browser side of a run: read the file once, reuse a stored result when this exact file
 * was done before, otherwise read pages with pdf.js and run the shared pipeline with the two
 * API routes as its model calls.
 */

const abortError = () => Object.assign(new Error('Cancelled.'), { name: 'AbortError' });

/** POST JSON; failures become { code, retryAfter } errors the pipeline knows how to handle. */
export async function apiCall<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch {
    if (signal.aborted) throw abortError();
    throw { code: 'UPSTREAM_ERROR' as ErrorCode, message: 'Could not reach the server.' };
  }
  if (res.ok) return (await res.json()) as T;
  const payload = (await res.json().catch(() => null)) as { error?: { code?: ErrorCode; message?: string; retryAfter?: number } } | null;
  // Host error pages are not JSON: a gateway timeout means the unit was too big for one call.
  const code: ErrorCode = payload?.error?.code ?? (res.status === 504 ? 'TIMEOUT' : res.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR');
  const retryAfter = payload?.error?.retryAfter ?? (Number(res.headers.get('retry-after')) || undefined);
  throw { code, retryAfter, message: payload?.error?.message };
}

export interface Health {
  provider: string | null;
  model: string | null;
  limits: { maxPages: number };
}

interface Deps {
  load: (id: string) => Promise<ExtractionResult | null>;
  save: (r: ExtractionResult) => Promise<void>;
  open: (data: Uint8Array) => Promise<PDFDocumentProxy | null>;
  run: typeof runPipeline;
}

const year = (s: string) => Number(/\b(19|20)\d{2}\b/.exec(s)?.[0]) || null;

export async function startExtraction(
  file: File,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  deps: Deps = { load: loadResult, save: saveResult, open: openPdf, run: runPipeline },
  health: Health = { provider: null, model: null, limits: { maxPages: 800 } },
): Promise<{ result: ExtractionResult; doc: PDFDocumentProxy | null; fromCache: boolean }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const id = await sha256Hex(data);
  const cached = await deps.load(id);
  if (cached) return { result: cached, doc: await deps.open(data).catch(() => null), fromCache: true };

  const doc = await deps.open(data);
  if (!doc) throw new Error('This PDF could not be read.');
  const { rawPages, title } = await readPdfBrowser(doc, {
    signal,
    maxPages: health.limits.maxPages,
    onPage: (n, total) => onProgress({ stage: 'read', done: n, total }),
  });
  const pipelineDeps: PipelineDeps = {
    extract: (req, s) => apiCall('/api/extract', req, s),
    ocr: (req, s) => apiCall('/api/ocr', req, s),
    renderPage: (n) => renderPageJpegBrowser(doc, n),
    onProgress,
  };
  const name = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  const result = await deps.run(
    { doc: { id, fileName: file.name, pages: doc.numPages, title: title ?? name, year: year(`${title ?? ''} ${file.name}`) }, rawPages },
    pipelineDeps,
    { signal, concurrency: 4, provider: health.provider ?? undefined, model: health.model ?? undefined },
  );
  await deps.save(result);
  return { result, doc, fromCache: false };
}
