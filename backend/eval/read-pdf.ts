import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { hasImageOps, toTextItems } from '../src/pdf/convert';
import type { RawPage } from '../src/schema';

// Node-side PDF reading for the eval CLI and sample builder. The browser has its own reader;
// both hand the same RawPage shape to the shared layout code.

const require = createRequire(import.meta.url);
const PDFJS = dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONTS = join(PDFJS, 'standard_fonts') + '/';
// JPEG 2000 and JBIG2 scans decode only with pdf.js's wasm decoders; without them those pages render blank.
const WASM = join(PDFJS, 'wasm') + '/';

const docs = new Map<string, Promise<PDFDocumentProxy>>();

function openPdf(path: string): Promise<PDFDocumentProxy> {
  let doc = docs.get(path);
  if (!doc) {
    doc = getDocument({
      data: new Uint8Array(readFileSync(path)),
      standardFontDataUrl: STANDARD_FONTS,
      wasmUrl: WASM,
      verbosity: 0,
    }).promise;
    docs.set(path, doc);
  }
  return doc;
}

export async function readPdfNode(
  path: string,
  opts: { firstPage?: number; lastPage?: number } = {},
): Promise<{ pages: RawPage[]; title: string | null; numPages: number }> {
  const doc = await openPdf(path);
  const from = opts.firstPage ?? 1;
  const to = Math.min(opts.lastPage ?? doc.numPages, doc.numPages);
  const pages: RawPage[] = [];
  for (let n = from; n <= to; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = toTextItems(content.items, viewport.transform);
    const chars = items.reduce((s, i) => s + i.str.replace(/\s/g, '').length, 0);
    const hasImage = chars < 30 ? hasImageOps((await page.getOperatorList()).fnArray, OPS as unknown as Record<string, number>) : false;
    pages.push({ n, width: viewport.width, height: viewport.height, items, hasImage });
    page.cleanup();
  }
  const meta = (await doc.getMetadata().catch(() => null)) as { info?: { Title?: string } } | null;
  const title = meta?.info?.Title?.trim() || null;
  return { pages, title, numPages: doc.numPages };
}

/** Renders one page to a base64 JPEG whose longer side is at most `maxSide` pixels. */
export async function renderPageJpeg(path: string, n: number, maxSide = 1400): Promise<string> {
  const doc = await openPdf(path);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  page.cleanup();
  return canvas.encodeSync('jpeg', 75).toString('base64');
}
