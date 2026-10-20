'use client';

import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

/** Two to six choices shown at once, instead of a dropdown that hides them. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn('inline-flex h-8 items-center rounded-control border border-slate-300 bg-slate-50 p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="h-full rounded-[5px] px-2.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600 data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-[0_1px_2px_rgb(15_23_42/0.12)]"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
