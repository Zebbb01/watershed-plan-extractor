'use client';

import { CATEGORY_KEYS } from '@app/backend';
import { FileText, History, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { readErrorMessage, validatePdfFile } from '@/lib/pdf/validate';
import { estimateMinutes, extractFile, prepareFile, type Health, type Prepared } from '@/lib/run-extraction';
import { session } from '@/lib/session';
import { listRecent, type RecentEntry } from '@/lib/store';
import { Processing, reduceProgress, type RunState } from './processing';

export interface SampleCard {
  slug: string;
  title: string;
  year: number | null;
  pages: number;
  format: string;
  source: string;
  /** shipped copy of the PDF, or null when it is too large to ship */
  pdf: string | null;
  sourceUrl: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'opening'; fileName: string }
  | { kind: 'confirm'; prepared: Prepared & { doc: NonNullable<Prepared['doc']> } }
  | { kind: 'running'; fileName: string; pages: number; state: RunState };

const BIG_DOC_PAGES = 100;

export function Home({ samples }: { samples: SampleCard[] }) {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ provider: null, model: null, limits: { maxPages: 800 } }));
    listRecent().then(setRecent);
  }, []);

  const live = Boolean(health?.provider);

  async function onFile(file: File) {
    setError(null);
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const check = validatePdfFile({ name: file.name, size: file.size, head });
    if (!check.ok) return setError(check.reason);
    setPhase({ kind: 'opening', fileName: file.name });
    try {
      const prepared = await prepareFile(file);
      if (prepared.cached) {
        session.put(prepared.cached, prepared.doc);
        return router.push(`/report/${prepared.id}`);
      }
      const doc = prepared.doc!;
      if (doc.numPages > BIG_DOC_PAGES) return setPhase({ kind: 'confirm', prepared: { ...prepared, doc } });
      await run({ ...prepared, doc });
    } catch (e) {
      setPhase({ kind: 'idle' });
      setError(readErrorMessage(e));
    }
  }

  async function run(prepared: Prepared & { doc: NonNullable<Prepared['doc']> }) {
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: 'running', fileName: prepared.fileName, pages: prepared.doc.numPages, state: {} });
    try {
      const result = await extractFile(
        prepared,
        (p) => setPhase((ph) => (ph.kind === 'running' ? { ...ph, state: reduceProgress(ph.state, p) } : ph)),
        controller.signal,
        health ?? { provider: null, model: null, limits: { maxPages: 800 } },
      );
      session.put(result, prepared.doc);
      router.push(`/report/${prepared.id}`);
    } catch (e) {
      setPhase({ kind: 'idle' });
      setError((e as { name?: string }).name === 'AbortError' ? 'Cancelled. Nothing was saved.' : 'The extraction stopped: ' + readErrorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Extract a watershed plan</h1>
        <p className="mt-2 text-[15px] text-slate-600">
          Goals, BMPs, activities, monitoring, outreach and areas, each checked against the page it came from.
        </p>
      </div>

      {health && !live && (
        <div className="mb-4 flex items-start gap-2.5 rounded-panel border border-warning-100 bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-700" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Live extraction is off on this server because no AI key is set. The samples below still work.</span>
        </div>
      )}

      {phase.kind === 'running' ? (
        <Processing fileName={phase.fileName} pages={phase.pages} state={phase.state} onCancel={() => abort.current?.abort()} />
      ) : phase.kind === 'confirm' ? (
        <section className="rounded-panel border border-slate-200 bg-white p-5" aria-labelledby="confirm-title">
          <h2 id="confirm-title" className="text-[15px] font-semibold text-slate-900">
            {phase.prepared.fileName}
          </h2>
          <p className="mt-1 text-[14px] text-slate-600">
            {phase.prepared.doc.numPages} pages · about {estimateMinutes(phase.prepared.doc.numPages)} min. Keep this tab open while it runs.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => run(phase.prepared)}>
              Start extraction
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
              Choose another file
            </Button>
          </div>
        </section>
      ) : (
        <Dropzone onFile={onFile} disabled={!live || phase.kind === 'opening'} error={error} />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul className="flex flex-wrap gap-1.5" aria-label="What it extracts">
          {CATEGORY_KEYS.map((k) => (
            <li key={k} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700">
              <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[k].color }} />
              {CATEGORY_UI[k].label}
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <ShieldCheck className="size-3.5 text-positive-600" aria-hidden />
          Your PDF stays in this browser. Only page text, and images of table or scanned pages, are sent for analysis. Nothing is stored on the server.
        </p>
      </div>

      {samples.length > 0 && (
        <section className="mt-10" aria-labelledby="samples-title">
          <h2 id="samples-title" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            Try a sample
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {samples.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/report/sample-${s.slug}`}
                  className="group flex h-full flex-col rounded-panel border border-slate-200 bg-white p-4 transition-colors hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-primary-600"
                >
                  <FileText className="size-5 text-primary-600" aria-hidden />
                  <span className="mt-2 text-[14px] font-semibold leading-snug text-slate-900 group-hover:text-primary-700">{s.title}</span>
                  <span className="mt-1 text-[12px] text-slate-500">
                    {s.year} · {s.pages} pages
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <Badge tone="neutral">{s.format}</Badge>
                    <span className="text-[11px] text-slate-500">Source: {s.source}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="recent-title">
          <h2 id="recent-title" className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            <History className="size-3.5" aria-hidden />
            Recent in this browser
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-panel border border-slate-200 bg-white">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/report/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary-600"
                >
                  <span className="truncate font-medium text-slate-800">{r.title ?? r.fileName}</span>
                  <span className="tabular shrink-0 text-slate-500">
                    {r.pages} pages · {new Date(r.savedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
