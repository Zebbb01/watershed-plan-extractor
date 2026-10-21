'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonClass } from '@/components/ui/button';

/** A page that crashed while rendering: say so, offer a retry and a way home. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-negative-50 text-negative-600">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-[20px] font-semibold text-slate-900">Something went wrong on this page</h1>
      <p className="mt-1 text-[14px] text-slate-600">Your results are still saved in this browser. Try again, or start from the home page.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" size="lg" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          Try again
        </Button>
        <Link href="/" className={buttonClass('secondary', 'lg')}>
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
