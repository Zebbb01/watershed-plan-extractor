'use client';

import type { ActivityItem, BmpItem, CategoryKey, ExtractedReport } from '@app/backend';
import { CATEGORY_KEYS } from '@app/backend';
import { Ruler } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cardClass } from '@/components/ui/card';
import { PopoverSelect } from '@/components/ui/popover-select';
import { Segmented } from '@/components/ui/segmented';
import { useMediaQuery } from '@/hooks/use-media-query';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';

/*
 * Every chart answers one question, has a table equivalent, and never mixes units on an axis.
 * Marks follow the dataviz rules: thin bars, rounded data ends, hairline grid, a tooltip, and
 * value labels where they fit. Cards in one row share a height so the grid has no holes.
 */

export const AXIS = { fontSize: 12, fill: '#64748b' };
export const GRID = '#e8edf3';
export const CURSOR = { fill: '#f1f5f9' };
// Tooltips wrap long names and stay narrower than a phone screen, so they never push the page sideways.
const TOOLTIP = {
  wrapperStyle: { maxWidth: 'min(320px, calc(100% - 8px))', zIndex: 10 },
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 6px 16px -4px rgb(15 23 42 / 0.12)',
    fontSize: 12,
    padding: '6px 10px',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  } as const,
  labelStyle: { color: '#0f172a', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#334155', padding: 0 },
};
export const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const usdShort = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
export const TOP = 8;

/** On phones the tooltip is pinned to the chart's left edge instead of following the finger off screen. */
export function useTooltip() {
  const narrow = useMediaQuery('(max-width: 639px)');
  return narrow ? { ...TOOLTIP, position: { x: 4 } } : TOOLTIP;
}

/** Narrow screens get shorter axis labels so the bars keep their room. */
export function useLabelWidth(wide: number) {
  const narrow = useMediaQuery('(max-width: 639px)');
  return { width: narrow ? Math.round(wide * 0.62) : wide, cut: (s: string) => (narrow && s.length > 20 ? `${s.slice(0, 19)}…` : s) };
}

