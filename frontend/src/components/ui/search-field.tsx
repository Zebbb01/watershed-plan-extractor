'use client';

import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A search box with its icon and a clear button. 16px text on phones so iOS does not zoom. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-control border border-slate-300 bg-white pl-8 pr-7 text-[16px] text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700">
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </label>
  );
}
