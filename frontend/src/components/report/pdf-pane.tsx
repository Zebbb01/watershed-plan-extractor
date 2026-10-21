'use client';

import type { AnyItem, CategoryKey } from '@app/backend';
import { ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileUp, Loader2, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';
import { openSameFile } from '@/lib/run-extraction';
import { session } from '@/lib/session';
import { savePdf } from '@/lib/store';
import { PdfPage } from './pdf-page';

/*
 * The original PDF beside the results. Picking an item turns to its page with the quote
 * highlighted; the items found on the shown page are listed under it, so the check works in
 * both directions. When the file is no longer open (a report reopened later), dropping the
 * same PDF here opens it again: its SHA-256 must equal the report's id.
 */

export type Focus = { item: AnyItem; page: number };

export function PdfPane({
  docId,
  pages,
  getDoc,
  focus,
  onFocus,
  items,
  pdfUrl,
  sourceUrl,
  onClose,
}: {
  docId: string;
  pages: number;
  getDoc: () => Promise<PDFDocumentProxy | null>;
  focus: Focus | null;
  onFocus: (f: Focus) => void;
  items: { item: AnyItem; category: CategoryKey }[];
  /** the shipped copy of a sample */
  pdfUrl?: string | null;
  /** where the PDF is published, for samples too large to ship */
  sourceUrl?: string | null;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null | undefined>(undefined);
  // The page follows the picked item until the reader turns pages themselves.
  const [nav, setNav] = useState<{ focus: Focus | null; page: number }>({ focus, page: focus?.page ?? 1 });
  const page = nav.focus === focus ? nav.page : (focus?.page ?? nav.page);
  const go = (p: number) => setNav({ focus, page: Math.min(Math.max(1, p), pages) });

  useEffect(() => {
    getDoc()
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [getDoc]);

  const quotes = focus && focus.page === page ? focus.item.evidence.filter((e) => e.page === page).map((e) => e.quote) : [];
  const here = items.filter(({ item }) => item.evidence.some((e) => e.page === page));

  async function openOriginal() {
    if (pdfUrl) return void window.open(`${pdfUrl}#page=${page}`, '_blank', 'noopener');
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([(await doc.getData()) as BlobPart], { type: 'application/pdf' }));
    window.open(`${url}#page=${page}`, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <section aria-label="Original PDF" className={cn(cardClass, 'flex max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden')}>
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
        <h2 className="mr-auto text-[14px] font-semibold text-slate-900">Original PDF</h2>
        <button type="button" aria-label="Previous page" disabled={page <= 1 || !doc} onClick={() => go(page - 1)} className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="tabular min-w-24 text-center text-[13px] text-slate-600" aria-live="polite">
          Page {page} of {pages}
        </span>
        <button type="button" aria-label="Next page" disabled={page >= pages || !doc} onClick={() => go(page + 1)} className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {(pdfUrl || doc) && (
          <button type="button" aria-label="Open the PDF in a new tab" title="Open in a new tab" onClick={openOriginal} className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
            <ExternalLink className="size-4" aria-hidden />
          </button>
        )}
        <button type="button" aria-label="Close the PDF" onClick={onClose} className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/70 p-3">
        {doc ? (
          <PdfPage doc={doc} page={page} quotes={quotes} />
        ) : doc === undefined ? (
          <Skeleton className="aspect-[8.5/11] w-full" />
        ) : sourceUrl ? (
          <p className="rounded-panel bg-white p-4 text-[13px] text-slate-600 ring-1 ring-slate-200">
            This sample&apos;s PDF is too large to include here.{' '}
            <a href={`${sourceUrl}#page=${page}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">
              Open page {page} on MDEQ <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </p>
        ) : (
          <AttachPdf docId={docId} onOpen={setDoc} />
        )}
      </div>

      {doc && (
        <div className="max-h-40 overflow-y-auto border-t border-slate-200 px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {here.length ? `Found on this page · ${here.length}` : 'Nothing extracted from this page'}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {here.map(({ item, category }) => (
              <li key={item.id} className="max-w-full">
                <button
                  type="button"
                  onClick={() => onFocus({ item, page })}
                  aria-pressed={focus?.item.id === item.id}
                  className={cn(
                    'flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 focus-visible:outline-2 focus-visible:outline-primary-600',
                    focus?.item.id === item.id ? 'bg-primary-50 font-medium text-primary-800 ring-primary-300' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CATEGORY_UI[category].color }} />
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AttachPdf({ docId, onOpen }: { docId: string; onOpen: (doc: PDFDocumentProxy) => void }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    noClick: true,
    onDrop: async ([file]) => {
      if (!file) return;
      setState({ busy: true, error: null });
      try {
        const doc = await openSameFile(file, docId);
        void savePdf(docId, file);
        session.setDoc(docId, doc);
        onOpen(doc);
      } catch (e) {
        setState({ busy: false, error: (e as Error).message.startsWith('This is a different file') ? (e as Error).message : 'This file could not be opened.' });
      }
    },
  });
  return (
    <div
      {...getRootProps({
        className: cn(
          'flex flex-col items-center gap-3 rounded-panel border-2 border-dashed px-5 py-10 text-center',
          isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white',
        ),
      })}
    >
      <input {...getInputProps({ 'aria-label': 'Choose the original PDF' })} />
      {state.busy ? (
        <Loader2 className="size-6 text-primary-600 motion-safe:animate-spin" aria-hidden />
      ) : (
        <span className="grid size-11 place-items-center rounded-full bg-primary-50 text-primary-600">
          <FileUp className="size-5" aria-hidden />
        </span>
      )}
      <div>
        <p className="text-[14px] font-semibold text-slate-900">Add the original PDF to compare</p>
        <p className="mt-1 text-[12px] text-slate-500">This browser keeps only the last three files (up to 150 MB each). Choose it again to compare.</p>
      </div>
      <button type="button" onClick={open} className={buttonClass('secondary', 'md')}>
        Choose the PDF
      </button>
      {state.error && (
        <p role="alert" className="flex items-center gap-1.5 text-[12px] text-negative-700">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
    </div>
  );
}
