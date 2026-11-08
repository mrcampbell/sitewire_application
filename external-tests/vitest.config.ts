import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Live tests hit an API that can take ~3 s per request and fails ~25% of the time.
    testTimeout: 120_000,
  },
});
