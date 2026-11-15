import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@qiqihar/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/browser/**/*.browser.ts'],
    testTimeout: 60_000,
    // First Chrome startup can be slow on Windows while its sandbox initializes.
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
