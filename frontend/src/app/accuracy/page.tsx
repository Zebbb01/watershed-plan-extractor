import type { Metadata } from 'next';
import { CATEGORY_KEYS, type CategoryKey } from '@app/backend';
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
  docs: DocRow[];
  aggregate: { dev: Aggregate | null; heldout: Aggregate | null; all: Aggregate | null };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ROLE = { dev: 'Tuning', heldout: 'Held out', smoke: 'Smoke' } as const;

export default function Page() {
  const data = accuracy as unknown as Accuracy;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Accuracy</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-slate-600">Scored by script against answer keys for Mississippi watershed plans in four formats, one of them scanned.</p>

      {data.pending ? (
        <p className="mt-8 rounded-panel border border-slate-200 bg-white px-4 py-6 text-[14px] text-slate-600">Results appear here after the evaluation runs.</p>
      ) : (
        <Results data={data} />
      )}

      <section className="mt-10 max-w-3xl" aria-labelledby="method">
        <h2 id="method" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          How it is measured
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-slate-700">
          <li>Ground truth was drafted page by page from each PDF and checked by hand; every quote in it is verified against the PDF text by a script.</li>
          <li>Prompts were tuned only on the tuning set. The held-out plans were scored once, on the final settings.</li>
          <li>Items match by name (word stems, one-to-one). Precision is the share of extracted items that are real; recall is the share of real items found.</li>
          <li>A number counts as right only when its value and unit both match the plan.</li>
          <li>A verbatim violation is an extracted name that does not appear in the PDF. The checks reject these before display, so the target is zero.</li>
        </ul>
        <p className="mt-3 text-[13px] text-slate-500">Full method, per-document misses and what was not measured: TESTING.md in the code.</p>
      </section>
    </div>
  );
}

function Results({ data }: { data: Accuracy }) {
  const headline = data.aggregate.heldout ?? data.aggregate.all!;
  const which = data.aggregate.heldout ? 'held-out plans' : 'all plans';
  const all = data.aggregate.all!;
  return (
    <>
      <p className="mt-6 text-[13px] text-slate-500">
        {data.model} ({data.provider}) · effort {data.effort} · run {data.date}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Goals, BMPs and activities" value={pct(headline.core.f1)} sub={`F1 on ${which} (bar: 75%)`} />
        <StatTile label="Numbers exact" value={pct(headline.numeric.accuracy)} sub={`${headline.numeric.correct} of ${headline.numeric.total} values`} />
        <StatTile label="Verbatim violations" value={all.verbatimViolations} sub="names not in the PDF (target 0)" />
        <StatTile label="Plans evaluated" value={all.docs} sub="with ground truth" />
      </div>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-slate-500">By document</h2>
      <div className="mt-3 overflow-x-auto rounded-panel border border-slate-200 bg-white">
        <table className="w-full text-dense">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-500">
              {['Plan', 'Set', 'Format', 'Pages', 'F1', 'Precision', 'Recall', 'Numbers', 'Time', 'Cost'].map((h, i) => (
                <th key={h} className={`h-9 px-3 font-semibold ${i >= 3 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.docs.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-900">{d.id}</td>
                <td className="px-3 py-2 text-slate-600">{ROLE[d.role]}</td>
                <td className="px-3 py-2 text-slate-600">{d.format}</td>
                <td className="tabular px-3 py-2 text-right">{d.pages}</td>
                <td className="tabular px-3 py-2 text-right font-semibold">{d.score ? pct(d.score.core.f1) : '—'}</td>
                <td className="tabular px-3 py-2 text-right">{d.score ? pct(d.score.core.precision) : '—'}</td>
                <td className="tabular px-3 py-2 text-right">{d.score ? pct(d.score.core.recall) : '—'}</td>
                <td className="tabular px-3 py-2 text-right">{d.score ? `${pct(d.score.numeric.accuracy)} (${d.score.numeric.correct}/${d.score.numeric.total})` : '—'}</td>
                <td className="tabular px-3 py-2 text-right">{Math.round(d.timeMs / 1000)} s</td>
                <td className="tabular px-3 py-2 text-right">{d.costUsd === null ? '—' : `$${d.costUsd.toFixed(2)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-slate-500">By category, all plans</h2>
      <div className="mt-3 overflow-x-auto rounded-panel border border-slate-200 bg-white">
        <table className="w-full text-dense">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-500">
              {['Category', 'In ground truth', 'Extracted', 'Matched', 'Precision', 'Recall', 'F1'].map((h, i) => (
                <th key={h} className={`h-9 px-3 font-semibold ${i >= 1 ? 'text-right' : ''}`}>
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
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 font-medium text-slate-900">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY_UI[k].color }} />
                      {CATEGORY_UI[k].label}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{c.gt}</td>
                  <td className="tabular px-3 py-2 text-right">{c.predicted}</td>
                  <td className="tabular px-3 py-2 text-right">{c.matched}</td>
                  <td className="tabular px-3 py-2 text-right">{pct(c.precision)}</td>
                  <td className="tabular px-3 py-2 text-right">{pct(c.recall)}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{pct(c.f1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
