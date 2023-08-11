import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: 'out/coverage',
    },
    globals: true,
  },
});
