'use client';

import { CATEGORY_KEYS } from '@app/backend';
import { CircleCheck, FileText, History, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { activeRun } from '@/lib/active-run';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { readErrorMessage, validatePdfFile } from '@/lib/pdf/validate';
import { estimateMinutes, prepareFile, type Health, type Prepared } from '@/lib/run-extraction';
import { session } from '@/lib/session';
import { listRecent, type RecentEntry } from '@/lib/store';
import { Processing } from './processing';

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
  | { kind: 'confirm'; prepared: Prepared & { doc: NonNullable<Prepared['doc']> } };

const BIG_DOC_PAGES = 100;
const NO_HEALTH: Health = { provider: null, model: null, limits: { maxPages: 800 } };

export function Home({ samples }: { samples: SampleCard[] }) {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  // The run lives outside this page, so leaving and coming back finds it still going.
  const run = useSyncExternalStore(activeRun.subscribe, activeRun.get, () => null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(NO_HEALTH));
    listRecent().then(setRecent);
    return () => {
      mounted.current = false;
    };
  }, []);

  const live = Boolean(health?.provider);

  async function onFile(file: File) {
    setError(null);
    activeRun.dismiss();
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
      setPhase({ kind: 'idle' });
      await start({ ...prepared, doc });
    } catch (e) {
      setPhase({ kind: 'idle' });
      setError(readErrorMessage(e));
    }
  }

  async function start(prepared: Prepared & { doc: NonNullable<Prepared['doc']> }) {
    setPhase({ kind: 'idle' });
    try {
      await activeRun.start(prepared, health ?? NO_HEALTH);
      // Open the report only if the user is still here; from elsewhere the header says it is ready.
      if (mounted.current) {
        activeRun.dismiss();
        router.push(`/report/${prepared.id}`);
      }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError' && mounted.current) setError('Stopped. Nothing was saved.');
      // A failed run stays in activeRun, and its reason shows under the dropzone.
    }
  }

  const shownError = error ?? (run?.status === 'failed' ? run.error : null);

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

      {run?.status === 'done' && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-positive-100 bg-positive-50 px-3.5 py-2.5 text-[13px] text-positive-700" role="status">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{run.fileName}</span> is ready.
          </span>
          <Link href={`/report/${run.id}`} onClick={() => activeRun.dismiss()} className={buttonClass('secondary', 'sm')}>
            Open report
          </Link>
        </div>
      )}

      {run?.status === 'running' ? (
        <Processing fileName={run.fileName} pages={run.pages} startedAt={run.startedAt} state={run.state} onStop={() => activeRun.stop()} />
      ) : phase.kind === 'confirm' ? (
        <section className="rounded-panel border border-slate-200 bg-white p-5" aria-labelledby="confirm-title">
          <h2 id="confirm-title" className="text-[15px] font-semibold text-slate-900">
            {phase.prepared.fileName}
          </h2>
          <p className="mt-1 text-[14px] text-slate-600">
            {phase.prepared.doc.numPages} pages · about {estimateMinutes(phase.prepared.doc.numPages)} min. Keep this tab open while it runs.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start(phase.prepared)}>
              Start extraction
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
              Choose another file
            </Button>
          </div>
        </section>
      ) : (
        <>
          <Dropzone onFile={onFile} disabled={!live || phase.kind === 'opening'} error={shownError} />
          {phase.kind === 'opening' && (
            <p role="status" className="mt-2 flex items-center gap-2 text-[13px] text-slate-600">
              <Loader2 className="size-4 text-primary-600 motion-safe:animate-spin" aria-hidden />
              Opening {phase.fileName}…
            </p>
          )}
        </>
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
