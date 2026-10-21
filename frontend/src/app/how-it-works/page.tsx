import { FileSearch, Layers, ListChecks, ListTree, ScanText, ShieldCheck, Sparkles, Upload, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { Shapes } from '@/components/ui/shapes';
import { UploadButton } from '@/components/upload-button';
import accuracy from '@/data/accuracy.json';
import { cn } from '@/lib/cn';
import costsShot from './shots/costs.webp';
import evidenceShot from './shots/evidence.webp';
import rejectedShot from './shots/rejected.webp';
import structureShot from './shots/structure.webp';

export const metadata: Metadata = { title: 'How it works' };

const STEPS: { icon: LucideIcon; title: string; line: string; ai?: boolean }[] = [
  { icon: FileSearch, title: 'Read the PDF in your browser', line: 'Text with positions, and images of table or scanned pages. The file itself is never uploaded.' },
  { icon: Layers, title: 'Rebuild the layout', line: 'Columns, headings, list levels and tables. Headers, contents pages and references are set aside.' },
  { icon: ScanText, title: 'Read scanned pages', line: 'Pages without a text layer are transcribed, then go through the same steps.', ai: true },
  { icon: Sparkles, title: 'Extract a few pages at a time', line: 'Into a strict schema, with a quote from the page for every item.', ai: true },
  { icon: ShieldCheck, title: 'Check every item', line: 'Quote, names and amounts must be on the page. Anything else is rejected.' },
  { icon: ListChecks, title: 'Merge and count', line: 'Duplicates joined, conflicting amounts flagged, totals computed, never estimated.' },
];

// From the smoke test of the largest plan in TESTING.md.
const LONGEST = { pages: 647, minutes: 9, cost: '$0.55' };

export default function HowItWorksPage() {
  const scored = accuracy.aggregate.all;
  return (
    <>
      <section className="relative overflow-hidden border-b border-primary-100/80 bg-primary-50/70">
        <Shapes />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-12">
          <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-slate-900">How it works</h1>
          <p className="mt-2 max-w-2xl text-balance text-[15px] text-slate-600">
            Code and an AI model each do the part they are reliable at. The AI reads; code checks and counts.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section aria-labelledby="steps-title" className={cn(cardClass, 'relative -mt-16 p-2')}>
          <h2 id="steps-title" className="sr-only">
            Six steps from PDF to report
          </h2>
          <Pipeline />
        </section>

        <div className="space-y-20 py-20">
          <Feature
            eyebrow="Layout"
            title="It reads the page the way you do"
            shot={structureShot}
            alt="Page 8 of the Broken Pumpkin plan as read: each line tagged as a heading, numbered item, table row, text or skipped header"
            fade
            eager
          >
            Before the AI sees anything, code rebuilds each page from the text positions: columns, headings, list levels and table rows. Running headers,
            contents pages and references are set aside.
          </Feature>
          <Feature
            eyebrow="Evidence"
            title="Every item points to its page"
            shot={evidenceShot}
            alt="Page 4 of the Broken Pumpkin plan beside the results, with the Cover Crop row of its cost table highlighted"
            flip
            fade
          >
            Each item keeps its page number and the exact words it came from. Compare with PDF puts that page beside the results with the words marked, and
            lists everything else found on it.
          </Feature>
        </div>
      </div>

      <section className="border-y border-slate-200/70 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Checks</Eyebrow>
            <Title>What it can&apos;t prove is left out</Title>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Code checks every proposed item against the PDF text. The quote must be on the page, and names and amounts must be written there as given.
              Anything that fails is listed with its reason under Quality, never shown as data.
            </p>
            {scored && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-positive-50 px-3 py-1 text-[13px] font-medium text-positive-700 ring-1 ring-positive-100">
                <ShieldCheck className="size-4" aria-hidden />
                {scored.verbatimViolations} names not in the PDF across {scored.docs} scored plans
              </p>
            )}
          </div>
          <Shot
            shot={rejectedShot}
            alt="Items from the Bell Creek plan rejected by the checks, each with its page and the reason it was removed"
            className="mt-10"
            fade
          />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-4 py-20 sm:px-6">
        <Feature
          eyebrow="Totals"
          title="Totals are counted, not guessed"
          shot={costsShot}
          alt="Estimated BMP costs for the Broken Pumpkin plan: the largest 8 of 32 practices, $1,724,605 in total as stated"
        >
          Charts and totals are added up in code from the amounts written in the plan. When two pages give different amounts for the same practice, the item
          is flagged for review.
        </Feature>

        <section className="grid items-center gap-x-14 gap-y-8 lg:grid-cols-[5fr_7fr]">
          <div>
            <Eyebrow>Long plans</Eyebrow>
            <Title>Hundreds of pages, a few at a time</Title>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Each request carries the plan&apos;s outline and at most three pages, so a long plan becomes many small requests instead of one long prompt.
              Every item is still checked against its own page.
            </p>
          </div>
          <div className={cn(cardClass, 'min-w-0 p-5 sm:p-6')}>
            <div aria-hidden className="flex gap-2.5 overflow-hidden p-px [mask-image:linear-gradient(to_right,#000_55%,transparent)]">
              {[0, 1, 2, 3, 4, 5].map((g) => (
                <span key={g} className="flex shrink-0 items-end gap-1 rounded-panel bg-primary-50 p-1.5 ring-1 ring-primary-100">
                  <ListTree className="mb-0.5 size-3.5 text-primary-600" />
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="h-9 w-7 rounded-[3px] bg-white ring-1 ring-primary-200" />
                  ))}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-slate-500">One request: the outline and up to three pages</p>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5">
              <Stat value={String(LONGEST.pages)} label="pages in the largest plan tested" />
              <Stat value={`${LONGEST.minutes} min`} label="to read and check it" />
              <Stat value={LONGEST.cost} label="AI cost for that run" />
            </dl>
          </div>
        </section>
      </div>

      <section className="relative overflow-hidden border-t border-primary-100/80 bg-primary-50/70">
        <Shapes />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Title>Try it on a plan</Title>
          <p className="mt-2 text-[15px] text-slate-600">Upload a PDF, or open a sample to see a finished report first.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <UploadButton className={buttonClass('primary', 'lg')}>
              <Upload className="size-4" aria-hidden />
              Upload a PDF
            </UploadButton>
            <Link href="/#samples" className={buttonClass('secondary', 'lg')}>
              Open a sample
            </Link>
            <Link href="/accuracy" className={buttonClass('link', 'lg')}>
              See the accuracy results
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** The six steps on one track, with the two the AI does on a tinted band; a list down the side on narrow screens. */
function Pipeline() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute inset-y-0 left-1/3 hidden w-1/3 rounded-panel bg-primary-50 lg:block" />
      <div aria-hidden className="relative hidden grid-cols-3 lg:grid">
        {['Code', 'AI model', 'Code'].map((label, i) => (
          <span key={i} className={cn('px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider', i === 1 ? 'text-primary-700' : 'text-slate-500')}>
            {label}
          </span>
        ))}
      </div>
      <ol className="relative grid lg:grid-cols-6">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className={cn(
              'relative flex gap-3 px-4 py-3 lg:flex-col lg:pb-5',
              // The line to the next step: down the side, or across on wide screens.
              'after:absolute after:-bottom-2 after:left-[35px] after:top-14 after:w-0.5 after:bg-slate-300 last:after:hidden',
              'lg:after:-right-3 lg:after:bottom-auto lg:after:left-[60px] lg:after:top-[31px] lg:after:h-0.5 lg:after:w-auto',
            )}
          >
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full',
                s.ai ? 'bg-primary-600 text-white shadow-[0_2px_6px_-1px_rgb(29_99_181/0.45)]' : 'bg-white text-slate-700 ring-1 ring-slate-300',
              )}
            >
              <s.icon className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold leading-snug text-slate-900">
                <span className="tabular mr-1 text-slate-400">{i + 1}.</span>
                {s.title}
                <span className="sr-only">{s.ai ? ', by the AI model' : ', by code'}</span>
                <span
                  aria-hidden
                  className={cn(
                    'ml-2 inline-block rounded-full px-1.5 align-[1px] text-[10px] font-semibold uppercase tracking-wide lg:hidden',
                    s.ai ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {s.ai ? 'AI model' : 'Code'}
                </span>
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{s.line}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Feature({
  eyebrow,
  title,
  shot,
  alt,
  flip = false,
  fade = false,
  eager = false,
  children,
}: {
  eyebrow: string;
  title: string;
  shot: StaticImageData;
  alt: string;
  flip?: boolean;
  fade?: boolean;
  eager?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn('grid items-center gap-x-14 gap-y-8', flip ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]')}>
      <div className={cn(flip && 'lg:order-2')}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{children}</p>
      </div>
      <Shot shot={shot} alt={alt} fade={fade} eager={eager} className={cn(flip && 'lg:order-1')} />
    </section>
  );
}

/** A real screen from a sample report, on a soft offset panel. */
function Shot({ shot, alt, fade = false, eager = false, className }: { shot: StaticImageData; alt: string; fade?: boolean; eager?: boolean; className?: string }) {
  return (
    // Captured at twice the size it is shown, so it stays sharp; never shown larger than that.
    <figure className={cn('relative mx-auto w-full', className)} style={{ maxWidth: shot.width / 2 }}>
      <span aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 rounded-card bg-primary-100" />
      <div className="relative overflow-hidden rounded-card bg-white shadow-card ring-1 ring-slate-200/70">
        <Image src={shot} alt={alt} unoptimized loading={eager ? 'eager' : 'lazy'} className={cn('h-auto w-full', fade && '[mask-image:linear-gradient(to_bottom,#000_78%,transparent)]')} />
      </div>
    </figure>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold uppercase tracking-wider text-primary-700">{children}</p>;
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="mt-2 text-balance text-[clamp(1.4rem,2.4vw,1.85rem)] font-semibold leading-tight tracking-tight text-slate-900">{children}</h2>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-0.5 text-[12px] leading-snug text-slate-500">{label}</dt>
      <dd className="tabular text-[22px] font-semibold tracking-tight text-slate-900">{value}</dd>
    </div>
  );
}
