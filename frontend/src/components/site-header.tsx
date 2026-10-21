'use client';

import { Droplets, Menu, Upload } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { RunIndicator } from './run-indicator';
import { UploadButton } from './upload-button';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/#samples', label: 'Samples' },
  { href: '/accuracy', label: 'Accuracy' },
  { href: '/how-it-works', label: 'How it works' },
];

/** The same way around from every page: the sections, any running extraction, and Upload, which opens the file picker. */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href.includes('#') ? false : href === path);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-control font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-panel bg-primary-600 text-white shadow-[0_2px_6px_-1px_rgb(29_99_181/0.45)]">
            <Droplets className="size-4" aria-hidden />
          </span>
          <span className="truncate text-[15px] tracking-tight">Watershed Plan Extractor</span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? 'page' : undefined}
              className={cn(
                'rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary-600',
                active(l.href) ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <RunIndicator />
          <UploadButton>
            <Upload className="size-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">Upload PDF</span>
          </UploadButton>
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger aria-label="Menu" className={buttonClass('ghost', 'md', 'size-9 px-0 md:hidden')}>
              <Menu className="size-5" aria-hidden />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="z-50 w-56 rounded-card border border-slate-200 bg-white p-1.5 shadow-overlay">
                <nav aria-label="Main" className="flex flex-col">
                  {LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(l.href) ? 'page' : undefined}
                      className={cn(
                        'rounded-control px-3 py-2.5 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                        active(l.href) ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </header>
  );
}
