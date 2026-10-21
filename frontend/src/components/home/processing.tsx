'use client';

import { CATEGORY_KEYS } from '@app/backend';
import { Check, LoaderCircle, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { RunState } from '@/lib/active-run';
import { CATEGORY_UI } from '@/lib/categories-ui';
import { cn } from '@/lib/cn';

type StepState = 'done' | 'active' | 'waiting';

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full border',
          state === 'done' && 'border-positive-600 bg-positive-600 text-white',
          state === 'active' && 'border-primary-500 text-primary-600',
          state === 'waiting' && 'border-slate-300 text-slate-300',
        )}
      >
        {state === 'done' ? <Check className="size-3.5" aria-hidden /> : state === 'active' ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
      </span>
      <span className={cn('text-[14px]', state === 'waiting' ? 'text-slate-400' : 'text-slate-900')}>{label}</span>
      {detail && <span className="tabular ml-auto text-[13px] text-slate-500">{detail}</span>}
    </li>
  );
}

/** Live progress of a run: steps with counts, items found so far, time left, and Stop (confirmed first). */
export function Processing({
  fileName,
  pages,
  startedAt,
  state,
  onStop,
}: {
  fileName: string;
  pages: number;
  startedAt: number;
  state: RunState;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ex = state.extract;
  let eta: string | undefined;
  if (ex && ex.done >= 3 && ex.done < ex.total) {
    const perUnit = (now - startedAt) / ex.done;
    const mins = Math.ceil(((ex.total - ex.done) * perUnit) / 60_000);
    eta = mins <= 1 ? 'about a minute left' : `about ${mins} min left`;
  }
  const readDone = state.read && state.read.done === state.read.total;
  const ocrDone = !state.ocr || state.ocr.done === state.ocr.total;
  const exDone = ex && ex.done === ex.total;
  const stage = !readDone ? 'Reading pages' : !ocrDone ? 'Reading scanned pages' : !exDone ? 'Extracting' : 'Checking and merging';

  return (
    <section aria-labelledby="run-title" className="rounded-panel border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id="run-title" className="truncate text-[15px] font-semibold text-slate-900">
            {fileName}
          </h2>
          <p className="text-[13px] text-slate-500">{pages} pages</p>
        </div>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          <Square className="size-3 fill-current" aria-hidden />
          Stop
        </Button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Stop this extraction?"
          description="The sections finished so far are discarded, and nothing is saved. You can start the file again later."
          cancel="Keep running"
          confirm="Stop extraction"
          onConfirm={onStop}
        />
      </div>
      <div className="grid gap-6 px-4 py-4 md:grid-cols-[1fr_1.2fr]">
        <ol aria-label="Progress">
          <Step state={readDone ? 'done' : 'active'} label="Read pages" detail={state.read ? `${state.read.done} / ${state.read.total}` : undefined} />
          {state.ocr && <Step state={ocrDone ? 'done' : 'active'} label="Read scanned pages" detail={`${state.ocr.done} / ${state.ocr.total} batches`} />}
          <Step state={exDone ? 'done' : readDone && ocrDone ? 'active' : 'waiting'} label="Extract sections" detail={ex ? `${ex.done} / ${ex.total}${eta ? ` · ${eta}` : ''}` : undefined} />
          <Step state={state.merging ? 'active' : 'waiting'} label="Check and merge" />
        </ol>
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Found so far</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORY_KEYS.map((k) => {
              const ui = CATEGORY_UI[k];
              return (
                <li key={k} className="flex items-center justify-between rounded-control border border-slate-200 px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] text-slate-600">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: ui.color }} />
                    {ui.label}
                  </span>
                  <span className="tabular text-[14px] font-semibold text-slate-900">{state.partial?.[k].length ?? 0}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {stage}
      </p>
    </section>
  );
}
