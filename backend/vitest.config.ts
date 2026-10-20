import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
