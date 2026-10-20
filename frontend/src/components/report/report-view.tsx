'use client';

import { CATEGORY_KEYS, normalizeForMatch, overviewSentence, type AnyItem, type CategoryKey, type ExtractionResult } from '@app/backend';
import { ArrowLeft, Download, FileJson, FileSpreadsheet, MapPin, Printer, Search, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Popover, Tabs } from 'radix-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SampleCard } from '@/components/home/home';
import { buttonClass } from '@/components/ui/button';
import samples from '@/data/samples.json';
import { InfoHint } from '@/components/ui/info-hint';
import { PopoverSelect } from '@/components/ui/popover-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';
import { download, fileStem, toCsv, toJson } from '@/lib/export';
import { openPdf } from '@/lib/pdf/browser-reader';
import { session } from '@/lib/session';
import { loadResult } from '@/lib/store';
import { CategoryTab, matchesSearch } from './category-tab';
import { BmpAmounts, BmpCosts, CategoryCounts, Timeline } from './charts';
import { EvidenceSheet } from './evidence-sheet';
import { PrintReport } from './print-report';
import { QualityTab } from './quality-tab';

type Tab = 'overview' | CategoryKey | 'quality';
const TABS: Tab[] = ['overview', ...CATEGORY_KEYS, 'quality'];

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; result: ExtractionResult; sample: SampleCard | null };

async function load(id: string): Promise<Loaded> {
  if (id.startsWith('sample-')) {
    const slug = id.slice('sample-'.length);
    const meta = (samples as SampleCard[]).find((s) => s.slug === slug) ?? null;
    const res = meta ? await fetch(`/samples/${slug}.json`) : null;
    if (!res?.ok) return { status: 'missing' };
    return { status: 'ready', result: await res.json(), sample: meta };
  }
  const result = session.result(id) ?? (await loadResult(id));
  return result ? { status: 'ready', result, sample: null } : { status: 'missing' };
}

