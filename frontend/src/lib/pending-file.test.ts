import { describe, expect, it, vi } from 'vitest';
import { pendingFile } from './pending-file';

describe('pendingFile', () => {
  it('hands a chosen file to the page that runs it, once', () => {
    const file = new File(['%PDF'], 'plan.pdf');
    const seen = vi.fn();
    const stop = pendingFile.subscribe(seen);
    pendingFile.put(file);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(pendingFile.take()).toBe(file);
    expect(pendingFile.take()).toBeNull();
    stop();
  });
});
