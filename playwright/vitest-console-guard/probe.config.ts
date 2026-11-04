import { defineConfig } from 'vitest/config'

// The repo's vitest setup file (so the same guard) and environment, on the
// probe only. Run from the repo root.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['playwright/vitest-console-guard/probe.ts'],
  },
})