export function ReportView({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('all');
  const [evidence, setEvidence] = useState<{ item: AnyItem; category: CategoryKey } | null>(null);
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;

  useEffect(() => {
    load(id).then(setState).catch(() => setState({ status: 'missing' }));
  }, [id]);

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const sample = state.status === 'ready' ? state.sample : null;
  const getDoc = useCallback(async (): Promise<PDFDocumentProxy | null> => {
    const cached = session.doc(id);
    if (cached) return cached;
    if (!sample?.pdf) return null;
    const data = new Uint8Array(await (await fetch(sample.pdf)).arrayBuffer());
    const doc = await openPdf(data);
    session.setDoc(id, doc);
    return doc;
  }, [id, sample]);

  const result = state.status === 'ready' ? state.result : null;
  const areaOptions = useMemo(() => {
    if (!result) return [];
    const all = CATEGORY_KEYS.flatMap((k) => result.report[k] as AnyItem[]);
    return result.report.geographicAreas
      .map((a) => {
        const name = normalizeForMatch(a.name);
        const count = all.filter((i) => i.id !== a.id && [i.text, ...i.evidence.map((e) => e.quote)].some((s) => normalizeForMatch(s).includes(name))).length;
        return { value: a.id, label: a.name, count, hint: a.role === 'primary' ? 'Covered by the plan' : 'Mentioned' };
      })
      .filter((o) => o.count > 0);
  }, [result]);

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-2/3 max-w-lg" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-[17px] font-semibold text-slate-900">This report is not in this browser</p>
        <p className="mt-1 text-[14px] text-slate-600">Results are saved only in the browser that ran the extraction.</p>
        <Link href="/" className={buttonClass('primary', 'md', 'mt-4')}>
          Extract a PDF
        </Link>
      </div>
    );
  }

  const { report, document: doc, quality } = state.result;
  const selectedArea = report.geographicAreas.find((a) => a.id === area);
  const inArea = (i: AnyItem) => {
    if (!selectedArea) return true;
    const name = normalizeForMatch(selectedArea.name);
    return i.id === selectedArea.id || [i.text, ...i.evidence.map((e) => e.quote)].some((s) => normalizeForMatch(s).includes(name));
  };
  const itemsOf = (k: CategoryKey) => (report[k] as AnyItem[]).filter(inArea);
  const count = (k: CategoryKey) => itemsOf(k).filter((i) => matchesSearch(i, search)).length;
  const completion = quality.completionBasis.startsWith('No ') ? 'Not reported' : `${Math.round(report.summary.completionRate * 100)}%`;
  const csvTab = tab !== 'overview' && tab !== 'quality' ? tab : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <div className="no-print">
        {/* Header row: title on the left, search, area, export and New file on the right. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link href="/" aria-label="Back to start" className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="line-clamp-2 text-[20px] font-semibold leading-tight tracking-tight text-slate-900 sm:truncate">{doc.title ?? doc.fileName}</h1>
              <p className="text-[12px] text-slate-500">
                {[doc.year, `${doc.pages} pages`, sample ? 'Sample' : null, `${Math.round(quality.verifiedRate * 100)}% of proposed items passed the checks`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative w-full sm:w-56">
              <span className="sr-only">Search items</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items and quotes"
                className="h-8 w-full rounded-control border border-slate-300 bg-white pl-8 pr-7 text-[16px] text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700">
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </label>
            {areaOptions.length >= 2 && (
              <PopoverSelect
                label="Area"
                icon={<MapPin className="size-3.5 text-slate-400" aria-hidden />}
                value={area}
                onChange={setArea}
                align="end"
                options={[{ value: 'all', label: 'All areas', count: undefined }, ...areaOptions]}
              />
            )}
            <ExportMenu result={state.result} csvTab={csvTab} />
            <Link href="/" className={buttonClass('primary', 'md')}>
              New file
            </Link>
          </div>
        </div>

        {quality.failedUnits.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-panel border border-warning-100 bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-700" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {quality.failedUnits.length} section{quality.failedUnits.length > 1 ? 's' : ''} could not be extracted (pages{' '}
            {quality.failedUnits.map((f) => f.pages[0]).join(', ')}). The rest of the report is complete; details are under Quality.
          </p>
        )}

        <Tabs.Root value={tab} onValueChange={setTab} className="mt-4">
          <Tabs.List aria-label="Report sections" className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const label = t === 'overview' ? 'Overview' : t === 'quality' ? 'Quality' : CATEGORY_UI[t].label;
              return (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  className="relative -mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600 data-[state=active]:border-primary-600 data-[state=active]:text-slate-900"
                >
                  {t !== 'overview' && t !== 'quality' && <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[t].color }} />}
                  {label}
                  {t !== 'overview' && t !== 'quality' && <span className="tabular rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{count(t)}</span>}
                  {t === 'quality' && quality.rejected.length > 0 && <span className="tabular rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{quality.rejected.length}</span>}
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          <Tabs.Content value="overview" className="mt-4 space-y-4 focus-visible:outline-none">
            <p className="max-w-3xl text-[14px] text-slate-700">{overviewSentence(report, doc.title)}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Goals" accent={CATEGORY_UI.goals.color} value={report.summary.totalGoals} sub="main goals" />
              <StatTile label="BMPs" accent={CATEGORY_UI.bmps.color} value={report.summary.totalBMPs} sub="distinct practices" />
              <StatTile
                label="Completion"
                value={completion}
                sub={
                  <span className="inline-flex items-center gap-1">
                    {completion === 'Not reported' ? 'plans state no status' : quality.completionBasis}
                    <InfoHint label="How completion is counted">
                      Activities the document reports as completed, divided by all implementation activities. Counted from the document, never estimated.
                    </InfoHint>
                  </span>
                }
              />
              <StatTile label="Activities" accent={CATEGORY_UI.implementation.color} value={report.implementation.length} />
              <StatTile label="Monitoring" accent={CATEGORY_UI.monitoring.color} value={report.monitoring.length} sub="parameters and checks" />
              <StatTile label="Outreach" accent={CATEGORY_UI.outreach.color} value={report.outreach.length} />
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <CategoryCounts report={report} />
              <BmpAmounts bmps={report.bmps} />
              <BmpCosts bmps={report.bmps} />
              <Timeline activities={report.implementation} />
            </div>
          </Tabs.Content>

          {CATEGORY_KEYS.map((k) => (
            <Tabs.Content key={k} value={k} className="mt-4 focus-visible:outline-none">
              <CategoryTab
                category={k}
                items={itemsOf(k)}
                total={(report[k] as AnyItem[]).length}
                areaActive={Boolean(selectedArea)}
                search={search}
                onClearFilters={() => {
                  setSearch('');
                  setArea('all');
                }}
                onEvidence={(item) => setEvidence({ item, category: k })}
              />
            </Tabs.Content>
          ))}

          <Tabs.Content value="quality" className="mt-4 focus-visible:outline-none">
            <QualityTab result={state.result} />
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <EvidenceSheet
        item={evidence?.item ?? null}
        categoryLabel={evidence ? CATEGORY_UI[evidence.category].label : ''}
        onClose={() => setEvidence(null)}
        getDoc={getDoc}
        sourceUrl={sample?.sourceUrl}
      />
      <PrintReport result={state.result} />
    </div>
  );
}

function ExportMenu({ result, csvTab }: { result: ExtractionResult; csvTab: CategoryKey | null }) {
  const [open, setOpen] = useState(false);
  const stem = fileStem(result);
  const item = 'flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent';
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={buttonClass('secondary', 'md')}>
        <Download className="size-3.5" aria-hidden />
        Export
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} className="z-50 w-64 rounded-panel border border-slate-200 bg-white p-1 shadow-overlay">
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Download</p>
          <button type="button" className={item} onClick={() => (download(`${stem}.json`, toJson(result), 'application/json'), setOpen(false))}>
            <FileJson className="size-4 text-slate-500" aria-hidden />
            Full report (JSON)
          </button>
          <button
            type="button"
            className={item}
            disabled={!csvTab}
            onClick={() => csvTab && (download(`${stem}-${csvTab}.csv`, toCsv(csvTab, result.report[csvTab] as AnyItem[]), 'text/csv'), setOpen(false))}
          >
            <FileSpreadsheet className="size-4 text-slate-500" aria-hidden />
            <span>
              {csvTab ? `${CATEGORY_UI[csvTab].label} (CSV)` : 'This tab (CSV)'}
              {!csvTab && <span className="block text-[12px] text-slate-400">Open a category tab first</span>}
            </span>
          </button>
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Print</p>
          <button type="button" className={cn(item)} onClick={() => (setOpen(false), setTimeout(() => window.print(), 50))}>
            <Printer className="size-4 text-slate-500" aria-hidden />
            Print or save as PDF
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
