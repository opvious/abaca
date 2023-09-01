import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/*.gen.ts'],
      provider: 'v8',
      reportsDirectory: 'out/coverage',
    },
    globals: true,
  },
});
