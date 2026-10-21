'use client';

import { normalizeForMatch, toTextItems } from '@app/backend';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

/** One PDF page drawn to fit its box, with the text runs of the given quotes highlighted. */
export function PdfPage({ doc, page, quotes }: { doc: PDFDocumentProxy; page: number; quotes: string[] }) {
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
      const wanted = quoteKey ? quoteKey.split('\n').map(normalizeForMatch) : [];
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
    <div ref={box} className={cn('relative overflow-hidden rounded-panel bg-white ring-1 ring-slate-200', !ready && 'min-h-96')}>
      {!ready && <Skeleton className="absolute inset-0" />}
      <canvas ref={canvas} aria-label={`Page ${page} of the PDF${quotes.length ? ' with the quote highlighted' : ''}`} role="img" />
      {marks.map((m, i) => (
        <span key={i} aria-hidden className="evidence-mark pointer-events-none absolute" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} />
      ))}
    </div>
  );
}
