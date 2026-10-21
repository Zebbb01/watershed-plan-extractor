import { LIMITS, type ErrorCode, type ExtractRequest, type ExtractResponse, type OcrRequest, type OcrResponse } from './api';
import { annotateDocument, outline as buildOutline } from './layout/document';
import { buildPageModel, type PageModel } from './layout/page-model';
import { pageFromText } from './layout/text-page';
import { mergeUnits } from './merge';
import type { DocumentInfo, ExtractedReport, ExtractionResult, FailedUnit, RawPage, StructureLine, Usage } from './schema';
import { computeSummary } from './summary';
import { buildUnits, regexHints, splitUnit, type Unit } from './units';

/*
 * Runs a whole document: layout, OCR for scanned pages, then many small extraction calls in
 * parallel. The same function runs in the browser (deps call the API routes) and in the eval
 * CLI (deps call the handlers directly), so the accuracy numbers measure what ships.
 *
 * Failure handling, per unit:
 *   RATE_LIMITED            wait retry-after, halve parallelism, try again
 *   TIMEOUT / OUTPUT_TRUNCATED  split into halves; a single page that still fails is reported
 *   anything else           two retries, then reported as failed
 */

export interface Progress {
  stage: 'read' | 'ocr' | 'extract' | 'verify' | 'done';
  done: number;
  total: number;
  partial?: ExtractedReport;
}

export interface PipelineDeps {
  extract(req: ExtractRequest, signal: AbortSignal): Promise<ExtractResponse>;
  ocr(req: OcrRequest, signal: AbortSignal): Promise<OcrResponse>;
  /** base64 JPEG of a page, or '' when the image comes out blank (nothing to read, nothing to pay for) */
  renderPage(n: number): Promise<string>;
  onProgress?(p: Progress): void;
  sleep?(ms: number): Promise<void>;
}

export interface PipelineOptions {
  concurrency?: number;
  signal?: AbortSignal;
  maxPages?: number;
  provider?: string;
  model?: string;
}

// Two pages per OCR call: a page's transcript is long, and every call must finish inside the
// host's time limit. A batch that still times out is read one page at a time.
const OCR_BATCH = Math.min(2, LIMITS.ocrImages);
const MAX_RATE_RETRIES = 5;
const STRUCTURE_LIMIT = 3_000;

interface Tries {
  rate: number;
  other: number;
}

/** After a failed call: wait out a rate limit, split work that was too big, retry twice, or give up. */
function nextStep(code: ErrorCode | 'ABORTED', tries: Tries, canSplit: boolean): 'wait' | 'split' | 'retry' | 'fail' {
  if (code === 'RATE_LIMITED' && tries.rate < MAX_RATE_RETRIES) return 'wait';
  if (code === 'TIMEOUT' || code === 'OUTPUT_TRUNCATED' || code === 'INPUT_TOO_LARGE') return canSplit ? 'split' : 'fail';
  // Two retries: networks drop connections now and then, and a failed call is rarely billed.
  if (code !== 'RATE_LIMITED' && tries.other < 2) return 'retry';
  return 'fail';
}

const codeOf = (e: unknown): ErrorCode | 'ABORTED' => {
  if (e && typeof e === 'object') {
    if ((e as { name?: string }).name === 'AbortError') return 'ABORTED';
    const code = (e as { code?: string }).code;
    if (code) return code as ErrorCode;
  }
  return 'UPSTREAM_ERROR';
};
const abortError = () => Object.assign(new Error('The extraction was cancelled.'), { name: 'AbortError' });

/** Runs `worker` over a growing queue with at most `limit()` tasks in flight. */
function pool<T>(queue: T[], limit: () => number, worker: (t: T) => Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let active = 0;
    let failed = false;
    const pump = () => {
      if (failed) return;
      if (signal.aborted) {
        failed = true;
        reject(abortError());
        return;
      }
      if (!queue.length && active === 0) return resolve();
      while (active < limit() && queue.length) {
        const task = queue.shift()!;
        active++;
        // Workers handle their own failures; anything that still escapes stops the run loudly
        // rather than losing a section without a trace.
        worker(task)
          .catch((e) => {
            failed = true;
            reject(codeOf(e) === 'ABORTED' || signal.aborted ? abortError() : e);
          })
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    signal.addEventListener('abort', pump, { once: true });
    pump();
  });
}

