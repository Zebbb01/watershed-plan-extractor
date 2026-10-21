import { describe, expect, it, vi } from 'vitest';

// An in-memory stand-in for IndexedDB.
const db = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  del: async (k: string) => void db.delete(k),
}));

const { loadPdf, savePdf } = await import('./store');
const pdf = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });

describe('savePdf', () => {
  it('keeps the last three PDFs, so a reopened report can show and re-run its file', async () => {
    for (const id of ['a', 'b', 'c', 'd']) await savePdf(id, pdf(10));
    expect(await loadPdf('a')).toBeNull();
    for (const id of ['b', 'c', 'd']) expect(await loadPdf(id)).not.toBeNull();
  });

  it('does not keep a file over 150 MB', async () => {
    const huge = { size: 151 * 1024 * 1024 } as Blob;
    await savePdf('huge', huge);
    expect(await loadPdf('huge')).toBeNull();
  });
});
