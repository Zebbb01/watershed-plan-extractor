'use client';

import { CATEGORY_KEYS, computeSummary, normalizeForMatch, overviewSentence, type AnyItem, type CategoryKey, type ExtractedReport, type ExtractionResult } from '@app/backend';
import { ArrowLeft, ArrowRight, Columns2, Download, FileJson, FileSpreadsheet, ListChecks, MapPin, Printer, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Popover, Tabs } from 'radix-ui';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SampleCard } from '@/components/home/home';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import samples from '@/data/samples.json';
import { useMediaQuery } from '@/hooks/use-media-query';
import { InfoHint } from '@/components/ui/info-hint';
import { PopoverSelect } from '@/components/ui/popover-select';
import { StatTile } from '@/components/ui/stat-tile';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';
import { download, fileStem, toCsv, toJson } from '@/lib/export';
import { openPdf } from '@/lib/pdf/browser-reader';
import { session } from '@/lib/session';
import { loadResult } from '@/lib/store';
import { CategoryTab, matchesSearch } from './category-tab';
import { ActivityStatus, BmpAmounts, BmpCosts, CategoryCounts, Timeline } from './charts';
import { EvidenceSheet } from './evidence-sheet';
import { PdfPane, type Focus } from './pdf-pane';
import { PrintReport } from './print-report';
import { ReportSkeleton } from './report-skeleton';
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
  const [focus, setFocus] = useState<Focus | null>(null);
  // The PDF sits beside the results only where there is room for both.
  const wide = useMediaQuery('(min-width: 1024px)');
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;
  const compare = wide && params.get('view') === 'compare';

  useEffect(() => {
    load(id).then(setState).catch(() => setState({ status: 'missing' }));
  }, [id]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };
  const setTab = (t: string) => setParam('tab', t === 'overview' ? null : t);

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
    const all = CATEGORY_KEYS.filter((k) => k !== 'geographicAreas').flatMap((k) => result.report[k] as AnyItem[]);
    return result.report.geographicAreas
      .map((a) => {
        const name = normalizeForMatch(a.name);
        const count = all.filter((i) => [i.text, ...i.evidence.map((e) => e.quote)].some((s) => normalizeForMatch(s).includes(name))).length;
        return { value: a.id, label: a.name, count, hint: a.role === 'primary' ? 'Covered by the plan' : 'Mentioned' };
      })
      .filter((o) => o.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [result]);
  const allItems = useMemo(
    () => (result ? CATEGORY_KEYS.flatMap((category) => (result.report[category] as AnyItem[]).map((item) => ({ item, category }))) : []),
    [result],
  );

  if (state.status === 'loading') return <ReportSkeleton />;
  if (state.status === 'missing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-50 text-primary-600">
          <Search className="size-5" aria-hidden />
        </span>
        <p className="mt-4 text-[18px] font-semibold text-slate-900">This report is not in this browser</p>
        <p className="mt-1 text-[14px] text-slate-600">Results are saved only in the browser that ran the extraction.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/#upload" className={buttonClass('primary', 'md')}>
            Extract a PDF
          </Link>
          <Link href="/#samples" className={buttonClass('secondary', 'md')}>
            Open a sample
          </Link>
        </div>
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
  // The overview follows the same area and search filters as the tabs.
  const filtering = Boolean(selectedArea) || Boolean(search);
  const shown = filtering
    ? (Object.fromEntries(CATEGORY_KEYS.map((k) => [k, itemsOf(k).filter((i) => matchesSearch(i, search))])) as Omit<ExtractedReport, 'summary'>)
    : report;
  const { summary, completionBasis } = filtering ? computeSummary(shown) : { summary: report.summary, completionBasis: quality.completionBasis };
  const view: ExtractedReport = { ...shown, summary };
  const completion = completionBasis.startsWith('No ') ? 'Not reported' : `${Math.round(summary.completionRate * 100)}%`;
  const clearFilters = () => {
    setSearch('');
    setArea('all');
  };
  const csvTab = tab !== 'overview' && tab !== 'quality' ? tab : null;
  const verified = Math.round(quality.verifiedRate * 100);
  const showEvidence = (item: AnyItem, category: CategoryKey) =>
    compare ? setFocus({ item, page: item.evidence[0]?.page ?? 1 }) : setEvidence({ item, category });
  const tile = (k: CategoryKey) => ({ accent: CATEGORY_UI[k].color, icon: CATEGORY_UI[k].icon, onClick: () => setTab(k) });

  return (
    <Tabs.Root value={tab} onValueChange={setTab}>
      <div className="no-print border-b border-slate-200 bg-white">
        <div className={cn('mx-auto px-4 pt-5 sm:px-6', compare ? 'max-w-[1600px]' : 'max-w-7xl')}>
          {/* Header row: title on the left; search, area, compare, export and New file on the right. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link href="/" aria-label="Back to start" className={buttonClass('ghost', 'sm', 'size-8 px-0')}>
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
              <div className="min-w-0">
                <h1 className="line-clamp-2 text-[20px] font-semibold leading-tight tracking-tight text-slate-900 sm:truncate">{doc.title ?? doc.fileName}</h1>
                <p className="text-[12px] text-slate-500">{[doc.year, `${doc.pages} pages`, sample ? 'Sample' : null].filter(Boolean).join(' · ')}</p>
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
              {wide && (
                <button
                  type="button"
                  aria-pressed={compare}
                  onClick={() => setParam('view', compare ? null : 'compare')}
                  className={buttonClass(compare ? 'selected' : 'secondary', 'md')}
                >
                  <Columns2 className="size-3.5" aria-hidden />
                  Compare with PDF
                </button>
              )}
              <ExportMenu result={state.result} csvTab={csvTab} />
              <Link href="/#upload" className={buttonClass('primary', 'md')}>
                New file
              </Link>
            </div>
          </div>

          {quality.failedUnits.length > 0 &&
            (CATEGORY_KEYS.every((k) => report[k].length === 0) ? (
              // Nothing came back at all: say so plainly, not "the rest is complete".
              <p className="mt-4 flex items-start gap-2 rounded-panel bg-negative-50 px-3.5 py-2.5 text-[13px] text-negative-700 ring-1 ring-negative-100" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                No section could be extracted: the AI service did not answer. Drop the file again on the home page to retry; details are under Quality.
              </p>
            ) : (
              <p className="mt-4 flex items-start gap-2 rounded-panel bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-700 ring-1 ring-warning-100" role="status">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {quality.failedUnits.length} section{quality.failedUnits.length > 1 ? 's' : ''} could not be extracted (pages{' '}
                {quality.failedUnits
                  .map((f) => f.pages[0])
                  .sort((a, b) => a - b)
                  .join(', ')}
                ). Everything else is shown; drop the file again to retry them.
              </p>
            ))}

          <Tabs.List aria-label="Report sections" className="-mx-4 mt-3 flex gap-1 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const label = t === 'overview' ? 'Overview' : t === 'quality' ? 'Quality' : CATEGORY_UI[t].label;
              return (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  className="relative flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600 data-[state=active]:border-primary-600 data-[state=active]:text-slate-900"
                >
                  {t !== 'overview' && t !== 'quality' && <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[t].color }} />}
                  {label}
                  {t !== 'overview' && t !== 'quality' && <span className="tabular rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{count(t)}</span>}
                  {t === 'quality' && quality.rejected.length > 0 && <span className="tabular rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{quality.rejected.length}</span>}
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
          {filtering && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2.5 text-[12px]" role="status">
              <span className="font-medium text-slate-500">Showing only items that match:</span>
              {selectedArea && (
                <FilterChip label={selectedArea.name} icon={<MapPin className="size-3" aria-hidden />} onRemove={() => setArea('all')} />
              )}
              {search && <FilterChip label={`“${search}”`} icon={<Search className="size-3" aria-hidden />} onRemove={() => setSearch('')} />}
              <button type="button" onClick={clearFilters} className={buttonClass('link', 'sm', 'px-1')}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={cn('no-print mx-auto px-4 py-5 sm:px-6', compare ? 'max-w-[1600px]' : 'max-w-7xl')}>
        <div className={cn(compare && 'grid grid-cols-[minmax(0,1fr)_minmax(380px,42%)] items-start gap-5')}>
          <div className="@container min-w-0">
            <Tabs.Content value="overview" className="space-y-4 focus-visible:outline-none">
              <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
                <section className={cn(cardClass, 'p-5')} aria-label="Summary">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{filtering ? 'Summary of the whole plan' : 'Summary'}</h2>
                  <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-700">{overviewSentence(report, doc.title)}</p>
                  {areaOptions.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[12px] font-medium text-slate-500">Filter by area</span>
                      {areaOptions.slice(0, 6).map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={area === o.value}
                          onClick={() => setArea(area === o.value ? 'all' : o.value)}
                          className={cn(
                            'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-primary-600',
                            area === o.value ? 'bg-primary-600 text-white ring-primary-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                          )}
                        >
                          <MapPin className="size-3" aria-hidden />
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section className={cn(cardClass, 'flex flex-col p-5')} aria-label="Checks">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                    <ShieldCheck className="size-3.5 text-positive-600" aria-hidden />
                    Checked against the PDF
                  </h2>
                  <p className="mt-2 text-[28px] font-semibold leading-none text-slate-900">{verified}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-positive-600" style={{ width: `${verified}%` }} />
                  </div>
                  <p className="mt-2 text-[12px] text-slate-500">
                    of proposed items passed · {quality.rejected.length} rejected · {quality.conflicts.length} conflicts
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <button type="button" onClick={() => setTab('quality')} className={buttonClass('secondary', 'sm')}>
                      <ListChecks className="size-3.5" aria-hidden />
                      See what was rejected
                    </button>
                    {wide && !compare && (
                      <button type="button" onClick={() => setParam('view', 'compare')} className={buttonClass('link', 'sm')}>
                        Compare with PDF
                        <ArrowRight className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @5xl:grid-cols-6">
                <StatTile label="Goals" value={view.summary.totalGoals} sub="main goals" {...tile('goals')} />
                <StatTile label="BMPs" value={view.summary.totalBMPs} sub="distinct practices" {...tile('bmps')} />
                <StatTile
                  label="Completion"
                  icon={ListChecks}
                  accent="#0f8a4b"
                  value={completion}
                  sub={
                    <span className="inline-flex items-center gap-1">
                      {completion === 'Not reported' ? 'plan states no status' : completionBasis}
                      <InfoHint label="How completion is counted">
                        Activities the document reports as completed, divided by all implementation activities. Counted from the document, never estimated.
                      </InfoHint>
                    </span>
                  }
                />
                <StatTile label="Activities" value={view.implementation.length} sub="implementation" {...tile('implementation')} />
                <StatTile label="Monitoring" value={view.monitoring.length} sub="parameters and checks" {...tile('monitoring')} />
                <StatTile label="Outreach" value={view.outreach.length} sub="activities" {...tile('outreach')} />
              </div>

              <div className="grid gap-4 @3xl:grid-cols-2">
                <CategoryCounts report={view} onOpen={setTab} />
                <ActivityStatus activities={view.implementation} />
                <BmpAmounts bmps={view.bmps} />
                <BmpCosts bmps={view.bmps} />
                <Timeline activities={view.implementation} className="@3xl:col-span-2" />
              </div>
            </Tabs.Content>

            {CATEGORY_KEYS.map((k) => (
              <Tabs.Content key={k} value={k} className="focus-visible:outline-none">
                <CategoryTab
                  category={k}
                  items={itemsOf(k)}
                  total={(report[k] as AnyItem[]).length}
                  areaActive={Boolean(selectedArea)}
                  search={search}
                  onClearFilters={clearFilters}
                  onEvidence={(item) => showEvidence(item, k)}
                />
              </Tabs.Content>
            ))}

            <Tabs.Content value="quality" className="focus-visible:outline-none">
              <QualityTab result={state.result} />
            </Tabs.Content>
          </div>

          {compare && (
            <aside className="sticky top-[4.5rem]">
              <PdfPane
                docId={id}
                pages={doc.pages}
                getDoc={getDoc}
                focus={focus}
                onFocus={setFocus}
                items={allItems}
                pdfUrl={sample?.pdf}
                sourceUrl={sample && !sample.pdf ? sample.sourceUrl : null}
                onClose={() => setParam('view', null)}
              />
            </aside>
          )}
        </div>
      </div>

      <EvidenceSheet
        item={evidence?.item ?? null}
        categoryLabel={evidence ? CATEGORY_UI[evidence.category].label : ''}
        onClose={() => setEvidence(null)}
        getDoc={getDoc}
        sourceUrl={sample?.sourceUrl}
      />
      <PrintReport result={state.result} />
    </Tabs.Root>
  );
}

function FilterChip({ label, icon, onRemove }: { label: string; icon: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-primary-50 pl-2 pr-1 font-medium text-primary-800 ring-1 ring-primary-200">
      {icon}
      <span className="truncate">{label}</span>
      <button type="button" aria-label={`Remove filter ${label}`} onClick={onRemove} className="grid size-4 place-items-center rounded-full hover:bg-primary-100">
        <X className="size-3" aria-hidden />
      </button>
    </span>
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
