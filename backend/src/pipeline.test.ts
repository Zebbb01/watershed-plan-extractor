import { describe, expect, it } from 'vitest';
import type { ExtractRequest, ExtractResponse, OcrRequest } from './api';
import type { BmpItem, DocumentInfo, RawPage, UnitItems } from './schema';
import { runPipeline, type PipelineDeps, type Progress } from './pipeline';

const doc: DocumentInfo = { id: 'doc1', fileName: 'plan.pdf', pages: 0, title: 'Test Plan', year: 2019 };
const textPage = (n: number, words = 'Cover crops and grade stabilization structures will reduce sediment loads by 77%.'): RawPage => ({
  n, width: 612, height: 792, hasImage: false,
  items: Array.from({ length: 30 }, (_, i) => ({ str: `${words} Line ${i} of page ${n}.`, x: 72, y: 100 + i * 14, w: 440, h: 11, font: 'f', bold: false })),
});
const scannedPage = (n: number): RawPage => ({ n, width: 612, height: 792, hasImage: true, items: [] });
const emptyItems = (): UnitItems => ({ goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] });
const ok = (req: ExtractRequest, items = emptyItems()): ExtractResponse => ({
  unitIndex: req.unit.index, items, rejected: [], usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.001 },
});
const bmp = (name: string, page: number): BmpItem => ({
  id: name, name, text: name, kind: 'main', parentId: null, evidence: [{ page, quote: name }], verified: true,
  confidence: 'high', source: 'text', needsReview: null, quantities: [], unitCost: null, estimatedCost: null, pollutants: [],
});
const deps = (overrides: Partial<PipelineDeps> = {}): PipelineDeps => ({
  extract: async (req) => ok(req),
  ocr: async (req: OcrRequest) => ({ pages: req.pages.map((p) => ({ n: p.n, text: `GOALS\nThe goal is to reduce sediment on page ${p.n}.` })), usage: { inputTokens: 5, outputTokens: 5, costUsd: null } }),
  renderPage: async (n) => `/9j/page${n}`,
  sleep: async () => {},
  ...overrides,
});
const pagesOf = (count: number) => Array.from({ length: count }, (_, i) => textPage(i + 1));
const tablePage = (n: number): RawPage => ({
  ...textPage(n),
  items: ['Cover Crops', 'Diversion', 'Fencing', 'Terraces'].flatMap((name, i) => [
    { str: name, x: 72, y: 300 + i * 14, w: 80, h: 11, font: 'f', bold: false },
    { str: 'ac', x: 250, y: 300 + i * 14, w: 12, h: 11, font: 'f', bold: false },
    { str: String(500 + i), x: 320, y: 300 + i * 14, w: 20, h: 11, font: 'f', bold: false },
    { str: '$55.86', x: 400, y: 300 + i * 14, w: 30, h: 11, font: 'f', bold: false },
  ]),
});
const ocrText = (req: OcrRequest) => ({
  pages: req.pages.map((p) => ({ n: p.n, text: `The goal is to reduce sediment loading on page ${p.n}.` })),
  usage: { inputTokens: 1, outputTokens: 1, costUsd: null },
});

