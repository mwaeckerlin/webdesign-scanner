import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    environment: 'node',
    // every scenario is a complete run of the real tool in a real browser
    hookTimeout: 3_600_000,
    testTimeout: 120_000,
    // the scenarios share docker volumes and must not run at the same time
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
})
