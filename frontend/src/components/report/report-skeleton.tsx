import { Skeleton } from '@/components/ui/skeleton';

/** The report's shape while it opens: title, tabs, tiles and a chart. */
export function ReportSkeleton() {
  return (
    <div role="status" aria-label="Opening the report" className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <Skeleton className="h-8 w-2/3 max-w-lg" />
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-card" />
    </div>
  );
}
