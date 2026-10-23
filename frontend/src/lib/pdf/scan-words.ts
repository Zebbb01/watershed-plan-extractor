import type { PDFPageProxy } from 'pdfjs-dist';
import type { Worker } from 'tesseract.js';
import type { Run } from './highlight';

/*
 * The words on a scanned page and where they are, read in this browser by Tesseract so a quote
 * can be marked on the page image. Extraction used the AI model's reading of the page; this is
 * only for pointing at the words. Tesseract and its files (public/tesseract/, about 7 MB) load
 * the first time a scanned page shows a quote.
 */

// About 200 dpi for a letter page: enough for small print.
const READ_WIDTH = 1700;

let worker: Promise<Worker> | null = null;
const pages = new Map<string, Promise<Run[]>>();

/** The page's words in reading order, with boxes in page units (x, y is the top left). */
export function readScannedWords(page: PDFPageProxy, key: string): Promise<Run[]> {
  let words = pages.get(key);
  if (!words) {
    words = read(page);
    pages.set(key, words);
    words.catch(() => pages.delete(key));
  }
  return words;
}

async function read(page: PDFPageProxy): Promise<Run[]> {
  const scale = READ_WIDTH / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;

  if (!worker) {
    worker = import('tesseract.js').then(async ({ createWorker, OEM, PSM }) => {
      const w = await createWorker('eng', OEM.LSTM_ONLY, { workerPath: '/tesseract/worker.min.js', corePath: '/tesseract/', langPath: '/tesseract/', workerBlobURL: false });
      // Tesseract.js reads a page as one block of text by default, which skips many words of a
      // ruled table; automatic segmentation finds them (Buttahatchee pages 3, 32, 34, 35, 105:
      // 71 of 73 quotes marked, against 60 as one block).
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      return w;
    });
    // A failed start (offline, say) is tried again next time.
    worker.catch(() => (worker = null));
  }
  const { data } = await (await worker).recognize(canvas, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((p) =>
      p.lines.flatMap((line) =>
        line.words.map(({ text, bbox }) => ({ str: text, x: bbox.x0 / scale, y: bbox.y0 / scale, w: (bbox.x1 - bbox.x0) / scale, h: (bbox.y1 - bbox.y0) / scale })),
      ),
    ),
  );
}
