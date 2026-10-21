'use client';

import type { ActivityItem, BmpItem, ExtractedReport } from '@app/backend';
import { CATEGORY_KEYS } from '@app/backend';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmented } from '@/components/ui/segmented';
import { useMediaQuery } from '@/hooks/use-media-query';
import { CATEGORY_UI } from '@/lib/categories-ui';

/*
 * Every chart answers one question, has a table equivalent, and never mixes units on an axis.
 * Marks follow the dataviz rules: thin bars, rounded data ends, recessive grid, a tooltip.
 */

const AXIS = { fontSize: 12, fill: '#64748b' };
const GRID = '#e2e8f0';
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/** Narrow screens get shorter axis labels so the bars keep their room. */
function useLabelWidth(wide: number) {
  const narrow = useMediaQuery('(max-width: 639px)');
  return { width: narrow ? Math.round(wide * 0.62) : wide, cut: (s: string) => (narrow && s.length > 20 ? `${s.slice(0, 19)}…` : s) };
}
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function ChartCard({ title, note, chart, table, empty }: { title: string; note?: string; chart: ReactNode; table: ReactNode; empty?: string | null }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="rounded-panel border border-slate-200 bg-white p-4" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
          {note && <p className="text-[12px] text-slate-500">{note}</p>}
        </div>
        {!empty && (
          <Segmented label={`${title} view`} value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />
        )}
      </div>
      {empty ? <p className="py-8 text-center text-[13px] text-slate-500">{empty}</p> : view === 'chart' ? chart : table}
    </section>
  );
}

function SimpleTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-dense">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[12px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3 font-semibold">{head[0]}</th>
            <th className="py-1.5 text-right font-semibold">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-3 text-slate-800">{a}</td>
              <td className="tabular py-1.5 text-right text-slate-800">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CategoryCounts({ report }: { report: ExtractedReport }) {
  const data = CATEGORY_KEYS.map((k) => ({ name: CATEGORY_UI[k].label, value: report[k].length, color: CATEGORY_UI[k].color }));
  return (
    <ChartCard
      title="Items by category"
      note="Verified items only"
      empty={data.every((d) => d.value === 0) ? 'Nothing was extracted from this document.' : null}
      table={<SimpleTable head={['Category', 'Items']} rows={data.map((d) => [d.name, String(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={104} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v as number, 'Items']} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fontSize: 12, fill: '#334155' }}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

const UNIT_LABEL: Record<string, string> = { ac: 'Acres', ft: 'Feet', 'cu yd': 'Cubic yards', mi: 'Miles', gal: 'Gallons', count: 'Count' };
const MEASURE_UNITS = new Set(['ac', 'ft', 'cu yd', 'mi', 'gal', 'sq ft', 'lb', 'ton']);

/** Planned BMP amounts, one unit at a time (acres and feet never share an axis). */
export function BmpAmounts({ bmps }: { bmps: BmpItem[] }) {
  const byUnit = useMemo(() => {
    const groups = new Map<string, { name: string; value: number; scope: string | null }[]>();
    for (const b of bmps) {
      // One amount per practice: the first stated, which is the full-plan figure in cost tables.
      const q = b.quantities.find((x) => x.value !== null && x.unit !== 'USD' && x.unit !== '%');
      if (!q || q.value === null) continue;
      const unit = q.unit && MEASURE_UNITS.has(q.unit) ? q.unit : 'count';
      groups.set(unit, [...(groups.get(unit) ?? []), { name: b.name, value: q.value, scope: q.scope }]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [bmps]);
  const [unit, setUnit] = useState<string | null>(null);
  const label = useLabelWidth(170);
  const current = byUnit.find(([u]) => u === unit) ?? byUnit[0];
  const data = current ? [...current[1]].sort((a, b) => b.value - a.value).slice(0, 12) : [];

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-4" aria-label="Planned BMP amounts">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-900">Planned BMP amounts</h2>
          <p className="text-[12px] text-slate-500">Largest 12 per unit, as written in the plan</p>
        </div>
        {byUnit.length > 1 && (
          <Segmented
            label="Unit"
            value={current![0]}
            onChange={setUnit}
            options={byUnit.slice(0, 4).map(([u]) => ({ value: u, label: UNIT_LABEL[u] ?? u }))}
          />
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-slate-500">No BMP amounts are stated in this document.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmt.format(v)} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [`${fmt.format(v as number)} ${UNIT_LABEL[current![0]] ?? current![0]}`.toLowerCase(), 'Planned']} />
            <Bar dataKey="value" fill={CATEGORY_UI.bmps.color} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 12, fill: '#334155', formatter: (v: unknown) => fmt.format(v as number) }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

export function BmpCosts({ bmps }: { bmps: BmpItem[] }) {
  const label = useLabelWidth(170);
  const data = bmps
    .filter((b) => b.estimatedCost?.value)
    .map((b) => ({ name: b.name, value: b.estimatedCost!.value! }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ChartCard
      title="Estimated BMP costs"
      note={data.length ? `Largest ${data.length} practices · ${usd.format(total)} shown` : undefined}
      empty={data.length ? null : 'No BMP costs are stated in this document.'}
      table={<SimpleTable head={['Practice', 'Estimated cost']} rows={data.map((d) => [d.name, usd.format(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => usd.format(v)} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [usd.format(v as number), 'Estimated cost']} />
            <Bar dataKey="value" fill="#1d63b5" radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

/** When activities run, from their stated month or year ranges (a simple Gantt). */
export function Timeline({ activities }: { activities: ActivityItem[] }) {
  const label = useLabelWidth(230);
  const timed = activities.filter((a) => a.start !== null && a.end !== null);
  const unit = timed.filter((a) => a.timeUnit === 'month').length >= timed.filter((a) => a.timeUnit === 'year').length ? 'month' : 'year';
  const shown = timed
    .filter((a) => a.timeUnit === unit)
    .sort((a, b) => a.start! - b.start! || a.end! - b.end!)
    .slice(0, 20);
  // Stacked bars start at zero, so years are drawn from the first year ("2011-2014" is not 0-2014).
  const base = unit === 'year' && shown.length ? Math.min(...shown.map((a) => a.start!)) : 0;
  const data = shown.map((a) => ({
    name: a.name.length > 46 ? `${a.name.slice(0, 44)}…` : a.name,
    full: a.name,
    offset: a.start! - base,
    span: Math.max(a.end! - a.start!, unit === 'month' ? 0.6 : 0.3),
    when: a.timeframe ?? '',
  }));
  return (
    <ChartCard
      title="Implementation timeline"
      note={data.length ? `${unit === 'month' ? 'Project months' : 'Years'}, as scheduled in the plan` : undefined}
      empty={data.length ? null : 'No activity in this document states a time frame.'}
      table={<SimpleTable head={['Activity', 'When']} rows={data.map((d) => [d.full, d.when])} />}
      chart={
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26 + 48)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={5}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} domain={[0, 'dataMax']} allowDecimals={false} tickFormatter={(v: number) => String(v + base)} />
            <YAxis type="category" dataKey="name" width={label.width} tick={{ ...AXIS, fontSize: 11 }} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(_v, _n, p) => [(p?.payload as { when: string }).when, 'Scheduled']} />
            <Bar dataKey="offset" stackId="t" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="span" stackId="t" fill={CATEGORY_UI.implementation.color} radius={4} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}
