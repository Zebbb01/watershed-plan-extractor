'use client';

import { Info } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { ReactNode } from 'react';

/** Detail on demand: a small "i" that opens one short explanation. */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-grid size-5 place-items-center rounded-full text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <Info className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-panel border border-slate-200 bg-white p-3 text-[13px] leading-5 text-slate-700 shadow-overlay"
        >
          {children}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
