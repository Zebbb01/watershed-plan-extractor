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
 *   anything else           one retry, then reported as failed
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
  /** base64 JPEG of a page */
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

const OCR_BATCH = Math.min(8, LIMITS.ocrImages);
const MAX_RATE_RETRIES = 5;
const STRUCTURE_LIMIT = 3_000;

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
        worker(task)
          .catch((e) => {
            if (codeOf(e) === 'ABORTED' || signal.aborted) {
              failed = true;
              reject(abortError());
            }
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

  // 2. OCR for scanned pages
  const scanned = pages.filter((p) => p.flags.scanned).map((p) => p.n);
  const ocrPages: number[] = [];
  if (scanned.length) {
    const batches: number[][] = [];
    for (let i = 0; i < scanned.length; i += OCR_BATCH) batches.push(scanned.slice(i, i + OCR_BATCH));
    const replaced = new Map<number, PageModel>();
    let done = 0;
    progress({ stage: 'ocr', done, total: batches.length });
    await pool([...batches], () => limit, async (batch) => {
      const images = await Promise.all(batch.map(async (n) => ({ n, jpegBase64: await deps.renderPage(n) })));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await deps.ocr({ docId: input.doc.id, pages: images }, signal);
          addUsage(res.usage);
          for (const p of res.pages) if (batch.includes(p.n) && p.text.trim()) replaced.set(p.n, pageFromText(p.n, p.text));
          break;
        } catch (e) {
          const code = codeOf(e);
          if (code === 'ABORTED') throw e;
          if (code === 'RATE_LIMITED') {
            limit = Math.max(1, Math.floor(limit / 2));
            await sleep(((e as { retryAfter?: number }).retryAfter ?? 10) * 1000);
          }
        }
      }
      progress({ stage: 'ocr', done: ++done, total: batches.length });
    }, signal);
    pages = pages.map((p) => replaced.get(p.n) ?? p);
    ocrPages.push(...[...replaced.keys()].sort((a, b) => a - b));
  }

  // 3. Units
  const { units, skipped } = buildUnits(pages);
  const docOutline = buildOutline(pages);
  let nextIndex = units.length;
  let total = units.length;
  let done = 0;
  const results: ExtractResponse[] = [];
  const failedUnits: FailedUnit[] = [];
  const attempts = new Map<Unit, { rate: number; other: number }>();
  const queue = [...units];
  const fail = (u: Unit, error: string) => failedUnits.push({ index: u.index, pages: u.pages.map((p) => p.n), error });
  const partial = (): ExtractedReport => {
    const { report } = mergeUnits(results);
    return { summary: computeSummary(report).summary, ...report };
  };

  progress({ stage: 'extract', done, total });
  await pool(queue, () => limit, async (unit) => {
    const tries = attempts.get(unit) ?? { rate: 0, other: 0 };
    attempts.set(unit, tries);
    const images = await Promise.all(
      unit.imagePages.slice(0, LIMITS.unitImages).map(async (page) => ({ page, jpegBase64: await deps.renderPage(page) })),
    );
    const req: ExtractRequest = {
      docId: input.doc.id,
      unit: {
        index: unit.index,
        pages: unit.pages,
        context: {
          title: input.doc.title,
          outline: docOutline.slice(0, 8_000),
          totalPages: raw.length,
          hints: regexHints(unit.pages.map((p) => p.markup).join('\n')).map((h) => h.slice(0, 200)),
        },
      },
      images,
    };
    try {
      const res = await deps.extract(req, signal);
      results.push(res);
      addUsage(res.usage);
      progress({ stage: 'extract', done: ++done, total, partial: partial() });
    } catch (e) {
      const code = codeOf(e);
      if (code === 'ABORTED') throw e;
      if (code === 'RATE_LIMITED' && tries.rate < MAX_RATE_RETRIES) {
        tries.rate++;
        limit = Math.max(1, Math.floor(limit / 2));
        await sleep(((e as { retryAfter?: number }).retryAfter ?? 10) * 1000);
        queue.push(unit);
        return;
      }
      if (code === 'TIMEOUT' || code === 'OUTPUT_TRUNCATED') {
        const halves = splitUnit(unit);
        if (halves) {
          for (const h of halves) h.index = nextIndex++;
          queue.push(...halves);
          total += 1; // one unit became two
          progress({ stage: 'extract', done, total });
          return;
        }
      } else if (tries.other < 1) {
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