describe('runPipeline', () => {
  it('never runs more than 4 extract calls at once and covers every page', async () => {
    let inflight = 0;
    let peak = 0;
    const seen: number[] = [];
    const result = await runPipeline({ doc, rawPages: pagesOf(60) }, deps({
      extract: async (req) => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        seen.push(...req.unit.pages.map((p) => p.n));
        return ok(req);
      },
    }));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(result.report.summary).toEqual({ totalGoals: 0, totalBMPs: 0, completionRate: 0 });
  });

  it('waits the retry-after time on RATE_LIMITED, then finishes', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await runPipeline({ doc, rawPages: pagesOf(12) }, deps({
      sleep: async (ms) => void waits.push(ms),
      extract: async (req) => {
        if (calls++ === 0) throw { code: 'RATE_LIMITED', retryAfter: 2 };
        return ok(req);
      },
    }));
    expect(waits).toContain(2000);
    expect(result.quality.failedUnits).toEqual([]);
  });

  it('goes back to 4 calls at once after a burst of rate limits, instead of staying at one', async () => {
    let inflight = 0;
    let calls = 0;
    const peaks: number[] = [];
    await runPipeline({ doc, rawPages: pagesOf(90) }, deps({
      extract: async (req) => {
        inflight++;
        peaks.push(inflight);
        await new Promise((r) => setTimeout(r, 2));
        inflight--;
        if (calls++ < 4) throw { code: 'RATE_LIMITED', retryAfter: 1 };
        return ok(req);
      },
    }));
    // The four first calls are refused, which drops the limit to one; later calls run four at a time again.
    expect(Math.max(...peaks.slice(-10))).toBe(4);
  });

  it('splits a unit that times out and extracts both halves', async () => {
    const calls: number[][] = [];
    await runPipeline({ doc, rawPages: pagesOf(3) }, deps({
      extract: async (req) => {
        const ns = req.unit.pages.map((p) => p.n);
        calls.push(ns);
        if (ns.length === 3) throw { code: 'TIMEOUT' };
        return ok(req);
      },
    }));
    expect(calls).toEqual([[1, 2, 3], [1, 2], [3]]);
  });

  it('marks a one-page unit that still truncates as failed, and finishes the run', async () => {
    const result = await runPipeline({ doc, rawPages: pagesOf(2) }, deps({
      extract: async (req) => {
        if (req.unit.pages.some((p) => p.n === 2)) throw { code: 'OUTPUT_TRUNCATED' };
        return ok(req);
      },
    }));
    expect(result.quality.failedUnits).toEqual([{ index: expect.any(Number), pages: [2], error: 'OUTPUT_TRUNCATED' }]);
  });

  it('retries an upstream error twice (networks drop connections), then reports the unit failed', async () => {
    let calls = 0;
    const result = await runPipeline({ doc, rawPages: pagesOf(1) }, deps({
      extract: async () => {
        calls++;
        throw { code: 'UPSTREAM_ERROR' };
      },
    }));
    expect(calls).toBe(3);
    expect(result.quality.failedUnits).toHaveLength(1);
  });

  it('sends scanned pages to OCR two at a time, then extracts their text as OCR', async () => {
    const batches: number[][] = [];
    const sources = new Set<string>();
    const raw = Array.from({ length: 10 }, (_, i) => scannedPage(i + 1));
    const result = await runPipeline({ doc, rawPages: raw }, deps({
      ocr: async (req) => {
        batches.push(req.pages.map((p) => p.n));
        return ocrText(req);
      },
      extract: async (req) => {
        req.unit.pages.forEach((p) => sources.add(p.source));
        return ok(req);
      },
    }));
    expect(batches.every((b) => b.length <= 2)).toBe(true);
    expect(batches.flat().sort((a, b) => a - b)).toEqual(raw.map((p) => p.n));
    expect([...sources]).toEqual(['ocr']);
    expect(result.quality.ocrPages).toEqual(raw.map((p) => p.n));
  });

  it('finds running headers on transcribed pages too', async () => {
    const result = await runPipeline({ doc, rawPages: [1, 2, 3, 4].map(scannedPage) }, deps({
      ocr: async (req) => ({
        pages: req.pages.map((p) => ({ n: p.n, text: `April 6, 2004\nThe goal is to reduce sediment loading on page ${p.n}.\nMore text about the plan.\n3-${p.n}` })),
        usage: { inputTokens: 1, outputTokens: 1, costUsd: null },
      }),
    }));
    const dates = result.quality.structure.filter((l) => l.text === 'April 6, 2004');
    expect(dates).toHaveLength(4);
    expect(dates.every((l) => l.kind === 'admin')).toBe(true);
  });

  it('splits an OCR batch that times out and reads each page on its own', async () => {
    const calls: number[][] = [];
    const result = await runPipeline({ doc, rawPages: [scannedPage(1), scannedPage(2)] }, deps({
      ocr: async (req) => {
        calls.push(req.pages.map((p) => p.n));
        if (req.pages.length > 1) throw { code: 'TIMEOUT' };
        return ocrText(req);
      },
    }));
    expect(calls).toEqual([[1, 2], [1], [2]]);
    expect(result.quality.ocrPages).toEqual([1, 2]);
  });

  it('reports scanned pages that still cannot be read as a failed section', async () => {
    const result = await runPipeline({ doc, rawPages: [textPage(1), scannedPage(2)] }, deps({
      ocr: async () => {
        throw { code: 'TIMEOUT' };
      },
    }));
    expect(result.quality.failedUnits).toEqual([expect.objectContaining({ pages: [2], error: 'TIMEOUT' })]);
  });

  it('skips a scanned page whose image comes out blank, without paying to transcribe it', async () => {
    const sent: number[] = [];
    const result = await runPipeline({ doc, rawPages: [scannedPage(1), scannedPage(2)] }, deps({
      renderPage: async (n) => (n === 1 ? '' : `/9j/page${n}`),
      ocr: async (req) => {
        sent.push(...req.pages.map((p) => p.n));
        return ocrText(req);
      },
    }));
    expect(sent).toEqual([2]);
    expect(result.quality.skippedPages).toContainEqual({ page: 1, reason: 'Blank page' });
    expect(result.quality.ocrPages).toEqual([2]);
  });

  it('waits and retries OCR on a rate limit', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await runPipeline({ doc, rawPages: [scannedPage(1)] }, deps({
      sleep: async (ms) => void waits.push(ms),
      ocr: async (req) => {
        if (calls++ < 2) throw { code: 'RATE_LIMITED', retryAfter: 3 };
        return ocrText(req);
      },
    }));
    expect(waits).toEqual([3000, 3000]);
    expect(result.quality.ocrPages).toEqual([1]);
  });

  it('reports a unit whose page image cannot be drawn as failed, never dropping it silently', async () => {
    const result = await runPipeline({ doc, rawPages: [tablePage(3)] }, deps({
      renderPage: async () => {
        throw new Error('canvas out of memory');
      },
    }));
    expect(result.quality.failedUnits).toEqual([expect.objectContaining({ pages: [3] })]);
  });

  it('stops starting calls once aborted and rejects with AbortError', async () => {
    const controller = new AbortController();
    let calls = 0;
    const run = runPipeline({ doc, rawPages: pagesOf(60) }, deps({
      extract: async (req) => {
        calls++;
        if (calls === 2) controller.abort();
        await new Promise((r) => setTimeout(r, 2));
        return ok(req);
      },
    }), { signal: controller.signal });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBeLessThanOrEqual(4);
  });

  it('reports progress with a partial report after each unit, and sums usage', async () => {
    const events: Progress[] = [];
    const result = await runPipeline({ doc, rawPages: pagesOf(6) }, deps({
      extract: async (req) => ok(req, { ...emptyItems(), bmps: [bmp(`Practice ${req.unit.index}`, req.unit.pages[0].n)] }),
      onProgress: (p) => events.push(p),
    }));
    const extract = events.filter((e) => e.stage === 'extract');
    expect(extract.at(-1)).toMatchObject({ done: 2, total: 2 });
    expect(extract.at(-1)!.partial!.bmps).toHaveLength(2);
    expect(events.at(-1)!.stage).toBe('done');
    expect(result.report.summary.totalBMPs).toBe(2);
    expect(result.quality.usage).toMatchObject({ inputTokens: 200, outputTokens: 20 });
  });

  it('attaches page images for table pages', async () => {
    const images: number[] = [];
    await runPipeline({ doc, rawPages: [textPage(1), textPage(2), tablePage(3)] }, deps({
      extract: async (req) => {
        images.push(...req.images.map((i) => i.page));
        return ok(req);
      },
    }));
    expect(images).toEqual([3]);
  });
});
