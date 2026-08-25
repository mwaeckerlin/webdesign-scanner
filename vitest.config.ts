import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // a console error is a failing test, never noise that scrolls by
    onConsoleLog: (log, type) => {
      if (type === 'stderr') throw new Error(`unexpected error output during a unit test: ${log}`)
      return false
    }
  }
})