export function ChartCard({
  title,
  note,
  chart,
  table,
  empty,
  controls,
  className,
}: {
  title: string;
  note?: string;
  chart: ReactNode;
  table: ReactNode;
  empty?: string | null;
  controls?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cn(cardClass, '@container flex min-w-0 flex-col p-4 sm:p-5', className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {note && <p className="text-[12px] text-slate-500">{note}</p>}
        </div>
        {!empty && (
          <div className="flex flex-wrap items-center gap-2">
            {controls}
            <Segmented label={`${title} view`} value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {empty ? <p className="py-10 text-center text-[13px] text-slate-500">{empty}</p> : view === 'chart' ? chart : table}
      </div>
    </section>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-dense">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[12px] uppercase tracking-wide text-slate-500">
            {head.map((h, i) => (
              <th key={h} className={cn('py-1.5 font-semibold', i ? 'pl-3 text-right' : 'pr-3')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn('py-1.5 text-slate-800', j ? 'tabular pl-3 text-right' : 'pr-3')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How many verified items each category holds; a bar opens its tab. */
export function CategoryCounts({ report, onOpen }: { report: ExtractedReport; onOpen?: (k: CategoryKey) => void }) {
  const tooltip = useTooltip();
  const data = CATEGORY_KEYS.map((k) => ({ key: k, name: CATEGORY_UI[k].label, value: report[k].length, color: CATEGORY_UI[k].color }));
  return (
    <ChartCard
      title="Items by category"
      note={onOpen ? 'Verified items only · select a bar to open it' : 'Verified items only'}
      empty={data.every((d) => d.value === 0) ? 'Nothing was extracted from this document.' : null}
      table={<SimpleTable head={['Category', 'Items']} rows={data.map((d) => [d.name, String(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={248}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 32 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={104} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={CURSOR} {...tooltip} formatter={(v) => [v as number, 'Items']} />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              label={{ position: 'right', fontSize: 12, fill: '#334155' }}
              className={onOpen ? 'cursor-pointer' : undefined}
              onClick={(d) => onOpen?.((d as unknown as { key: CategoryKey }).key)}
            >
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

// Activity status, light to dark green as work moves forward; "not stated" stays neutral grey.
const STATUS = [
  { key: 'completed', label: 'Completed', color: '#0b6b3a' },
  { key: 'in-progress', label: 'In progress', color: '#3fae74' },
  { key: 'planned', label: 'Planned', color: '#9fd9b9' },
  { key: null, label: 'Not stated', color: '#e2e8f0' },
] as const;

/** What the plan says about each activity's status: the basis of the completion rate. */
export function ActivityStatus({ activities }: { activities: ActivityItem[] }) {
  const tooltip = useTooltip();
  const data = STATUS.map((s) => ({ ...s, value: activities.filter((a) => a.status === s.key).length })).filter((d) => d.value > 0);
  const stated = activities.filter((a) => a.status !== null).length;
  const pct = (n: number) => `${Math.round((n / activities.length) * 100)}%`;
  return (
    <ChartCard
      title="Activity status"
      note={activities.length ? `As stated in the plan · ${stated} of ${activities.length} activities give a status` : undefined}
      empty={!activities.length ? 'No implementation activities were found.' : !stated ? 'No activity in this plan states its status.' : null}
      table={<SimpleTable head={['Status', 'Activities', 'Share']} rows={data.map((d) => [d.label, String(d.value), pct(d.value)])} />}
      chart={
        <div className="flex flex-col items-center gap-4 @sm:flex-row @sm:justify-center @sm:gap-6">
          <div className="relative size-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={64} outerRadius={92} paddingAngle={data.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.label} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltip} formatter={(v, n) => [`${v as number} (${pct(v as number)})`, n as string]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[24px] font-semibold leading-none text-slate-900">{activities.length}</div>
                <div className="mt-1 text-[12px] text-slate-500">activities</div>
              </div>
            </div>
          </div>
          <ul className="grid w-full max-w-60 grid-cols-[auto_1fr_auto_auto] items-center gap-x-2.5 gap-y-2 text-[13px] @sm:w-auto">
            {data.map((d) => (
              <li key={d.label} className="col-span-4 grid grid-cols-subgrid items-center">
                <span aria-hidden className="size-3 shrink-0 rounded-[3px] ring-1 ring-slate-300/60" style={{ background: d.color }} />
                <span className="text-slate-700">{d.label}</span>
                <span className="tabular text-right font-semibold text-slate-900">{d.value}</span>
                <span className="tabular text-right text-slate-500">{pct(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}

const UNIT_LABEL: Record<string, string> = { ac: 'Acres', ft: 'Feet', 'cu yd': 'Cubic yards', mi: 'Miles', gal: 'Gallons', count: 'Count' };
const MEASURE_UNITS = new Set(['ac', 'ft', 'cu yd', 'mi', 'gal', 'sq ft', 'lb', 'ton']);
export const barsHeight = (n: number) => Math.max(140, n * 30 + 36);

/** Planned BMP amounts, one unit at a time (acres and feet never share an axis). */
export function BmpAmounts({ bmps }: { bmps: BmpItem[] }) {
  const tooltip = useTooltip();
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
  const label = useLabelWidth(160);
  const current = byUnit.find(([u]) => u === unit) ?? byUnit[0];
  const all = current ? [...current[1]].sort((a, b) => b.value - a.value) : [];
  const data = all.slice(0, TOP);
  const unitName = current ? (UNIT_LABEL[current[0]] ?? current[0]).toLowerCase() : '';

  return (
    <ChartCard
      title="Planned BMP amounts"
      note={data.length ? `Largest ${data.length} of ${all.length} in ${unitName}, as written in the plan` : undefined}
      empty={data.length ? null : 'No BMP amounts are stated in this document.'}
      controls={
        byUnit.length > 1 && (
          <PopoverSelect
            label="Unit"
            icon={<Ruler className="size-3.5 text-slate-400" aria-hidden />}
            value={current![0]}
            onChange={setUnit}
            align="end"
            options={byUnit.map(([u, rows]) => ({ value: u, label: UNIT_LABEL[u] ?? u, count: rows.length }))}
          />
        )
      }
      table={<SimpleTable head={['Practice', UNIT_LABEL[current?.[0] ?? ''] ?? 'Amount']} rows={all.map((d) => [d.name, fmt.format(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={barsHeight(TOP)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 52 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmt.format(v)} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip cursor={CURSOR} {...tooltip} formatter={(v) => [`${fmt.format(v as number)} ${unitName}`, 'Planned']} />
            <Bar dataKey="value" fill={CATEGORY_UI.bmps.color} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 12, fill: '#334155', formatter: (v: unknown) => fmt.format(v as number) }} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

export function BmpCosts({ bmps }: { bmps: BmpItem[] }) {
  const tooltip = useTooltip();
  const label = useLabelWidth(160);
  const all = bmps
    .filter((b) => b.estimatedCost?.value)
    .map((b) => ({ name: b.name, value: b.estimatedCost!.value! }))
    .sort((a, b) => b.value - a.value);
  const data = all.slice(0, TOP);
  const total = all.reduce((s, d) => s + d.value, 0);
  return (
    <ChartCard
      title="Estimated BMP costs"
      note={all.length ? `Largest ${data.length} of ${all.length} practices · ${usd.format(total)} in total as stated` : undefined}
      empty={all.length ? null : 'No BMP costs are stated in this document.'}
      table={<SimpleTable head={['Practice', 'Estimated cost']} rows={all.map((d) => [d.name, usd.format(d.value)])} />}
      chart={
        <ResponsiveContainer width="100%" height={barsHeight(TOP)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 60 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => usdShort.format(v)} />
            <YAxis type="category" dataKey="name" width={label.width} tick={AXIS} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip cursor={CURSOR} {...tooltip} formatter={(v) => [usd.format(v as number), 'Estimated cost']} />
            <Bar dataKey="value" fill="#1d63b5" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 12, fill: '#334155', formatter: (v: unknown) => usdShort.format(v as number) }} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

/** When activities run, from their stated month or year ranges (a simple Gantt). */
export function Timeline({ activities, className }: { activities: ActivityItem[]; className?: string }) {
  const tooltip = useTooltip();
  const label = useLabelWidth(300);
  const timed = activities.filter((a) => a.start !== null && a.end !== null);
  const unit = timed.filter((a) => a.timeUnit === 'month').length >= timed.filter((a) => a.timeUnit === 'year').length ? 'month' : 'year';
  const shown = timed
    .filter((a) => a.timeUnit === unit)
    .sort((a, b) => a.start! - b.start! || a.end! - b.end!)
    .slice(0, 20);
  // Stacked bars start at zero, so years are drawn from the first year ("2011-2014" is not 0-2014).
  const base = unit === 'year' && shown.length ? Math.min(...shown.map((a) => a.start!)) : 0;
  const data = shown.map((a) => ({
    name: a.name.length > 42 ? `${a.name.slice(0, 40)}…` : a.name,
    full: a.name,
    offset: a.start! - base,
    span: Math.max(a.end! - a.start!, unit === 'month' ? 0.6 : 0.3),
    when: a.timeframe ?? '',
  }));
  return (
    <ChartCard
      className={className}
      title="Implementation timeline"
      note={data.length ? `${unit === 'month' ? 'Project months' : 'Years'}, as scheduled in the plan · ${data.length} of ${activities.length} activities give a time frame` : undefined}
      empty={data.length ? null : 'No activity in this document states a time frame.'}
      table={<SimpleTable head={['Activity', 'When']} rows={data.map((d) => [d.full, d.when])} />}
      chart={
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28 + 44)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20 }} barCategoryGap={7}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              domain={[0, 'dataMax']}
              allowDecimals={false}
              tickFormatter={(v: number) => (unit === 'month' ? `M${v}` : String(v + base))}
            />
            <YAxis type="category" dataKey="name" width={label.width} tick={{ ...AXIS, fontSize: 12 }} tickFormatter={label.cut} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={CURSOR}
              {...tooltip}
              labelFormatter={(_l, p) => (p?.[0]?.payload as { full: string } | undefined)?.full ?? ''}
              formatter={(_v, _n, p) => [(p?.payload as { when: string }).when, 'Scheduled']}
            />
            <Bar dataKey="offset" stackId="t" fill="transparent" isAnimationActive={false} tooltipType="none" />
            <Bar dataKey="span" stackId="t" fill={CATEGORY_UI.implementation.color} radius={4} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}
