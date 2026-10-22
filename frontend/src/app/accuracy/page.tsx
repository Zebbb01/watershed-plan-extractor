import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORY_KEYS, type CategoryKey } from '@app/backend';
import { FileCheck2, Hash, ShieldCheck, Target } from 'lucide-react';
import { AccuracyChart } from '@/components/accuracy-chart';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { Shapes } from '@/components/ui/shapes';
import { StatTile } from '@/components/ui/stat-tile';
import accuracy from '@/data/accuracy.json';
import { CATEGORY_UI } from '@/lib/categories-ui';

export const metadata: Metadata = { title: 'Accuracy' };

interface Prf {
  gt: number;
  predicted: number;
  matched: number;
  precision: number;
  recall: number;
  f1: number;
}
interface DocRow {
  id: string;
  role: 'dev' | 'heldout' | 'smoke';
  format: string;
  pages: number;
  timeMs: number;
  costUsd: number | null;
  score: null | { core: Prf; numeric: { correct: number; total: number; accuracy: number }; verbatimViolations: string[] };
  /** core F1 of each run when the plan was run more than once; the scores above are then the runs' mean */
  runs?: number[];
}
interface Aggregate {
  docs: number;
  core: Prf;
  categories: Record<CategoryKey, Prf>;
  numeric: { correct: number; total: number; accuracy: number };
  verbatimViolations: number;
}
interface Accuracy {
  pending?: boolean;
  date: string;
  provider: string;
  model: string;
  ocrModel: string;
  effort: string;
  repeat?: number;
  docs: DocRow[];
  aggregate: { dev: Aggregate | null; heldout: Aggregate | null; all: Aggregate | null };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
/** Counts are averages when each plan ran more than once. */
const num = (x: number) => (Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(1));
const ROLE = { dev: 'Tuning', heldout: 'Held out', smoke: 'Smoke' } as const;
/** "broken-pumpkin-2019" -> "Broken Pumpkin 2019" */
const planName = (id: string) => id.replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

export default function Page() {
  const data = accuracy as unknown as Accuracy;
  return (
    <>
      <section className="relative overflow-hidden border-b border-primary-100/80 bg-primary-50/70">
        <Shapes />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-slate-900">Accuracy</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-slate-600">
            Scored by script against answer keys for Mississippi watershed plans in four formats, one of them scanned.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {data.pending ? (
          <p className={`${cardClass} px-4 py-6 text-[14px] text-slate-600`}>Results appear here after the evaluation runs.</p>
        ) : (
          <Results data={data} />
        )}

        <section className={`${cardClass} mt-8 max-w-3xl p-5`} aria-labelledby="method">
          <h2 id="method" className="text-[15px] font-semibold text-slate-900">
            How it is measured
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-slate-700">
            <li>The answer keys were written page by page from each PDF; a script checks every quote and name in them against the PDF text.</li>
            <li>Prompts were tuned only on the tuning plans. The held-out plan was labelled after tuning and scored on the final settings.</li>
            <li>Items match by name (word stems, one-to-one). Precision is the share of extracted items that are real; recall is the share of real items found.</li>
            <li>A number counts as right only when its value and unit both match the plan.</li>
            <li>The model is not deterministic, so each plan is run three times; the scores are the mean, with each run&apos;s F1 under it.</li>
            <li>A verbatim violation is an extracted name that is not written in the PDF. The checks reject these before display, so the target is zero.</li>
          </ul>
          <p className="mt-3 text-[13px] text-slate-500">Full method, per-plan misses and what was not measured: TESTING.md in the code.</p>
        </section>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/#samples" className={buttonClass('primary', 'lg')}>
            Open a sample
          </Link>
          <Link href="/how-it-works" className={buttonClass('secondary', 'lg')}>
            How it works
          </Link>
        </div>
      </div>
    </>
  );
}

function Results({ data }: { data: Accuracy }) {
  const all = data.aggregate.all!;
  const held = data.aggregate.heldout;
  const scored = data.docs.filter((d) => d.score);
  return (
    <>
      <p className="text-[13px] text-slate-500">
        {data.model} ({data.provider}) · run {data.date} · {all.docs} plans with answer keys
        {data.repeat && data.repeat > 1 ? ` · each plan run ${data.repeat} times, scores are the mean` : ''}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Goals, BMPs and activities" icon={Target} accent="#1d63b5" value={pct1(all.core.f1)} sub={`F1, all plans · bar 75%`} />
        {held && <StatTile label="Held-out plan" icon={FileCheck2} accent="#1d63b5" value={pct1(held.core.f1)} sub="F1 on a plan not used for tuning" />}
        <StatTile label="Numbers exact" icon={Hash} accent="#0f8a4b" value={pct1(all.numeric.accuracy)} sub={`${num(all.numeric.correct)} of ${num(all.numeric.total)} values · bar 75%`} />
        <StatTile label="Names not in the PDF" icon={ShieldCheck} accent="#0f8a4b" value={all.verbatimViolations} sub="verbatim violations · target 0" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className={`${cardClass} p-5`} aria-labelledby="by-plan-chart">
          <h2 id="by-plan-chart" className="text-[15px] font-semibold text-slate-900">
            Core F1 by plan
          </h2>
          <p className="text-[12px] text-slate-500">Goals, BMPs, activities and outreach</p>
          <AccuracyChart rows={scored.map((d) => ({ name: planName(d.id), f1: d.score!.core.f1, heldOut: d.role === 'heldout' }))} />
        </section>
        <section className={`${cardClass} overflow-hidden`} aria-labelledby="by-category">
          <h2 id="by-category" className="px-5 pt-5 text-[15px] font-semibold text-slate-900">
            By category, all plans
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-dense">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-500">
                  {['Category', 'Found', 'Precision', 'Recall', 'F1'].map((h, i) => (
                    <th key={h} className={`h-9 px-3 font-semibold first:pl-5 last:pr-5 ${i >= 1 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((k) => {
                  const c = all.categories[k];
                  return (
                    <tr key={k} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pl-5 pr-3">
                        <span className="flex items-center gap-1.5 font-medium text-slate-900">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[k].color }} />
                          {CATEGORY_UI[k].label}
                        </span>
                      </td>
                      <td className="tabular px-3 py-2 text-right text-slate-600">
                        {num(c.matched)} of {num(c.gt)}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{pct(c.precision)}</td>
                      <td className="tabular px-3 py-2 text-right">{pct(c.recall)}</td>
                      <td className="tabular py-2 pl-3 pr-5 text-right font-semibold">{pct(c.f1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={`${cardClass} mt-4 overflow-hidden`} aria-labelledby="by-document">
        <h2 id="by-document" className="px-5 pt-5 text-[15px] font-semibold text-slate-900">
          By plan
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-dense">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-500">
                {['Plan', 'Set', 'Format', 'Pages', 'F1', 'Precision', 'Recall', 'Numbers', 'Time', 'Cost'].map((h, i) => (
                  <th key={h} className={`h-9 px-3 font-semibold first:pl-5 last:pr-5 ${i >= 3 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.docs.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pl-5 pr-3 font-medium text-slate-900">{planName(d.id)}</td>
                  <td className="px-3 py-2 text-slate-600">{d.score ? ROLE[d.role] : 'Unlabelled'}</td>
                  <td className="px-3 py-2 text-slate-600">{d.format}</td>
                  <td className="tabular px-3 py-2 text-right">{d.pages}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">
                    {d.score ? pct(d.score.core.f1) : '—'}
                    {d.runs && (
                      <span className="block text-[11px] font-normal text-slate-500" title="Core F1 of each run">
                        {d.runs.map(pct).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{d.score ? pct(d.score.core.precision) : '—'}</td>
                  <td className="tabular px-3 py-2 text-right">{d.score ? pct(d.score.core.recall) : '—'}</td>
                  <td className="tabular px-3 py-2 text-right">{d.score ? `${pct(d.score.numeric.accuracy)} (${num(d.score.numeric.correct)}/${num(d.score.numeric.total)})` : '—'}</td>
                  <td className="tabular px-3 py-2 text-right">{Math.round(d.timeMs / 1000)} s</td>
                  <td className="tabular py-2 pl-3 pr-5 text-right">{d.costUsd === null ? '—' : `$${d.costUsd.toFixed(3)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
