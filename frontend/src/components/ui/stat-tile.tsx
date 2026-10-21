import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A label and a number; a second line only when the number needs its basis. With onClick
 * the whole tile is a button that opens the section the number counts.
 */
export function StatTile({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
        {Icon ? (
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full"
            style={{ background: accent ? `${accent}1f` : 'var(--color-slate-100)', color: accent ?? 'var(--color-slate-500)' }}
          >
            <Icon className="size-3.5" />
          </span>
        ) : (
          accent && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: accent }} />
        )}
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-slate-500">{sub}</div>}
    </>
  );
  const base = cn('rounded-card bg-white px-4 py-3.5 text-left shadow-card ring-1 ring-slate-200/70', className);
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600')}
    >
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}
