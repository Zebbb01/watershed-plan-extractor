import { runPipeline, UNREADABLE_SCAN, type ErrorCode, type ExtractionResult, type PipelineDeps, type Progress } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf, readPdfBrowser, renderPageJpegBrowser, sha256Hex } from './pdf/browser-reader';
import { loadResult, saveResult } from './store';

/*
 * The browser side of a run, in two steps so the page can show the page count (and a time
 * estimate for long documents) before any model call:
 *   prepareFile  read the file once, hash it, reuse a stored result, else open it with pdf.js
 *   extractFile  read every page and run the shared pipeline with the API routes as its model
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

/** The server's answer when it cannot be asked: no provider, default limits. */
export const NO_HEALTH: Health = { provider: null, model: null, limits: { maxPages: 800 } };

/** What the server can do (provider, limits); never throws. */
export const fetchHealth = (): Promise<Health> =>
  fetch('/api/health')
    .then((r) => r.json() as Promise<Health>)
    .catch(() => NO_HEALTH);

/**
 * Opens a PDF only if it is the file a report was made from (same SHA-256), so a retry or a
 * side-by-side check never mixes two plans. Hashes first: pdf.js takes over the buffer.
 */
export async function openSameFile(
  file: File,
  id: string,
  deps: { open: (data: Uint8Array) => Promise<PDFDocumentProxy> } = { open: openPdf },
): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer());
  if ((await sha256Hex(data)) !== id) throw new Error('This is a different file from the one this report was made from.');
  return deps.open(data);
}

export interface Prepared {
  id: string;
  fileName: string;
  cached: ExtractionResult | null;
  doc: PDFDocumentProxy | null;
}

export async function prepareFile(
  file: File,
  deps: { load: (id: string) => Promise<ExtractionResult | null>; open: (data: Uint8Array) => Promise<PDFDocumentProxy | null> } = {
    load: loadResult,
    open: openPdf,
  },
): Promise<Prepared> {
  const data = new Uint8Array(await file.arrayBuffer());
  const id = await sha256Hex(data);
  const stored = await deps.load(id);
  // A complete stored result is reused. One with failed sections runs again, which retries them,
  // and so does one in which no scanned page could be read (images the browser could not draw then).
  const unread = !stored?.quality.ocrPages?.length && Boolean(stored?.quality.skippedPages?.some((s) => s.reason === UNREADABLE_SCAN));
  const cached = stored && stored.quality.failedUnits.length === 0 && !unread ? stored : null;
  // A stored result still opens the PDF (best effort) so the evidence panel can show pages.
  // pdf.js takes over the buffer, so the file is hashed first and `data` is not used after this.
  const doc = await deps.open(data).catch((e) => {
    if (cached) return null;
    throw e;
  });
  return { id, fileName: file.name, cached, doc };
}

const yearOf = (s: string) => Number(/\b(19|20)\d{2}\b/.exec(s)?.[0]) || null;

export async function extractFile(
  prepared: Prepared & { doc: PDFDocumentProxy },
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
  health: Health,
): Promise<ExtractionResult> {
  const { doc } = prepared;
  const { rawPages, title } = await readPdfBrowser(doc, {
    signal,
    maxPages: health.limits.maxPages,
    onPage: (n, total) => onProgress({ stage: 'read', done: n, total }),
  });
  const deps: PipelineDeps = {
    extract: (req, s) => apiCall('/api/extract', req, s),
    ocr: (req, s) => apiCall('/api/ocr', req, s),
    renderPage: (n) => renderPageJpegBrowser(doc, n),
    onProgress,
  };
  const fallbackTitle = prepared.fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  const result = await runPipeline(
    {
      doc: {
        id: prepared.id,
        fileName: prepared.fileName,
        pages: doc.numPages,
        title: title ?? fallbackTitle,
        year: yearOf(`${title ?? ''} ${prepared.fileName}`),
      },
      rawPages,
    },
    deps,
    { signal, concurrency: 4, provider: health.provider ?? undefined, model: health.model ?? undefined },
  );
  await saveResult(result);
  return result;
}

/** Rough minutes for a document: about 6 pages per call, 4 calls at a time, ~25 s a call. */
export const estimateMinutes = (pages: number) => Math.max(1, Math.round(((pages / 6) * 25) / 4 / 60));
