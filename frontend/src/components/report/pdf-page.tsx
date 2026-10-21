'use client';

import { toTextItems } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { pickHighlightRuns } from '@/lib/pdf/highlight';

/**
 * One PDF page drawn to fit its box, with the text runs of the given quotes highlighted. A
 * scanned page has no text to mark, and says so instead of showing nothing.
 */
export function PdfPage({ doc, page, quotes }: { doc: PDFDocumentProxy; page: number; quotes: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<'scanned' | 'unmatched' | null>(null);
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
      const quoted = quoteKey ? quoteKey.split('\n') : [];
      const items = toTextItems((await p.getTextContent()).items, viewport.transform);
      const kept = pickHighlightRuns(items, quoted);
      if (!cancelled) {
        setMarks(kept.map((it) => ({ x: it.x, y: it.y - it.h * 0.85, w: it.w, h: it.h * 1.1 })));
        setNote(!quoted.length ? null : !items.length ? 'scanned' : kept.length ? null : 'unmatched');
        setReady(true);
      }
    })().catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, quoteKey]);

  // Bring the first marked line into view inside whatever scrolls the page (the PDF pane or the
  // evidence panel), without moving the window.
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('.evidence-mark');
    let scroller = first?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!first || !scroller) return;
    const top = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3), behavior: 'smooth' });
  }, [marks]);

  return (
    <div>
      {ready && note && (
        <p className="mb-2 rounded-panel bg-slate-800 px-2.5 py-1.5 text-[12px] text-white">
          {note === 'scanned'
            ? 'Scanned page: it was read from the image, so the words cannot be marked on it. The quote is shown above.'
            : 'The quote could not be marked word for word on this page. It is shown above.'}
        </p>
      )}
      <div ref={box} className={cn('relative overflow-hidden rounded-panel bg-white ring-1 ring-slate-200', !ready && 'min-h-96')}>
        {!ready && <Skeleton className="absolute inset-0" />}
        <canvas ref={canvas} aria-label={`Page ${page} of the PDF${quotes.length ? ' with the quote highlighted' : ''}`} role="img" />
        {marks.map((m, i) => (
          <span key={i} aria-hidden className="evidence-mark pointer-events-none absolute" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} />
        ))}
      </div>
    </div>
  );
}
