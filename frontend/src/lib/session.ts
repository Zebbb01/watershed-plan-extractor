import type { ExtractionResult } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The results and open PDFs of this browser tab. The report page reads from here first, so
 * the evidence panel can render pages of the file just processed without reading it again.
 */
const results = new Map<string, ExtractionResult>();
const docs = new Map<string, PDFDocumentProxy>();

export const session = {
  put(result: ExtractionResult, doc?: PDFDocumentProxy | null) {
    results.set(result.document.id, result);
    if (doc) docs.set(result.document.id, doc);
  },
  result: (id: string) => results.get(id) ?? null,
  doc: (id: string) => docs.get(id) ?? null,
  setDoc: (id: string, doc: PDFDocumentProxy) => docs.set(id, doc),
};
