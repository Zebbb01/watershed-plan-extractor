'use client';

import type { ActivityItem, CategoryKey, ExtractedReport, ExtractionResult, GoalItem } from '@app/backend';
import { CATEGORY_KEYS } from '@app/backend';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cardClass } from '@/components/ui/card';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';
import { AXIS, barsHeight, ChartCard, CURSOR, fmt, GRID, SimpleTable, TOP, usd, useLabelWidth, useTooltip } from './charts';

/*
 * Views of the plan as a whole, built only from verified items, so they read the same on any
 * plan: the chain from goals to monitoring, where in the document each category was found,
 * the percentage targets the goals set, and who the activities name as responsible.
 */

const unique = (xs: string[]) => {
  const seen = new Map<string, string>();
  for (const x of xs) {
    const k = x.trim().toLowerCase().replace(/\s+/g, ' ');
    if (k && !seen.has(k)) seen.set(k, x.trim());
  }
  return [...seen.values()];
};

/** One line on an axis: a long name is cut, and the tooltip and table give it in full. */
const oneLine = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const pctRange = (lo: number, hi: number) => (lo === hi ? `${fmt.format(hi)}%` : `${fmt.format(lo)}–${fmt.format(hi)}%`);

/** The span of the activities' stated schedule, in the unit most of them use. */
export function scheduleSpan(activities: ActivityItem[]): string | null {
  const timed = activities.filter((a) => a.start !== null && a.end !== null);
  if (!timed.length) return null;
  const unit = timed.filter((a) => a.timeUnit === 'month').length >= timed.length / 2 ? 'month' : 'year';
  const same = timed.filter((a) => a.timeUnit === unit);
  if (!same.length) return null;
  const from = Math.min(...same.map((a) => a.start!));
  const to = Math.max(...same.map((a) => a.end!));
  return unit === 'month' ? `Months ${from}–${to}` : `${from}–${to}`;
}

interface Step {
  key: CategoryKey;
  title: string;
  count: number;
  facts: string[];
}

