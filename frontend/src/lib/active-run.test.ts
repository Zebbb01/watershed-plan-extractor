import type { ExtractionResult, Progress } from '@app/backend';
import { afterEach, describe, expect, it } from 'vitest';
import { activeRun, type ExtractFn } from './active-run';
import type { Prepared } from './run-extraction';
import { session } from './session';

const prepared = (id: string) => ({ id, fileName: `${id}.pdf`, cached: null, doc: { numPages: 12 } }) as unknown as Prepared & { doc: NonNullable<Prepared['doc']> };
const health = { provider: 'anthropic', model: 'm', limits: { maxPages: 800 } };
const result = (id: string) => ({ document: { id } }) as unknown as ExtractionResult;

/** An extraction the test finishes by hand. */
function controllable() {
  let finish!: (r: ExtractionResult) => void;
  let fail!: (e: unknown) => void;
  let progress!: (p: Progress) => void;
  let signal!: AbortSignal;
  const extract: ExtractFn = (p, onProgress, s) => {
    progress = onProgress;
    signal = s;
    return new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
      s.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled.'), { name: 'AbortError' })));
    });
  };
  return { extract, finish: (r: ExtractionResult) => finish(r), fail: (e: unknown) => fail(e), progress: (p: Progress) => progress(p), signal: () => signal };
}

afterEach(() => activeRun.dismiss());

describe('activeRun', () => {
  it('keeps one run going outside any page, with its progress, until it finishes', async () => {
    const run = controllable();
    const seen: string[] = [];
    const stop = activeRun.subscribe(() => seen.push(activeRun.get()?.status ?? 'none'));
    const done = activeRun.start(prepared('a'), health, run.extract);
    run.progress({ stage: 'extract', done: 1, total: 2 });
    expect(activeRun.get()).toMatchObject({ status: 'running', id: 'a', fileName: 'a.pdf', pages: 12, state: { extract: { done: 1, total: 2 } } });
    run.finish(result('a'));
    await done;
    expect(activeRun.get()).toMatchObject({ status: 'done', id: 'a' });
    expect(session.result('a')).not.toBeNull();
    expect(seen).toContain('running');
    expect(seen.at(-1)).toBe('done');
    stop();
  });

  it('refuses a second run while one is going', async () => {
    const run = controllable();
    const first = activeRun.start(prepared('a'), health, run.extract);
    await expect(activeRun.start(prepared('b'), health, controllable().extract)).rejects.toThrow(/already/);
    run.finish(result('a'));
    await first;
  });

  it('forgets a stopped run entirely', async () => {
    const run = controllable();
    const going = activeRun.start(prepared('a'), health, run.extract);
    activeRun.stop();
    await expect(going).rejects.toMatchObject({ name: 'AbortError' });
    expect(run.signal().aborted).toBe(true);
    expect(activeRun.get()).toBeNull();
  });

  it('keeps a failed run and its reason until it is dismissed', async () => {
    const run = controllable();
    const going = activeRun.start(prepared('a'), health, run.extract);
    run.fail(new Error('Could not reach the server.'));
    await expect(going).rejects.toThrow();
    expect(activeRun.get()).toMatchObject({ status: 'failed', id: 'a', error: expect.stringContaining('reach the server') });
    activeRun.dismiss();
    expect(activeRun.get()).toBeNull();
  });
});
