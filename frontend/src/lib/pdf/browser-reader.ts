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

// pdf.js decodes JPEG 2000 (JPX) and JBIG2 images, common in scanned plans, with WebAssembly
// it fetches from here. Without it those pages are drawn blank. scripts/copy-pdfjs-assets.mjs
// copies the files into public/ before every dev or build run.
const WASM_URL = '/pdfjs/wasm/';

/**
 * Opens a PDF. pdf.js takes ownership of `data` (its buffer moves to the worker), so callers
 * must not use it afterwards. No copy is made: on a 300 MB file a copy doubles peak memory.
 */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({ data, wasmUrl: WASM_URL }).promise;
}

/**
 * True when a rendered page holds no ink: every sampled pixel is white. A page that could not
 * be drawn comes out like this, and so does a blank sheet; neither is worth paying to read.
 */
export function isBlankImage(rgba: Uint8ClampedArray, step = 7): boolean {
  for (let i = 0; i < rgba.length; i += 4 * step) {
    if (rgba[i] < 250 || rgba[i + 1] < 250 || rgba[i + 2] < 250) return false;
  }
  return true;
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

/** One page as a base64 JPEG whose longer side is at most maxSide pixels, or '' when it comes out blank. */
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
  // The print intent draws without requestAnimationFrame, which a browser pauses in a background
  // tab: with the display intent, a run whose tab was hidden stopped drawing pages until it came back.
  await page.render({ canvas, viewport, intent: 'print' }).promise;
  page.cleanup();
  if (isBlankImage(ctx.getImageData(0, 0, canvas.width, canvas.height).data)) {
    canvas.width = canvas.height = 0;
    return '';
  }
  const url = canvas.toDataURL('image/jpeg', 0.75);
  canvas.width = canvas.height = 0; // free the bitmap now, not at garbage collection
  return url.slice(url.indexOf(',') + 1);
}
