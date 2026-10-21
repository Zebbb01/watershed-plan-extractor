import type { ExtractedReport, ExtractionResult, Progress } from '@app/backend';
import { readErrorMessage } from './pdf/validate';
import { extractFile, type Health, type Prepared } from './run-extraction';
import { session } from './session';

/*
 * The extraction running in this tab. It lives outside React, so moving between pages does
 * not stop it: the home page shows its progress and the header shows where it stands from
 * anywhere. Only Stop or closing the tab ends it, and the browser asks before the tab closes.
 * One run at a time keeps the model calls, and the bill, predictable.
 */

export interface RunState {
  read?: { done: number; total: number };
  ocr?: { done: number; total: number };
  extract?: { done: number; total: number };
  merging?: boolean;
  partial?: ExtractedReport;
}

export function reduceProgress(s: RunState, p: Progress): RunState {
  if (p.stage === 'read') return { ...s, read: { done: p.done, total: p.total } };
  if (p.stage === 'ocr') return { ...s, ocr: { done: p.done, total: p.total } };
  if (p.stage === 'extract') return { ...s, extract: { done: p.done, total: p.total }, partial: p.partial ?? s.partial };
  return { ...s, merging: true };
}

interface RunInfo {
  id: string;
  fileName: string;
  pages: number;
  /** when the run began, so the time estimate survives leaving the page and coming back */
  startedAt: number;
  state: RunState;
}
export type ActiveRun =
  | (RunInfo & { status: 'running' })
  | (RunInfo & { status: 'done' })
  | (RunInfo & { status: 'failed'; error: string });

export type ExtractFn = typeof extractFile;

const PDF_ERRORS = new Set(['PasswordException', 'InvalidPDFException', 'MissingPDFException']);
/** A reading problem gets the PDF's own explanation; anything else says the run stopped, and why when known. */
function runError(e: unknown): string {
  if (PDF_ERRORS.has((e as { name?: string } | null)?.name ?? '')) return readErrorMessage(e);
  const message = (e as { message?: string } | null)?.message;
  return message ? `The extraction stopped: ${message}` : 'The extraction stopped unexpectedly.';
}

let current: ActiveRun | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();
const set = (next: ActiveRun | null) => {
  current = next;
  for (const l of listeners) l();
};
const warnBeforeClosing = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = '';
};

export const activeRun = {
  get: (): ActiveRun | null => current,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Runs a prepared file to the end; resolves with the result, rejects when it fails or is stopped. */
  async start(prepared: Prepared & { doc: NonNullable<Prepared['doc']> }, health: Health, extract: ExtractFn = extractFile): Promise<ExtractionResult> {
    if (current?.status === 'running') throw new Error('An extraction is already running in this tab.');
    const own = new AbortController();
    controller = own;
    const info = { id: prepared.id, fileName: prepared.fileName, pages: prepared.doc.numPages, startedAt: Date.now() };
    set({ status: 'running', ...info, state: {} });
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', warnBeforeClosing);
    try {
      const result = await extract(
        prepared,
        (p) => {
          if (current?.status === 'running' && current.id === info.id) set({ ...current, state: reduceProgress(current.state, p) });
        },
        own.signal,
        health,
      );
      session.put(result, prepared.doc);
      set({ status: 'done', ...info, state: current?.state ?? {} });
      return result;
    } catch (e) {
      if (own.signal.aborted) set(null);
      else set({ status: 'failed', ...info, state: current?.state ?? {}, error: runError(e) });
      throw e;
    } finally {
      if (controller === own) controller = null;
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', warnBeforeClosing);
    }
  },

  /** Stops the run in flight; nothing from it is kept. */
  stop() {
    controller?.abort();
  },

  /** Clears a finished or failed run once its result has been opened or its error shown. */
  dismiss() {
    if (current?.status !== 'running') set(null);
  },
};
