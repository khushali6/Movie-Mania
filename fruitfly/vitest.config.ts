import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    setupFiles: ['./tools/vitest-setup.ts'],
  },
});
