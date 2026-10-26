import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'playwright/**/*.test.{ts,tsx}',
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
