import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['test/**/*.test.ts'],
    coverage: { enabled: true },
    typecheck: { tsconfig: './tsconfig.test.json' },
    testTimeout: 10000,
  },
});
