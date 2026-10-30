'use client';

import type { CategoryKey } from '@app/backend';
import { ArrowRight, ChartColumnBig, ChevronRight, CircleCheck, FileText, History, ShieldCheck, TriangleAlert, Upload, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { Dropzone } from '@/components/ui/dropzone';
import { Shapes } from '@/components/ui/shapes';
import { activeRun } from '@/lib/active-run';
import { pendingFile } from '@/lib/pending-file';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { readErrorMessage, validatePdfFile } from '@/lib/pdf/validate';
import { estimateMinutes, fetchHealth, prepareFile, type Health, type Prepared } from '@/lib/run-extraction';
import { session } from '@/lib/session';
import { listRecent, savePdf, type RecentEntry } from '@/lib/store';
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
  /** not used to tune the prompts or rules */
  heldOut?: boolean;
  /** items per category in the sample's result */
  counts?: Partial<Record<CategoryKey, number>>;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'opening'; fileName: string }
  | { kind: 'confirm'; prepared: Prepared & { doc: NonNullable<Prepared['doc']> } };

const BIG_DOC_PAGES = 100;

export function Home({ samples }: { samples: SampleCard[] }) {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  // The run lives outside this page, so leaving and coming back finds it still going.
  const run = useSyncExternalStore(activeRun.subscribe, activeRun.get, () => null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    fetchHealth().then(setHealth);
    listRecent().then(setRecent);
    return () => {
      mounted.current = false;
    };
  }, []);

  const live = Boolean(health?.provider);

  // A PDF picked with an Upload button elsewhere (header, report) runs here, with the latest onFile.
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });
  useEffect(() => {
    const runPicked = () => {
      const file = pendingFile.take();
      if (file) void onFileRef.current(file);
    };
    runPicked();
    return pendingFile.subscribe(runPicked);
  }, []);

  async function onFile(file: File) {
    setError(null);
    setNotice(null);
    activeRun.dismiss();
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const check = validatePdfFile({ name: file.name, size: file.size, head });
    if (!check.ok) return setError(check.reason);
    setPhase({ kind: 'opening', fileName: file.name });
    try {
      const prepared = await prepareFile(file);
      void savePdf(prepared.id, file); // kept in this browser, so the report can re-run or show it later
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
      // A file picked from the header can arrive before this page has asked the server.
      await activeRun.start(prepared, health ?? (await fetchHealth()));
      // Open the report only if the user is still here; from elsewhere the header says it is ready.
      if (mounted.current) {
        activeRun.dismiss();
        router.push(`/report/${prepared.id}`);
      }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError' && mounted.current) setNotice('Stopped. Nothing was saved.');
      // A failed run stays in activeRun, and its reason shows under the dropzone.
    }
  }

  const shownError = error ?? (run?.status === 'failed' ? run.error : null);

  return (
    <>
      <section className="relative overflow-hidden border-b border-primary-100/80 bg-primary-50/70">
        <Shapes />
        <div className="relative mx-auto grid max-w-6xl gap-x-12 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_1.08fr] lg:py-12">
          <div className="lg:self-end">
            <Badge tone="primary" className="h-6 bg-white px-2 ring-1 ring-primary-100">
              PDF in, verified data out
            </Badge>
            <h1 className="mt-3 text-[clamp(1.85rem,min(3.3vw,6.3vh),2.8rem)] font-semibold leading-[1.1] tracking-tight text-slate-900">
              Turn a watershed plan into data you can check
            </h1>
            <p className="mt-3 max-w-lg text-[15px] text-slate-600">
              Goals, BMPs, activities, monitoring, outreach and areas, each linked to the page and words it came from.
            </p>
          </div>

          <div id="upload" className="scroll-mt-24 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            {health && !live && (
              <p className="flex items-start gap-2.5 rounded-panel bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-700 ring-1 ring-warning-100" role="status">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Live extraction is off on this server because no AI key is set. The samples below still work.
              </p>
            )}
            {run?.status === 'done' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel bg-positive-50 px-3.5 py-2.5 text-[13px] text-positive-700 ring-1 ring-positive-100" role="status">
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
              <section className={`${cardClass} p-5`} aria-labelledby="confirm-title">
                <span className="grid size-10 place-items-center rounded-full bg-primary-50 text-primary-600">
                  <FileText className="size-5" aria-hidden />
                </span>
                <h2 id="confirm-title" className="mt-3 break-words text-[16px] font-semibold text-slate-900">
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
              <Dropzone onFile={onFile} disabled={health !== null && !live} error={shownError} notice={notice} busy={phase.kind === 'opening' ? phase.fileName : null} />
            )}
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <ol className="grid gap-2.5 sm:grid-cols-3" aria-label="How it works">
              <HowStep n={1} icon={Upload} title="Upload a PDF" line="Text or scanned" />
              <HowStep n={2} icon={ShieldCheck} title="Extract and check" line="Each item tied to its page" />
              <HowStep n={3} icon={ChartColumnBig} title="Explore and export" line="Charts, PDF view, CSV" />
            </ol>
            <p className="mt-5 flex items-center gap-1.5 text-[12px] text-slate-500">
              <ShieldCheck className="size-3.5 shrink-0 text-positive-600" aria-hidden />
              Your PDF stays in this browser. Nothing is stored on the server.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {samples.length > 0 && (
          <section id="samples" className="scroll-mt-20" aria-labelledby="samples-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="samples-title" className="text-[18px] font-semibold tracking-tight text-slate-900">
                  Try a sample
                </h2>
                <p className="text-[13px] text-slate-500">Real MDEQ plans, already extracted. They open instantly.</p>
              </div>
              <Link href="/accuracy" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 hover:underline">
                How accurate is it?
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {samples.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/report/sample-${s.slug}`}
                    className={`group flex h-full flex-col p-4 transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${cardClass}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="grid size-9 place-items-center rounded-full bg-primary-50 text-primary-600">
                        <FileText className="size-4" aria-hidden />
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {s.heldOut && <Badge tone="primary">Not used for tuning</Badge>}
                        <Badge tone="neutral">{s.format}</Badge>
                      </span>
                    </span>
                    <span className="mt-3 text-[14px] font-semibold leading-snug text-slate-900 group-hover:text-primary-700">{s.title}</span>
                    <span className="mt-1 text-[12px] text-slate-500">
                      {s.year} · {s.pages} pages
                    </span>
                    {s.counts && (
                      <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-600">
                        {(['goals', 'bmps', 'implementation'] as const).map((k) => (
                          <span key={k} className="inline-flex items-center gap-1.5">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[k].color }} />
                            {countLabel(k, s.counts?.[k] ?? 0)}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-semibold text-primary-700">
                      Open report
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section className="mt-10" aria-labelledby="recent-title">
            <h2 id="recent-title" className="flex items-center gap-1.5 text-[18px] font-semibold tracking-tight text-slate-900">
              <History className="size-4 text-slate-400" aria-hidden />
              Recent in this browser
            </h2>
            <ul className={`mt-4 divide-y divide-slate-100 overflow-hidden ${cardClass}`}>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/report/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600"
                  >
                    <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.title ?? r.fileName}</span>
                    <span className="tabular shrink-0 text-slate-500">
                      {r.pages} pages · {new Date(r.savedAt).toLocaleDateString()}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

const COUNT_NOUN = { goals: ['goal', 'goals'], bmps: ['BMP', 'BMPs'], implementation: ['activity', 'activities'] } as const;
const countLabel = (k: keyof typeof COUNT_NOUN, n: number) => `${n} ${COUNT_NOUN[k][n === 1 ? 0 : 1]}`;

function HowStep({ n, icon: Icon, title, line }: { n: number; icon: LucideIcon; title: string; line: string }) {
  return (
    <li className="flex flex-col gap-2.5 rounded-panel bg-white/80 p-3 ring-1 ring-primary-100 max-sm:flex-row max-sm:items-center">
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary-600 text-white">
        <Icon className="size-4" aria-hidden />
        <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-white text-[10px] font-bold text-primary-700 ring-1 ring-primary-200">
          {n}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
        <span className="block text-[12px] leading-snug text-slate-500">{line}</span>
      </span>
    </li>
  );
}
