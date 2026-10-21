'use client';

import { CATEGORY_KEYS, categoryByKey, overviewSentence, type AnyItem, type BmpItem, type ExtractionResult } from '@app/backend';
import { Droplets } from 'lucide-react';
import { useEffect } from 'react';
import { CATEGORY_UI } from '@/lib/categories-ui';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The printable report, shown only when printing or saving as PDF: a summary page (what was
 * found, the key figures, how it was checked), then one table per category. Page margins, the
 * footer and page numbers are in globals.css.
 */
export function PrintReport({ result }: { result: ExtractionResult }) {
  const { report, document: doc, quality } = result;
  const title = doc.title ?? doc.fileName.replace(/\.pdf$/i, '');

  // "Save as PDF" names the file after the page title.
  useEffect(() => {
    const before = () => {
      const page = document.title;
      document.title = `${title} - Extraction report`;
      window.addEventListener('afterprint', () => (document.title = page), { once: true });
    };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [title]);

  const sections = CATEGORY_KEYS.map((key) => ({ key, def: categoryByKey(key), items: report[key] as AnyItem[] })).filter((s) => s.items.length);
  const costs = report.bmps.map((b) => b.estimatedCost?.value ?? 0).filter((v) => v > 0);
  const completion = quality.completionBasis.startsWith('No ') ? null : report.summary.completionRate;
  const figures = [
    { label: 'Main goals', value: String(report.summary.totalGoals), color: CATEGORY_UI.goals.color },
    { label: 'Distinct BMPs', value: String(report.summary.totalBMPs), color: CATEGORY_UI.bmps.color },
    { label: 'Implementation activities', value: String(report.implementation.length), color: CATEGORY_UI.implementation.color },
    { label: 'Monitoring metrics', value: String(report.monitoring.length), color: CATEGORY_UI.monitoring.color },
    { label: 'Outreach activities', value: String(report.outreach.length), color: CATEGORY_UI.outreach.color },
    { label: 'Geographic areas', value: String(report.geographicAreas.length), color: CATEGORY_UI.geographicAreas.color },
    {
      label: completion === null ? 'Completion, not reported in the plan' : 'Activities reported completed',
      value: completion === null ? '—' : `${Math.round(completion * 100)}%`,
      color: '#1d63b5',
    },
    {
      label: costs.length ? `Estimated BMP cost, ${plural(costs.length, 'practice')}` : 'Estimated BMP cost, not stated',
      value: costs.length ? usd.format(costs.reduce((s, v) => s + v, 0)) : '—',
      color: '#1d63b5',
    },
  ];

  return (
    <div className="print-only text-slate-900">
      <footer className="print-footer items-center justify-between border-t border-slate-200 pt-1.5 text-[8.5px] text-slate-500">
        <span className="min-w-0 truncate pr-4">{title}</span>
        <span className="shrink-0">Watershed Plan Extractor · every item checked against the source PDF</span>
      </footer>
      <section className="print-cover">
        <header className="flex items-center justify-between border-b-2 border-primary-600 pb-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-[6px] bg-primary-600 text-white">
              <Droplets className="size-4" aria-hidden />
            </span>
            <span className="text-[13px] font-semibold">Watershed Plan Extractor</span>
          </span>
          <span className="text-right text-[10px] leading-snug text-slate-500">
            Extraction report
            <br />
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </header>

        <p className="mt-12 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-700">Watershed plan</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="mt-2 text-[11px] text-slate-500">{[doc.year, plural(doc.pages, 'page'), doc.fileName].filter(Boolean).join('  ·  ')}</p>
        <p className="mt-5 max-w-[160mm] text-[12px] leading-relaxed text-slate-700">{overviewSentence(report, doc.title)}</p>

        <div className="mt-8 grid grid-cols-4 gap-2.5">
          {figures.map((f) => (
            <div key={f.label} className="rounded-[6px] border border-slate-200 px-3 pb-2.5 pt-2" style={{ borderTop: `3px solid ${f.color}` }}>
              <div className="tabular text-[20px] font-semibold tracking-tight">{f.value}</div>
              <div className="mt-0.5 text-[9.5px] leading-snug text-slate-500">{f.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[6px] border border-slate-200 bg-slate-50 px-4 py-3.5">
          <h2 className="text-[12px] font-semibold">How this report was checked</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10.5px] leading-relaxed text-slate-700">
            <li>Every item was checked in code against the source PDF: its quote, names and amounts are on the pages listed with it.</li>
            <li>
              {Math.round(quality.verifiedRate * 100)}% of the items the AI model proposed passed. The {plural(quality.rejected.length, 'item')} that did not
              are left out of this report.
            </li>
            <li>Counts, totals and the completion rate are computed in code, never estimated.</li>
            {quality.ocrPages.length > 0 && <li>{plural(quality.ocrPages.length, 'scanned page')} had no text layer and were read from the page image.</li>}
            {quality.conflicts.length > 0 && <li>{plural(quality.conflicts.length, 'item')} with amounts that differ between pages are marked for review.</li>}
          </ul>
        </div>

        <div className="mt-8">
          <h2 className="border-b border-slate-200 pb-1.5 text-[12px] font-semibold">Contents</h2>
          <ol className="mt-1 text-[11px]">
            {sections.map((s, n) => (
              <li key={s.key} className="flex items-center gap-2 border-b border-dotted border-slate-200 py-1.5">
                <span className="size-2 rounded-full" style={{ background: CATEGORY_UI[s.key].color }} />
                <span className="font-medium">
                  {n + 1}. {s.def.label}
                </span>
                <span className="tabular ml-auto text-slate-500">{plural(s.items.length, 'item')}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {sections.map(({ key, def, items }, n) => {
        // A column no item fills is left out; the first column and Pages always stay.
        const cols = def.columns.filter((c, i) => i === 0 || c.key === 'pages' || items.some((it) => c.get(it) !== null && c.get(it) !== ''));
        const total = key === 'bmps' ? (items as BmpItem[]).reduce((s, b) => s + (b.estimatedCost?.value ?? 0), 0) : 0;
        const costCol = cols.findIndex((c) => c.key === 'estimatedCost');
        return (
          <section key={key} className="print-section">
            <div className="print-keep flex items-baseline gap-2 border-b-2 pb-1.5" style={{ borderColor: CATEGORY_UI[key].color }}>
              <h2 className="text-[15px] font-semibold tracking-tight">
                {n + 1}. {def.label}
              </h2>
              <span className="text-[10.5px] text-slate-500">{plural(items.length, 'item')}</span>
            </div>
            <table className="mt-2 w-full border-collapse text-[10px] leading-snug">
              <thead>
                <tr className="bg-slate-100">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap px-2 py-1.5 text-[8.5px] font-semibold uppercase tracking-wider text-slate-600 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.key === 'pages' ? 'w-16' : ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-200 even:bg-slate-50">
                    {cols.map((c, i) => {
                      const v = c.get(it);
                      return (
                        <td key={c.key} className={`px-2 py-1.5 align-top ${c.align === 'right' ? 'tabular whitespace-nowrap text-right' : ''} ${c.key === 'pages' ? 'tabular text-slate-500' : ''}`}>
                          {i === 0 ? (
                            <span className={it.kind === 'main' ? 'block' : 'block pl-3'}>
                              {it.kind !== 'main' && <span className="text-slate-400">{it.kind === 'example' ? 'e.g. ' : '– '}</span>}
                              {v}
                              {it.needsReview && <span className="mt-0.5 block text-[9px] text-warning-700">Needs review: {it.needsReview}</span>}
                            </span>
                          ) : (
                            (v ?? <span className="text-slate-300">—</span>)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {total > 0 && costCol > 0 && (
                  <tr className="font-semibold">
                    <td colSpan={costCol} className="px-2 py-1.5 text-right">
                      Total estimated cost, as stated
                    </td>
                    <td className="tabular px-2 py-1.5 text-right">{usd.format(total)}</td>
                    {cols.length - costCol - 1 > 0 && <td colSpan={cols.length - costCol - 1} />}
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
