'use client';

import { normalizeForMatch, toTextItems, type AnyItem } from '@app/backend';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

/*
 * Shows where an item came from: each quote, and the PDF page itself with the quoted lines
 * highlighted. When the file is not in this browser, the quote and page number still show,
 * with a link to the source PDF when one is known.
 */

export function EvidenceSheet({
  item,
  categoryLabel,
  onClose,
  getDoc,
  sourceUrl,
}: {
  item: AnyItem | null;
  categoryLabel: string;
  onClose: () => void;
  getDoc: () => Promise<PDFDocumentProxy | null>;
  sourceUrl?: string | null;
}) {
  // The page picked for this item; another item opens on its first quote's page.
  const [picked, setPicked] = useState<{ item: AnyItem; page: number } | null>(null);
  const page = picked && picked.item === item ? picked.page : (item?.evidence[0]?.page ?? null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null | undefined>(undefined);

  useEffect(() => {
    if (item && doc === undefined) getDoc().then(setDoc).catch(() => setDoc(null));
  }, [item, doc, getDoc]);

  const quotes = item?.evidence.filter((e) => e.page === page).map((e) => e.quote) ?? [];
  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => !o && onClose()} title={item?.name ?? ''} description={categoryLabel}>
      {item && (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={item.confidence === 'high' ? 'positive' : 'warning'}>{item.confidence === 'high' ? 'Verified on page' : 'Verified, medium confidence'}</Badge>
            <Badge tone="neutral">{item.kind === 'main' ? 'Main item' : item.kind === 'sub' ? 'Sub-item' : 'Example'}</Badge>
            <Badge tone="neutral">{item.source === 'table' ? 'From a table' : item.source === 'ocr' ? 'From a scanned page' : 'From text'}</Badge>
          </div>
          {item.needsReview && (
            <p className="flex items-start gap-2 rounded-panel bg-warning-50 px-3 py-2 text-[13px] text-warning-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {item.needsReview}
            </p>
          )}
          {item.text && item.text !== item.name && <p className="text-[14px] text-slate-700">{item.text}</p>}

          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Evidence</h3>
            <ul className="space-y-2">
              {item.evidence.map((e, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setPicked({ item, page: e.page })}
                    aria-pressed={page === e.page}
                    className={cn(
                      'w-full rounded-panel border px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-primary-600',
                      page === e.page ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <span className="mb-0.5 block text-[12px] font-semibold text-slate-500">Page {e.page}</span>
                    <span className="text-slate-800">“{e.quote}”</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {page !== null &&
            (doc ? (
              <PageView doc={doc} page={page} quotes={quotes} />
            ) : doc === null ? (
              <p className="text-[13px] text-slate-500">
                The PDF is not open in this browser, so the page cannot be shown.
                {sourceUrl && (
                  <>
                    {' '}
                    <a
                      href={`${sourceUrl}#page=${page}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary-700 underline-offset-2 hover:underline"
                    >
                      Open page {page} of the source PDF <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </>
                )}
              </p>
            ) : (
              <Skeleton className="aspect-[8.5/11] w-full" />
            ))}
        </div>
      )}
    </Sheet>
  );
}

function PageView({ doc, page, quotes }: { doc: PDFDocumentProxy; page: number; quotes: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [ready, setReady] = useState(false);
  const quoteKey = quotes.join('\n');

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      setReady(false);
      const p = await doc.getPage(page);
      const width = box.current?.clientWidth ?? 560;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: width / base.width });
      const c = canvas.current;
      if (!c || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      const render = p.render({ canvas: c, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      task = render;
      await render.promise;
      // Highlight text runs that belong to the quote.
      const wanted = quoteKey.split('\n').map(normalizeForMatch);
      const items = toTextItems((await p.getTextContent()).items, viewport.transform);
      const hits = items.filter((it) => {
        const t = normalizeForMatch(it.str);
        return t.length >= 4 && wanted.some((q) => q.includes(t));
      });
      // Keep the lines where most of the quote matched; a lone number elsewhere on the page
      // (the same "2500" in another table row) is a coincidence, not the evidence.
      const lines = new Map<number, typeof hits>();
      for (const h of hits) lines.set(Math.round(h.y / 4), [...(lines.get(Math.round(h.y / 4)) ?? []), h]);
      const most = Math.max(0, ...[...lines.values()].map((l) => l.length));
      const kept = [...lines.values()].filter((l) => l.length >= Math.max(1, most / 2)).flat();
      if (!cancelled) {
        setMarks(kept.map((it) => ({ x: it.x, y: it.y - it.h * 0.85, w: it.w, h: it.h * 1.1 })));
        setReady(true);
      }
    })().catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, quoteKey]);

  return (
    <div ref={box} className="relative overflow-hidden rounded-panel border border-slate-200 bg-white">
      {!ready && <Skeleton className="absolute inset-0" />}
      <canvas ref={canvas} aria-label={`Page ${page} of the PDF with the quote highlighted`} role="img" />
      {marks.map((m, i) => (
        <span key={i} aria-hidden className="evidence-mark pointer-events-none absolute" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} />
      ))}
    </div>
  );
}
