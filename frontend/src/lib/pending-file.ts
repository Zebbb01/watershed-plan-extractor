/*
 * A PDF chosen with an Upload button anywhere on the site, waiting for the home page to run
 * it. The button puts the file here and opens the home page; the home page takes it once.
 */
let pending: File | null = null;
const listeners = new Set<() => void>();

export const pendingFile = {
  put(file: File) {
    pending = file;
    for (const l of listeners) l();
  },
  take(): File | null {
    const file = pending;
    pending = null;
    return file;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
