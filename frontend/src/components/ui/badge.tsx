import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'positive' | 'warning' | 'negative' | 'primary';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  positive: 'bg-positive-50 text-positive-700',
  warning: 'bg-warning-50 text-warning-700',
  negative: 'bg-negative-50 text-negative-700',
  primary: 'bg-primary-50 text-primary-700',
};

/** A small label. Status tones always carry a word, never colour alone. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-medium', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Category identity: a coloured dot plus the category's name. */
export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />;
}
