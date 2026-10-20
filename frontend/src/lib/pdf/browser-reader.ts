import { hasImageOps, toTextItems, type RawPage } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * Reads a PDF in the browser with pdf.js (its parser runs in a Web Worker). The file never
 * leaves the device: only page text, and images of table or scanned pages, are sent on.
 */

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return lib;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  return lib.getDocument({ data: data.slice() }).promise;
}

export async function readPdfBrowser(
  doc: PDFDocumentProxy,
  opts: { signal: AbortSignal; onPage?: (n: number, total: number) => void; maxPages?: number },
): Promise<{ rawPages: RawPage[]; title: string | null }> {
  const lib = await pdfjs();
  const total = Math.min(doc.numPages, opts.maxPages ?? doc.numPages);
  const rawPages: RawPage[] = [];
  for (let n = 1; n <= total; n++) {
    if (opts.signal.aborted) throw Object.assign(new Error('Cancelled.'), { name: 'AbortError' });
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const items = toTextItems((await page.getTextContent()).items, viewport.transform);
    const chars = items.reduce((s, i) => s + i.str.replace(/\s/g, '').length, 0);
    const hasImage = chars < 30 ? hasImageOps((await page.getOperatorList()).fnArray, lib.OPS as unknown as Record<string, number>) : false;
    rawPages.push({ n, width: viewport.width, height: viewport.height, items, hasImage });
    page.cleanup();
    opts.onPage?.(n, total);
    if (n % 10 === 0) await new Promise((r) => setTimeout(r)); // keep the page responsive
  }
  const meta = (await doc.getMetadata().catch(() => null)) as { info?: { Title?: string } } | null;
  return { rawPages, title: meta?.info?.Title?.trim() || null };
}

/** One page as a base64 JPEG whose longer side is at most maxSide pixels. */
export async function renderPageJpegBrowser(doc: PDFDocumentProxy, n: number, maxSide = 1400): Promise<string> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  const url = canvas.toDataURL('image/jpeg', 0.75);
  canvas.width = canvas.height = 0; // free the bitmap now, not at garbage collection
  return url.slice(url.indexOf(',') + 1);
}
