'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/*
 * A thin bar at the top while a link opens another page, so every click shows it was taken.
 * It runs from the click until the new page renders and fakes no percentage.
 */
export function RouteProgress() {
  const path = usePathname();
  // The path a navigation left from; the bar shows until the path changes.
  const [from, setFrom] = useState<string | null>(null);
  const [seen, setSeen] = useState(path);
  if (seen !== path) {
    setSeen(path);
    setFrom(null);
  }

  useEffect(() => {
    // Capture phase: Next's Link cancels the browser's default before a bubbling listener would see it.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setFrom(window.location.pathname);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary-100', from === null && 'hidden')}>
      <div className="route-progress h-full w-1/3 rounded-full bg-primary-600" />
    </div>
  );
}
