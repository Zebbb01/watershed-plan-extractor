'use client';

import { categoryByKey, normalizeForMatch, type AnyItem, type CategoryKey } from '@app/backend';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Segmented } from '@/components/ui/segmented';
import { CATEGORY_UI } from '@/lib/categories-ui';

type KindFilter = 'all' | 'main' | 'sub' | 'example';

export function matchesSearch(item: AnyItem, query: string): boolean {
  if (!query) return true;
  const q = normalizeForMatch(query);
  return [item.name, item.text, ...item.evidence.map((e) => e.quote)].some((s) => normalizeForMatch(s).includes(q));
}

/** One category as a dense table: filters on its own row, evidence one click away. */
export function CategoryTab({
  category,
  items,
  search,
  onClearSearch,
  onEvidence,
}: {
  category: CategoryKey;
  items: AnyItem[];
  search: string;
  onClearSearch: () => void;
  onEvidence: (item: AnyItem) => void;
}) {
  const def = categoryByKey(category);
  const ui = CATEGORY_UI[category];
  const [kind, setKind] = useState<KindFilter>('all');
  const [reviewOnly, setReviewOnly] = useState(false);

  const kinds = useMemo(() => new Set(items.map((i) => i.kind)), [items]);
  const reviewCount = items.filter((i) => i.needsReview).length;
  const rows = items.filter((i) => (kind === 'all' || i.kind === kind) && (!reviewOnly || i.needsReview) && matchesSearch(i, search));
  const filtered = kind !== 'all' || reviewOnly || Boolean(search);

  const columns: Column<AnyItem>[] = [
    ...def.columns.map((c, idx) => ({
      key: c.key,
      label: c.label,
      align: c.align,
      className: idx === 0 ? 'min-w-56' : undefined,
      sortValue: (row: AnyItem) => {
        const v = c.get(row);
        return typeof v === 'number' ? v : v === null ? null : String(v).toLowerCase();
      },
      render: (row: AnyItem) => {
        const v = c.get(row);
        if (idx === 0) {
          return (
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-slate-900">{v}</span>
              {row.kind !== 'main' && <span className="text-[12px] text-slate-500">{row.kind === 'sub' ? 'Sub-item' : 'Example'}</span>}
            </span>
          );
        }
        return v === null || v === '' ? <span className="text-slate-300">—</span> : v;
      },
    })),
    {
      key: 'checks',
      label: 'Checks',
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.needsReview ? (
            <Badge tone="warning" icon={<TriangleAlert className="size-3" aria-hidden />}>
              Review
            </Badge>
          ) : row.confidence === 'high' ? (
            <Badge tone="positive">Verified</Badge>
          ) : (
            <Badge tone="warning">Medium</Badge>
          )}
        </span>
      ),
    },
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-slate-200 bg-white px-6 py-12 text-center">
        <ui.icon className="mx-auto size-6 text-slate-300" aria-hidden />
        <p className="mt-2 text-[15px] font-semibold text-slate-900">No {def.label.toLowerCase()} found in this document</p>
        <p className="mt-1 text-[13px] text-slate-500">Nothing on its pages passed the checks for this category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {kinds.size > 1 && (
          <Segmented
            label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All' },
              ...(kinds.has('main') ? [{ value: 'main' as const, label: 'Main' }] : []),
              ...(kinds.has('sub') ? [{ value: 'sub' as const, label: 'Sub-items' }] : []),
              ...(kinds.has('example') ? [{ value: 'example' as const, label: 'Examples' }] : []),
            ]}
          />
        )}
        {reviewCount > 0 && (
          <Button variant={reviewOnly ? 'primary' : 'secondary'} aria-pressed={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
            <TriangleAlert className="size-3.5" aria-hidden />
            Needs review · {reviewCount}
          </Button>
        )}
        <span className="tabular ml-auto text-[12px] text-slate-500">
          {rows.length} of {items.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-panel border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-slate-900">No {def.label.toLowerCase()} match these filters</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setKind('all');
              setReviewOnly(false);
              onClearSearch();
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <DataTable
          caption={`${def.label} extracted from the document`}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          detail={(row) => (
            <div className="space-y-2">
              {row.text && row.text !== row.name && <p className="text-[13px] text-slate-600">{row.text}</p>}
              <ul className="space-y-1.5">
                {row.evidence.map((e, i) => (
                  <li key={i} className="text-[13px] text-slate-700">
                    <span className="mr-2 font-semibold text-slate-500">p. {e.page}</span>“{e.quote}”
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="secondary" onClick={() => onEvidence(row)}>
                Show on page
              </Button>
            </div>
          )}
        />
      )}
      {filtered && rows.length > 0 && (
        <p className="text-[12px] text-slate-500">
          Filtered.{' '}
          <button
            type="button"
            className="font-medium text-primary-700 hover:underline"
            onClick={() => {
              setKind('all');
              setReviewOnly(false);
              onClearSearch();
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
  );
}
