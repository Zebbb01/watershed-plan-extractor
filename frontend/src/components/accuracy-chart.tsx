'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Held-out plans estimate a plan the tool has not seen, so they are told apart from the tuning plans.
const FILL = { tuning: '#94a3b8', heldOut: '#1d63b5' };

/** Core F1 per scored plan against the assessment's 75% bar. */
export function AccuracyChart({ rows }: { rows: { name: string; f1: number; heldOut: boolean }[] }) {
  const data = rows.map((r) => ({ ...r, value: Math.round(r.f1 * 1000) / 10 }));
  return (
    <>
      <p className="mt-2 flex gap-4 text-[12px] text-slate-600">
        {(['tuning', 'heldOut'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: FILL[k] }} />
            {k === 'heldOut' ? 'Held out' : 'Tuning'}
          </span>
        ))}
      </p>
      <ResponsiveContainer width="100%" height={data.length * 44 + 56}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 48, top: 22 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="#e8edf3" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            wrapperStyle={{ maxWidth: 'min(320px, 78vw)' }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, whiteSpace: 'normal' }}
            formatter={(v, _n, p) => [`${v as number}%${(p?.payload as { heldOut: boolean }).heldOut ? ' (held out)' : ''}`, 'Core F1']}
          />
          <ReferenceLine x={75} stroke="#b25e09" strokeWidth={1.5} label={{ value: 'Bar 75%', position: 'top', fontSize: 11, fill: '#93470a' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.heldOut ? FILL.heldOut : FILL.tuning} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v: unknown) => `${v as number}%`} style={{ fontSize: 12, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
