import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('package entry', () => {
  it('exposes a semantic version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
