import { get, set, del } from 'idb-keyval';
import type { ExtractionResult } from '@app/backend';

/*
 * Results live in this browser only (IndexedDB), keyed by the file's sha256, so opening the
 * same PDF again is instant and nothing is stored on the server.
 */

export interface RecentEntry {
  id: string;
  fileName: string;
  title: string | null;
  pages: number;
  savedAt: string;
}

const RECENT = 'recent';
const MAX_RECENT = 10;
const key = (id: string) => `result:${id}`;

// Storage can be unavailable (private windows, blocked site data); the app still works without it.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const loadResult = (id: string) => safe(() => get<ExtractionResult>(key(id)).then((r) => r ?? null), null);

export async function saveResult(r: ExtractionResult): Promise<void> {
  await safe(async () => {
    await set(key(r.document.id), r);
    const recent = ((await get<RecentEntry[]>(RECENT)) ?? []).filter((e) => e.id !== r.document.id);
    const entry: RecentEntry = { id: r.document.id, fileName: r.document.fileName, title: r.document.title, pages: r.document.pages, savedAt: new Date().toISOString() };
    const next = [entry, ...recent];
    for (const old of next.slice(MAX_RECENT)) await del(key(old.id));
    await set(RECENT, next.slice(0, MAX_RECENT));
  }, undefined);
}

export const listRecent = () => safe(async () => (await get<RecentEntry[]>(RECENT)) ?? [], [] as RecentEntry[]);
