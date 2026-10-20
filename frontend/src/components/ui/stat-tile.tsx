import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A label and a number; a second line only when the number needs its basis. */
export function StatTile({ label, value, sub, accent, className }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn('rounded-panel border border-slate-200 bg-white px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        {accent && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-slate-500">{sub}</div>}
    </div>
  );
}
