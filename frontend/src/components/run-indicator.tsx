'use client';

import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { activeRun } from '@/lib/active-run';
import { cn } from '@/lib/cn';

const PILL = 'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-primary-600';

/** Where the tab's extraction stands, from any page: running, ready to open, or stopped. */
export function RunIndicator() {
  const run = useSyncExternalStore(activeRun.subscribe, activeRun.get, () => null);
  const path = usePathname();
  // The home page shows the run in full; the header only needs it elsewhere.
  if (!run || path === '/') return null;

  if (run.status === 'running') {
    const ex = run.state.extract;
    return (
      <Link href="/" className={cn(PILL, 'border-primary-100 bg-primary-50 text-primary-700 hover:bg-primary-100')}>
        <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
        <span>
          Extracting<span className="hidden sm:inline">{ex ? ` · ${ex.done}/${ex.total}` : '…'}</span>
        </span>
      </Link>
    );
  }
  if (run.status === 'done') {
    return (
      <Link
        href={`/report/${run.id}`}
        onClick={() => activeRun.dismiss()}
        className={cn(PILL, 'border-positive-100 bg-positive-50 text-positive-700 hover:bg-positive-100')}
      >
        <CircleCheck className="size-3.5" aria-hidden />
        Report ready
      </Link>
    );
  }
  return (
    <Link href="/" className={cn(PILL, 'border-negative-100 bg-negative-50 text-negative-700 hover:bg-negative-100')}>
      <CircleAlert className="size-3.5" aria-hidden />
      Extraction stopped
    </Link>
  );
}
