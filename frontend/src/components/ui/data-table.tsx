'use client';

import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { cardClass } from './card';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  className?: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
}

/*
 * A dense, sortable table (13 px text, ~37 px rows, sticky header). Rows can expand to show
 * their evidence. Under 640 px the same rows become cards: a table never shrinks on a phone.
 */
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  detail,
}: {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  detail?: (row: T) => ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const x = col.sortValue!(a);
      const y = col.sortValue!(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sortBy = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  return (
    <>
      <div className={`hidden max-h-[calc(100vh-13rem)] overflow-auto sm:block ${cardClass}`}>
        <table className="w-full border-collapse text-dense">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              {detail && <th scope="col" className="w-9" aria-label="Details" />}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={cn('h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500', c.align === 'right' && 'text-right', c.className)}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => sortBy(c.key)}
                        className={cn('inline-flex items-center gap-1 rounded-[4px] uppercase hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600', c.align === 'right' && 'flex-row-reverse')}
                      >
                        {c.label}
                        {active && (sort!.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = rowKey(row);
              const expanded = open.has(key);
              return (
                <Fragment key={key}>
                  <tr className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">
                    {detail && (
                      <td className="py-1.5 pl-2">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Hide evidence' : 'Show evidence'}
                          onClick={() => toggle(key)}
                          className="grid size-6 place-items-center rounded-[4px] text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary-600"
                        >
                          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} aria-hidden />
                        </button>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-2 text-slate-800', c.align === 'right' && 'tabular text-right', c.className)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                  {detail && expanded && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td />
                      <td colSpan={columns.length} className="px-3 pb-3 pt-1">
                        {detail(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden" aria-label={caption}>
        {sorted.map((row) => {
          const key = rowKey(row);
          const expanded = open.has(key);
          return (
            <li key={key} className={`p-3 ${cardClass}`}>
              <dl className="space-y-1.5 text-dense">
                {columns.map((c, i) => (
                  <div key={c.key} className={i === 0 ? 'text-[14px] font-medium text-slate-900' : 'flex justify-between gap-3'}>
                    {i > 0 && <dt className="shrink-0 text-slate-500">{c.label}</dt>}
                    <dd className={cn(i > 0 && 'min-w-0 text-right text-slate-800')}>{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
              {detail && (
                <>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(key)}
                    className="mt-2 inline-flex h-8 items-center gap-1 rounded-control text-[13px] font-medium text-primary-700 focus-visible:outline-2 focus-visible:outline-primary-600"
                  >
                    <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} aria-hidden />
                    {expanded ? 'Hide evidence' : 'Evidence'}
                  </button>
                  {expanded && <div className="mt-1">{detail(row)}</div>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
