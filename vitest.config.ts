import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // With TEST_DATABASE_URL: the database lectures-migration.db.test.ts clones.
    globalSetup: ['./apps/server/src/test-support/pre-lectures-template.global-setup.ts'],
    // Date and DST tests assume the demo's zone, whatever the host's (e.g. a UTC CI box).
    env: { TZ: 'Europe/London' },
    include: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'playwright/**/*.test.{ts,tsx}',
      'e2e/**/*.test.ts',
    ],
    css: false,
    // Only collected with `pnpm test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
      thresholds: {
        // Pure scheduling logic: keep it exhaustively tested.
        'packages/scheduler/src/**': { branches: 95, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
})
