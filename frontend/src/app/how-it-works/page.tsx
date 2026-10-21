import { FileSearch, Layers, ListChecks, ScanText, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { Shapes } from '@/components/ui/shapes';

export const metadata: Metadata = { title: 'How it works' };

const STEPS: { icon: LucideIcon; title: string; line: string; by: 'Code' | 'AI' }[] = [
  { icon: FileSearch, title: 'Read the PDF in your browser', line: 'Text with positions and page images. A large file is never uploaded.', by: 'Code' },
  { icon: Layers, title: 'Rebuild the layout', line: 'Columns, headings, bullet levels and tables. Headers, contents pages and references are set aside.', by: 'Code' },
  { icon: ScanText, title: 'Read scanned pages', line: 'Pages without a text layer are transcribed, then go through the same steps.', by: 'AI' },
  { icon: Sparkles, title: 'Extract a few pages at a time', line: 'Into a strict schema, with a quote from the page for every item.', by: 'AI' },
  { icon: ShieldCheck, title: 'Check every item', line: 'Quote, names and amounts must be on the page. Anything else is rejected, never shown.', by: 'Code' },
  { icon: ListChecks, title: 'Merge and count', line: 'Duplicates joined, conflicting amounts flagged, totals computed, never estimated.', by: 'Code' },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-primary-100/80 bg-primary-50/70">
        <Shapes />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-slate-900">How it works</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-slate-600">Code and an AI model each do the part they are reliable at. The AI reads; code checks and counts.</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`${cardClass} p-5`}>
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-full bg-primary-50 text-primary-600">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.by === 'AI' ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>{s.by}</span>
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-slate-900">
                <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                {s.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{s.line}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link href="/#upload" className={buttonClass('primary', 'lg')}>
            Upload a PDF
          </Link>
          <Link href="/#samples" className={buttonClass('secondary', 'lg')}>
            Open a sample
          </Link>
          <Link href="/accuracy" className={buttonClass('link', 'lg')}>
            See how accuracy is measured
          </Link>
        </div>
      </div>
    </>
  );
}
