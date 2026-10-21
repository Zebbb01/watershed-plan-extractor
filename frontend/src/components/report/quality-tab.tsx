'use client';

import type { ExtractionResult, Rejection, StructureLine } from '@app/backend';
import { ChevronDown, ChevronRight, CircleX, FileX, GitCompareArrows, ScanText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { SearchField } from '@/components/ui/search-field';
import { StatTile } from '@/components/ui/stat-tile';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';

const REASON: Record<Rejection['reason'], string> = {
  'quote-not-found': 'Quote is not on the page',
  'name-not-in-source': 'Name is not in the document',
  'number-not-in-quote': 'Amount is not written this way',
  'detail-not-in-source': 'Detail is not in the document',
  invalid: 'No evidence given',
};
const ERROR: Record<string, string> = {
  TIMEOUT: 'took too long, even split to one page',
  OUTPUT_TRUNCATED: 'answer was cut off, even for one page',
  UPSTREAM_ERROR: 'the AI service failed twice',
  RATE_LIMITED: 'the AI service stayed busy',
  NO_PROVIDER: 'no AI provider is configured',
};
const KIND_TAG: Record<StructureLine['kind'], string> = {
  heading: 'Heading',
  bullet: 'Bullet',
  numbered: 'Numbered',
  para: 'Text',
  table: 'Table row',
  aside: 'Caption',
  admin: 'Skipped',
};

function Section({ title, count, actions, children }: { title: string; count?: number; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
        <h2 className="mr-auto text-[14px] font-semibold text-slate-900">{title}</h2>
        {actions}
        {count !== undefined && <span className="tabular text-[12px] font-medium text-slate-500">{count}</span>}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** What the checks removed, what could not be read, how the run went, and the page structure. */
export function QualityTab({ result }: { result: ExtractionResult }) {
  const q = result.quality;
  const byPage = useMemo(() => {
    const m = new Map<number, StructureLine[]>();
    for (const l of q.structure) m.set(l.page, [...(m.get(l.page) ?? []), l]);
    return [...m.entries()];
  }, [q.structure]);
  const seconds = Math.round(q.durationMs / 1000);
  const [showStructure, setShowStructure] = useState(false);
  const [find, setFind] = useState('');
  const term = find.trim().toLowerCase();
  const rejected = term
    ? q.rejected.filter((r) => [r.name, CATEGORY_UI[r.category].label, REASON[r.reason], `p. ${r.page ?? ''}`].some((s) => s.toLowerCase().includes(term)))
    : q.rejected;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Passed the checks" icon={ShieldCheck} accent="#0f8a4b" value={`${Math.round(q.verifiedRate * 100)}%`} sub="of items the model proposed" />
        <StatTile label="Rejected" icon={CircleX} value={q.rejected.length} sub="not shown as data" />
        <StatTile label="Conflicts" icon={GitCompareArrows} accent={q.conflicts.length ? '#b25e09' : undefined} value={q.conflicts.length} sub="flagged for review" />
        <StatTile label="Scanned pages read" icon={ScanText} accent="#1d63b5" value={q.ocrPages.length} />
        <StatTile label="Pages skipped" icon={FileX} value={q.skippedPages.length} />
        <StatTile label="Sections failed" icon={TriangleAlert} accent={q.failedUnits.length ? '#d92d20' : undefined} value={q.failedUnits.length} />
      </div>

      {q.failedUnits.length > 0 && (
        <Section title="Sections that could not be extracted" count={q.failedUnits.length}>
          <ul className="space-y-1 text-[13px] text-slate-700">
            {q.failedUnits.map((f) => (
              <li key={f.index}>
                Pages {f.pages[0]}
                {f.pages.length > 1 ? `–${f.pages[f.pages.length - 1]}` : ''}: {ERROR[f.error] ?? f.error}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Rejected by the checks"
        count={term ? undefined : q.rejected.length}
        actions={
          q.rejected.length > 0 && (
            <>
              <SearchField value={find} onChange={setFind} placeholder="Search rejected items" label="Search rejected items" className="w-full sm:w-60" />
              {term && (
                <span className="tabular text-[12px] font-medium text-slate-500">
                  {rejected.length} of {q.rejected.length}
                </span>
              )}
            </>
          )
        }
      >
        {q.rejected.length === 0 ? (
          <p className="text-[13px] text-slate-500">Every item the model proposed was found in the document.</p>
        ) : rejected.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-slate-500">
            No rejected item matches “{find}”.{' '}
            <button type="button" onClick={() => setFind('')} className="font-medium text-primary-700 hover:underline">
              Clear search
            </button>
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-dense">
              <thead>
                <tr className="whitespace-nowrap border-b border-slate-200 text-left text-[12px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3 font-semibold">Category</th>
                  <th className="py-1.5 pr-3 font-semibold">Proposed name</th>
                  <th className="py-1.5 pr-3 font-semibold">Page</th>
                  <th className="py-1.5 font-semibold">Why it was removed</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{CATEGORY_UI[r.category].label}</td>
                    <td className="py-1.5 pr-3 text-slate-800">{r.name}</td>
                    <td className="tabular py-1.5 pr-3 text-slate-600">{r.page ?? '—'}</td>
                    <td className="whitespace-nowrap py-1.5 text-slate-600">{REASON[r.reason]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {q.conflicts.length > 0 && (
        <Section title="Different values for the same item" count={q.conflicts.length}>
          <ul className="space-y-1.5 text-[13px] text-slate-700">
            {q.conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-medium text-slate-900">{c.name}</span>: {c.values.map((v) => `${v.raw} (p. ${v.page})`).join(' vs ')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Pages skipped" count={q.skippedPages.length}>
          {q.skippedPages.length === 0 ? (
            <p className="text-[13px] text-slate-500">Every page was read.</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[13px] text-slate-700">
              {q.skippedPages.map((s) => (
                <li key={s.page}>
                  <span className="tabular mr-2 text-slate-500">p. {s.page}</span>
                  {s.reason}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Run details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-slate-500">Model</dt>
            <dd className="text-slate-800">
              {q.model} ({q.provider})
            </dd>
            <dt className="text-slate-500">Time</dt>
            <dd className="tabular text-slate-800">{seconds >= 90 ? `${Math.round(seconds / 60)} min` : `${seconds} s`}</dd>
            <dt className="text-slate-500">Tokens</dt>
            <dd className="tabular text-slate-800">
              {q.usage.inputTokens.toLocaleString()} in · {q.usage.outputTokens.toLocaleString()} out
            </dd>
            {q.usage.costUsd !== null && (
              <>
                <dt className="text-slate-500">Model cost</dt>
                <dd className="tabular text-slate-800">${q.usage.costUsd.toFixed(3)}</dd>
              </>
            )}
            <dt className="text-slate-500">Pages with no items</dt>
            <dd className="text-slate-800">{q.emptyPages.length ? q.emptyPages.join(', ') : 'None'}</dd>
          </dl>
        </Section>
      </div>

      <Section title="Document structure as read" count={byPage.length}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-slate-500">How each page was understood before extraction: headings, list levels, table rows and skipped lines.</p>
          <button type="button" aria-expanded={showStructure} onClick={() => setShowStructure(!showStructure)} className={buttonClass('secondary', 'sm')}>
            <ChevronDown className={cn('size-3.5 transition-transform', showStructure && 'rotate-180')} aria-hidden />
            {showStructure ? 'Hide pages' : `Show ${byPage.length} pages`}
          </button>
        </div>
        {showStructure && (
          <ul className="mt-2 divide-y divide-slate-100">
            {byPage.map(([page, lines]) => (
              <li key={page}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 text-[13px] text-slate-700 hover:text-slate-900">
                    <ChevronRight className="size-3.5 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
                    Page {page}
                    <span className="text-slate-400">· {lines.length} lines</span>
                  </summary>
                  <ol className="mb-2 ml-5 max-h-80 space-y-0.5 overflow-y-auto text-[12px]">
                    {lines.map((l, i) => (
                      <li key={i} className={cn('flex gap-2', l.kind === 'admin' && 'text-slate-400 line-through')}>
                        <span className="w-20 shrink-0 text-slate-400">{KIND_TAG[l.kind]}</span>
                        <span className={cn('min-w-0', l.kind === 'heading' && 'font-semibold text-slate-900')} style={{ paddingLeft: l.level ? (l.level - 1) * 12 : 0 }}>
                          {l.text}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