export async function runPipeline(
  input: { doc: DocumentInfo; rawPages: RawPage[] },
  deps: PipelineDeps,
  opts: PipelineOptions = {},
): Promise<ExtractionResult> {
  const started = Date.now();
  const signal = opts.signal ?? new AbortController().signal;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const progress = (p: Progress) => deps.onProgress?.(p);
  let limit = Math.max(1, opts.concurrency ?? 4);
  const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const addUsage = (u: Usage) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.costUsd = usage.costUsd === null || u.costUsd === null ? null : usage.costUsd + u.costUsd;
  };

  // 1. Layout
  const raw = input.rawPages.slice(0, opts.maxPages ?? input.rawPages.length);
  let pages: PageModel[] = annotateDocument(raw.map(buildPageModel));
  progress({ stage: 'read', done: pages.length, total: pages.length });

  const failedUnits: FailedUnit[] = [];
  const wait = async (e: unknown) => {
    limit = Math.max(1, Math.floor(limit / 2));
    await sleep(((e as { retryAfter?: number }).retryAfter ?? 10) * 1000);
  };

  // 2. OCR for scanned pages
  const scanned = pages.filter((p) => p.flags.scanned).map((p) => p.n);
  const ocrPages: number[] = [];
  if (scanned.length) {
    const jobs: { pages: number[]; tries: Tries }[] = [];
    for (let i = 0; i < scanned.length; i += OCR_BATCH) jobs.push({ pages: scanned.slice(i, i + OCR_BATCH), tries: { rate: 0, other: 0 } });
    const replaced = new Map<number, PageModel>();
    const blank = new Set<number>();
    let done = 0;
    let total = jobs.length;
    progress({ stage: 'ocr', done, total });
    await pool(jobs, () => limit, async (job) => {
      try {
        const rendered = await Promise.all(job.pages.map(async (n) => ({ n, jpegBase64: await deps.renderPage(n) })));
        for (const r of rendered.filter((r) => !r.jpegBase64)) {
          blank.add(r.n);
          replaced.set(r.n, pageFromText(r.n, ''));
        }
        const images = rendered.filter((r) => r.jpegBase64);
        if (images.length) {
          const res = await deps.ocr({ docId: input.doc.id, pages: images }, signal);
          addUsage(res.usage);
          for (const p of res.pages) if (job.pages.includes(p.n) && p.text.trim()) replaced.set(p.n, pageFromText(p.n, p.text));
        }
      } catch (e) {
        const code = codeOf(e);
        if (code === 'ABORTED') throw e;
        const step = nextStep(code, job.tries, job.pages.length > 1);
        if (step === 'wait') {
          job.tries.rate++;
          await wait(e);
          jobs.push(job);
          return;
        }
        if (step === 'split') {
          jobs.push(...job.pages.map((n) => ({ pages: [n], tries: { rate: 0, other: 0 } })));
          total += job.pages.length - 1;
          progress({ stage: 'ocr', done, total });
          return;
        }
        if (step === 'retry') {
          job.tries.other++;
          jobs.push(job);
          return;
        }
        // These pages stay unread: reported as a failed section, not only as skipped pages.
        failedUnits.push({ index: -1, pages: job.pages, error: code });
      }
      progress({ stage: 'ocr', done: ++done, total });
    }, signal);
    // Transcribed pages go through the document-level clean-up too: running heads, contents pages, admin sections.
    pages = annotateDocument(pages.map((p) => replaced.get(p.n) ?? p));
    ocrPages.push(...[...replaced.keys()].filter((n) => !blank.has(n)).sort((a, b) => a - b));
  }

  // 3. Units
  const { units, skipped } = buildUnits(pages);
  const docOutline = buildOutline(pages);
  let nextIndex = units.length;
  let total = units.length;
  let done = 0;
  const results: ExtractResponse[] = [];
  const attempts = new Map<Unit, Tries>();
  const queue = [...units];
  const fail = (u: Unit, error: string) => failedUnits.push({ index: u.index, pages: u.pages.map((p) => p.n), error });
  const partial = (): ExtractedReport => {
    const { report } = mergeUnits(results);
    return { summary: computeSummary(report).summary, ...report };
  };
  // A partial report is a full merge, so long documents send one about every 5% of units.
  const wantPartial = () => done === total || done % Math.max(1, Math.ceil(total / 20)) === 0;

  progress({ stage: 'extract', done, total });
  await pool(queue, () => limit, async (unit) => {
    const tries = attempts.get(unit) ?? { rate: 0, other: 0 };
    attempts.set(unit, tries);
    try {
      const images = await Promise.all(
        unit.imagePages.slice(0, LIMITS.unitImages).map(async (page) => ({ page, jpegBase64: await deps.renderPage(page) })),
      ).then((all) => all.filter((i) => i.jpegBase64));
      const req: ExtractRequest = {
        docId: input.doc.id,
        unit: {
          index: unit.index,
          pages: unit.pages,
          context: {
            title: input.doc.title?.slice(0, 200) ?? null,
            outline: docOutline.slice(0, 8_000),
            totalPages: raw.length,
            hints: regexHints(unit.pages.map((p) => p.markup).join('\n')).map((h) => h.slice(0, 200)),
          },
        },
        images,
      };
      const res = await deps.extract(req, signal);
      results.push(res);
      addUsage(res.usage);
      done++;
      progress({ stage: 'extract', done, total, ...(wantPartial() ? { partial: partial() } : {}) });
    } catch (e) {
      const code = codeOf(e);
      if (code === 'ABORTED') throw e;
      const halves = code === 'TIMEOUT' || code === 'OUTPUT_TRUNCATED' || code === 'INPUT_TOO_LARGE' ? splitUnit(unit) : null;
      const step = nextStep(code, tries, halves !== null);
      if (step === 'wait') {
        tries.rate++;
        await wait(e);
        queue.push(unit);
        return;
      }
      if (step === 'split') {
        for (const h of halves!) h.index = nextIndex++;
        queue.push(...halves!);
        total += 1; // one unit became two
        progress({ stage: 'extract', done, total });
        return;
      }
      if (step === 'retry') {
        tries.other++;
        queue.push(unit);
        return;
      }
      fail(unit, code);
      progress({ stage: 'extract', done: ++done, total });
    }
  }, signal);

  // 4. Merge and summarise
  progress({ stage: 'verify', done: 0, total: 1 });
  const merged = mergeUnits(results);
  const { summary, completionBasis } = computeSummary(merged.report);
  const shown = Object.values(merged.report).reduce((s, items) => s + items.length, 0);
  const extractedPages = new Set(results.flatMap((r) => Object.values(r.items).flat().flatMap((i) => i.evidence.map((e) => e.page))));
  const unitPages = units.flatMap((u) => u.pages.map((p) => p.n));
  const structure: StructureLine[] = pages
    .flatMap((p) => p.lines.map((l) => ({ page: p.n, kind: l.kind, level: l.level, text: l.text })))
    .slice(0, STRUCTURE_LIMIT);

  progress({ stage: 'done', done: 1, total: 1 });
  return {
    report: { summary, ...merged.report },
    document: { ...input.doc, pages: input.rawPages.length },
    quality: {
      verifiedRate: shown + merged.rejected.length ? shown / (shown + merged.rejected.length) : 1,
      rejected: merged.rejected,
      conflicts: merged.conflicts,
      ocrPages,
      skippedPages: skipped,
      emptyPages: unitPages.filter((n) => !extractedPages.has(n)).sort((a, b) => a - b),
      failedUnits,
      provider: opts.provider ?? 'unknown',
      model: opts.model ?? 'unknown',
      durationMs: Date.now() - started,
      usage,
      completionBasis,
      structure,
    },
  };
}