/** The plan's chain at a glance: what it targets, the practices and activities that get there, and how it will check. */
export function PlanAtAGlance({ report, onOpen }: { report: ExtractedReport; onOpen?: (k: CategoryKey) => void }) {
  const pollutants = unique([...report.goals.map((g) => g.pollutant ?? ''), ...report.bmps.flatMap((b) => b.pollutants)]).slice(0, 5);
  const targets = report.goals.flatMap((g) => g.targets.filter((t) => t.unit === '%').map((t) => t.raw));
  const cost = report.bmps.reduce((s, b) => s + (b.estimatedCost?.value ?? 0), 0);
  const topBmps = [...report.bmps].sort((a, b) => (b.estimatedCost?.value ?? 0) - (a.estimatedCost?.value ?? 0)).slice(0, 2).map((b) => b.name);
  const span = scheduleSpan(report.implementation);
  const done = report.implementation.filter((a) => a.status === 'completed').length;
  const steps: Step[] = [
    { key: 'goals', title: 'Goals', count: report.goals.length, facts: [...unique(targets).slice(0, 2).map((t) => `Target ${t}`), ...report.goals.slice(0, targets.length ? 1 : 2).map((g) => g.name)] },
    { key: 'bmps', title: 'Practices', count: report.bmps.length, facts: [...(cost ? [`${usd.format(cost)} estimated`] : []), ...topBmps] },
    { key: 'implementation', title: 'Activities', count: report.implementation.length, facts: [...(span ? [span] : []), ...(done ? [`${done} reported completed`] : []), ...report.implementation.slice(0, span ? 1 : 2).map((a) => a.name)] },
    { key: 'monitoring', title: 'Monitoring', count: report.monitoring.length, facts: unique(report.monitoring.map((m) => m.parameter)).slice(0, 3) },
  ];
  const outreach = unique(report.outreach.map((o) => o.name)).slice(0, 3);

  return (
    <section className={cn(cardClass, 'p-4 sm:p-5')} aria-label="Plan at a glance">
      <h2 className="text-[15px] font-semibold text-slate-900">Plan at a glance</h2>
      <p className="text-[12px] text-slate-500">From what the plan sets out to achieve to how it will check progress · verified items only</p>
      {pollutants.length > 0 && (
        <p className="mt-3 text-[13px] text-slate-600">
          <span className="font-medium text-slate-800">Addresses </span>
          {pollutants.join(' · ')}
        </p>
      )}
      <ol className="mt-3 flex flex-col items-stretch gap-1 @3xl:flex-row @3xl:items-stretch @3xl:gap-0">
        {steps.map((s, i) => {
          const ui = CATEGORY_UI[s.key];
          return (
            <li key={s.key} className="flex flex-col items-stretch @3xl:flex-1 @3xl:flex-row @3xl:items-center">
              <button
                type="button"
                onClick={() => onOpen?.(s.key)}
                aria-label={`${s.title}: ${s.count}. Open the ${ui.label} tab`}
                className="group flex min-w-0 flex-1 flex-col rounded-[10px] border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
                  <ui.icon className="size-3.5" style={{ color: ui.color }} aria-hidden />
                  {s.title}
                </span>
                <span className="mt-1 text-[22px] font-semibold leading-none text-slate-900">{s.count}</span>
                {s.facts.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-[12px] leading-snug text-slate-600">
                    {s.facts.map((f) => (
                      <li key={f} className="line-clamp-2">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="mt-2 text-[12px] text-slate-400">None found</span>
                )}
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden className="grid place-items-center py-0.5 text-slate-300 @3xl:px-1.5 @3xl:py-0">
                  <ArrowDown className="size-4 @3xl:hidden" />
                  <ArrowRight className="hidden size-4 @3xl:block" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => onOpen?.('outreach')}
        className="mt-3 flex w-full flex-wrap items-baseline gap-x-2 rounded-[10px] border border-dashed border-slate-200 px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <span className="font-medium text-slate-800">Supported by {report.outreach.length} outreach {report.outreach.length === 1 ? 'activity' : 'activities'}</span>
        {outreach.length > 0 && <span className="min-w-0 truncate">{outreach.join(' · ')}</span>}
      </button>
    </section>
  );
}

const ROW_H = 16;
// Items on a page, as the share of the category colour: one, two or three, four or more.
const SHADE = (n: number) => (n >= 4 ? 1 : n >= 2 ? 0.62 : 0.32);
const SCANNED = '#c7d2fe';
const SKIPPED = '#cbd5e1';

/** Ticks at a step that keeps about eight labels on the page axis. */
export const tickStep = (pages: number) => [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => pages / s <= 8) ?? 500;

/** Where in the document each category was found, page by page: a long plan's map. */
export function DocumentMap({ report, pages, quality }: { report: ExtractedReport; pages: number; quality: ExtractionResult['quality'] }) {
  const counts = useMemo(
    () =>
      CATEGORY_KEYS.map((k) => {
        const m = new Map<number, number>();
        for (const it of report[k]) for (const p of new Set(it.evidence.map((e) => e.page))) m.set(p, (m.get(p) ?? 0) + 1);
        return m;
      }),
    [report],
  );
  const skipped = useMemo(() => new Map(quality.skippedPages.map((s) => [s.page, s.reason])), [quality.skippedPages]);
  const ocr = useMemo(() => new Set(quality.ocrPages), [quality.ocrPages]);
  const [hover, setHover] = useState<{ page: number; left: number } | null>(null);
  const withItems = [...new Set(counts.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const step = tickStep(pages);
  const ticks = [1, ...Array.from({ length: Math.floor(pages / step) }, (_, i) => (i + 1) * step).filter((t) => t > 1 && t <= pages)];
  const rows = CATEGORY_KEYS.length + (ocr.size || skipped.size ? 1 : 0);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 0), box.width - 1);
    setHover({ page: Math.floor((x / box.width) * pages) + 1, left: x });
  };
  const status = (p: number) => (skipped.has(p) ? `Skipped: ${skipped.get(p)}` : ocr.has(p) ? 'Scanned page, read' : null);

  return (
    <ChartCard
      className="@3xl:col-span-2"
      title="Where the plan says it"
      note={`${pages} pages · items found on ${withItems.length} of them${ocr.size ? ` · ${ocr.size} scanned pages read` : ''}`}
      empty={pages ? null : 'This document has no pages.'}
      table={
        <SimpleTable
          head={['Page', ...CATEGORY_KEYS.map((k) => CATEGORY_UI[k].short), 'Note']}
          rows={[...new Set([...withItems, ...skipped.keys()])].sort((a, b) => a - b).map((p) => [
            `p. ${p}`,
            ...counts.map((m) => String(m.get(p) ?? 0)),
            status(p) ?? '',
          ])}
        />
      }
      chart={
        <div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col text-[12px] text-slate-600">
              {CATEGORY_KEYS.map((k) => (
                <span key={k} className="flex items-center gap-1.5 truncate" style={{ height: ROW_H + 4 }}>
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CATEGORY_UI[k].color }} />
                  {CATEGORY_UI[k].label}
                </span>
              ))}
              {rows > CATEGORY_KEYS.length && (
                <span className="flex items-center truncate text-slate-500" style={{ height: ROW_H + 4 }}>
                  Page
                </span>
              )}
            </div>
            <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              <svg
                role="img"
                aria-label={`Items per page for each category over ${pages} pages`}
                viewBox={`0 0 ${pages} ${rows}`}
                preserveAspectRatio="none"
                className="block w-full"
                style={{ height: rows * (ROW_H + 4) }}
              >
                {CATEGORY_KEYS.map((k, r) => (
                  <g key={k}>
                    <rect x={0} y={r + 0.09} width={pages} height={0.82} fill="#f1f5f9" />
                    {[...counts[r]].map(([p, n]) => (
                      <rect key={p} x={p - 1} y={r + 0.09} width={1} height={0.82} fill={CATEGORY_UI[k].color} fillOpacity={SHADE(n)} />
                    ))}
                  </g>
                ))}
                {rows > CATEGORY_KEYS.length &&
                  Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((p) => skipped.has(p) || ocr.has(p))
                    .map((p) => (
                      <rect key={p} x={p - 1} y={CATEGORY_KEYS.length + 0.3} width={1} height={0.4} fill={skipped.has(p) ? SKIPPED : SCANNED} />
                    ))}
                {hover && <rect x={hover.page - 1} y={0} width={1} height={rows} fill="none" stroke="#0f172a" strokeWidth={0.04} vectorEffect="non-scaling-stroke" />}
              </svg>
              <div className="relative mt-1 h-4 text-[11px] text-slate-500" aria-hidden>
                {ticks.map((t) => (
                  <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: `${((t - 0.5) / pages) * 100}%` }}>
                    {t}
                  </span>
                ))}
              </div>
              {hover && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] shadow-md"
                  style={{ left: `clamp(96px, ${hover.left}px, calc(100% - 96px))` }}
                >
                  <div className="font-semibold text-slate-900">Page {hover.page}</div>
                  {status(hover.page) && <div className="text-slate-500">{status(hover.page)}</div>}
                  {counts.some((m) => m.get(hover.page)) ? (
                    <ul className="mt-0.5 text-slate-700">
                      {CATEGORY_KEYS.map((k, r) =>
                        counts[r].get(hover.page) ? (
                          <li key={k} className="flex justify-between gap-2">
                            <span>{CATEGORY_UI[k].label}</span>
                            <span className="tabular font-medium">{counts[r].get(hover.page)}</span>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  ) : (
                    <div className="text-slate-500">No items</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              Items on the page
              {[1, 2, 4].map((n) => (
                <span key={n} className="flex items-center gap-1">
                  <span aria-hidden className="size-3 rounded-[3px]" style={{ background: '#334155', opacity: SHADE(n) }} />
                  {n === 1 ? '1' : n === 2 ? '2–3' : '4+'}
                </span>
              ))}
            </span>
            {ocr.size > 0 && (
              <span className="flex items-center gap-1">
                <span aria-hidden className="size-3 rounded-[3px]" style={{ background: SCANNED }} />
                Scanned page, read
              </span>
            )}
            {skipped.size > 0 && (
              <span className="flex items-center gap-1">
                <span aria-hidden className="size-3 rounded-[3px]" style={{ background: SKIPPED }} />
                Skipped (blank, contents, figure)
              </span>
            )}
          </div>
        </div>
      }
    />
  );
}

/** Each percentage target of the goals once, as the range written, highest first. */
export function targetRows(goals: GoalItem[]) {
  const seen = new Set<string>();
  return goals
    .flatMap((g) =>
      g.targets
        .filter((t) => t.unit === '%' && t.value !== null && t.value <= 100)
        .map((t) => {
          const lo = t.valueMax !== null ? Math.min(t.value!, t.valueMax) : t.value!;
          const hi = t.valueMax !== null ? Math.max(t.value!, t.valueMax) : t.value!;
          // a single value still gets a visible sliver of bar
          return { name: g.name, raw: t.raw, pollutant: g.pollutant ?? '', lo, span: Math.max(hi - lo, 1.2), hi, range: pctRange(lo, hi) };
        }),
    )
    .filter((r) => {
      const k = `${r.name.toLowerCase()}|${r.lo}|${r.hi}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.hi - a.hi);
}

/** The percentage targets the goals set, each as the range the plan states. */
export function ReductionTargets({ goals }: { goals: GoalItem[] }) {
  const tooltip = useTooltip();
  const label = useLabelWidth(210);
  const all = useMemo(() => targetRows(goals), [goals]);
  const data = all.slice(0, TOP);
  return (
    <ChartCard
      title="Reduction targets"
      note={all.length ? `Percentages the goals state · ${data.length} of ${all.length}` : undefined}
      empty={all.length ? null : 'No goal in this document states a percentage target.'}
      table={<SimpleTable head={['Goal', 'Target as written', 'Pollutant']} rows={all.map((d) => [d.name, d.raw, d.pollutant])} />}
      chart={
        <ResponsiveContainer width="100%" height={barsHeight(Math.max(data.length, 3))}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 64 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={(s: string) => label.cut(oneLine(s, 32))} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={CURSOR}
              {...tooltip}
              labelFormatter={(_l, p) => (p?.[0]?.payload as { name: string } | undefined)?.name ?? ''}
              formatter={(_v, _n, p) => [(p?.payload as { raw: string }).raw, 'Target as written']}
            />
            <Bar dataKey="lo" stackId="r" fill="transparent" isAnimationActive={false} tooltipType="none" />
            <Bar dataKey="span" stackId="r" fill={CATEGORY_UI.goals.color} radius={4} maxBarSize={14}>
              <LabelList dataKey="range" position="right" fontSize={12} fill="#334155" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

/** Activities per organization named as responsible, most first. */
export function responsibleCounts(activities: ActivityItem[]) {
  const byKey = new Map<string, { name: string; value: number }>();
  for (const a of activities) {
    // a list written as one entry ("MDEQ, NRCS; county") counts once for each organization
    const once = new Map<string, string>();
    for (const r of a.responsible.flatMap((x) => x.split(/[;,]/)).map((x) => x.trim()).filter(Boolean)) {
      const k = r.toLowerCase().replace(/\s+/g, ' ');
      if (!once.has(k)) once.set(k, r);
    }
    for (const [k, r] of once) {
      const row = byKey.get(k) ?? { name: r, value: 0 };
      row.value++;
      byKey.set(k, row);
    }
  }
  return [...byKey.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Who the plan names as responsible for its activities. */
export function WhoDoesWhat({ activities }: { activities: ActivityItem[] }) {
  const tooltip = useTooltip();
  const label = useLabelWidth(210);
  const named = activities.filter((a) => a.responsible.length > 0);
  const all = useMemo(() => responsibleCounts(activities), [activities]);
  const data = all.slice(0, TOP);
  return (
    <ChartCard
      title="Who carries out the activities"
      note={all.length ? `Organizations named as responsible · ${named.length} of ${activities.length} activities name one` : undefined}
      empty={all.length ? null : 'No activity in this document names who is responsible.'}
      table={<SimpleTable head={['Organization', 'Activities']} rows={all.map((d) => [d.name, String(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={barsHeight(Math.max(data.length, 3))}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={(s: string) => label.cut(oneLine(s, 32))} axisLine={false} tickLine={false} />
            <Tooltip cursor={CURSOR} {...tooltip} formatter={(v) => [fmt.format(v as number), 'Activities']} />
            <Bar dataKey="value" fill={CATEGORY_UI.implementation.color} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 12, fill: '#334155' }} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}
