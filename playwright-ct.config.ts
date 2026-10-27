import { defineConfig, devices } from '@playwright/experimental-ct-react'
import path from 'path'

// Cost guardrail: test runs never reach a real AI provider. Forced here so
// every process Playwright spawns inherits it (see apps/server/src/ai/deps.ts).
process.env.AI_MODE = 'mock'
delete process.env.OPENROUTER_API_KEY
// Pin the demo's zone for both the test process (seed times) and the browser,
// so date and DST behaviour doesn't depend on the host.
process.env.TZ = 'Europe/London'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.iwft.{ts,tsx}',
  outputDir: 'test-results/ct',
  timeout: 15_000,
  retries: 0,
  use: {
    // Override per checkout so parallel CT runs don't collide (see e2e/README.md).
    ctPort: Number(process.env.CT_PORT ?? 3100),
    ctViteConfig: {
      plugins: [
        require('@vitejs/plugin-react').default(),
        require('@tailwindcss/vite').default(),
      ],
      resolve: {
        alias: {
          '@pls/shared-ui': path.resolve(__dirname, 'packages/shared-ui/src'),
          '@pls/lens-framework': path.resolve(__dirname, 'packages/lens-framework/src'),
          '@pls/panel-system': path.resolve(__dirname, 'packages/panel-system/src'),
          '@pls/workspace-shell': path.resolve(__dirname, 'packages/workspace-shell/src'),
          '@pls/substrate-client': path.resolve(__dirname, 'packages/substrate-client/src'),
          '@pls/substrate': path.resolve(__dirname, 'packages/substrate/src'),
          '@pls/lens-audio-capture': path.resolve(__dirname, 'packages/lens-audio-capture/src'),
          '@pls/lens-transcript': path.resolve(__dirname, 'packages/lens-transcript/src'),
          '@pls/lens-test-me': path.resolve(__dirname, 'packages/lens-test-me/src'),
          '@pls/lens-weekly-overview': path.resolve(__dirname, 'packages/lens-weekly-overview/src'),
          '@pls/lens-connections': path.resolve(__dirname, 'packages/lens-connections/src'),
          '@pls/lens-gap-analysis': path.resolve(__dirname, 'packages/lens-gap-analysis/src'),
          '@pls/lens-weakest-topics': path.resolve(__dirname, 'packages/lens-weakest-topics/src'),
          '@pls/lens-calendar': path.resolve(__dirname, 'packages/lens-calendar/src'),
          '@pls/lens-todo': path.resolve(__dirname, 'packages/lens-todo/src'),
          '@pls/lens-coming-up': path.resolve(__dirname, 'packages/lens-coming-up/src'),
        },
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], timezoneId: 'Europe/London' },
    },
  ],
})
