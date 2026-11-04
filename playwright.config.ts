import { defineConfig, devices } from '@playwright/test'
import { apiPort, apiUrl, webPort } from './e2e/ports'

// Cost guardrail: test runs never reach a real AI provider. Forced here so
// every process Playwright spawns inherits it (see apps/server/src/ai/deps.ts).
process.env.AI_MODE = 'mock'
delete process.env.OPENROUTER_API_KEY
// Pin the demo's zone for both the test process (seed times) and the browser,
// so date and DST behaviour doesn't depend on the host.
process.env.TZ = 'Europe/London'

const baseURL = `http://localhost:${webPort}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: 'test-results/e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], timezoneId: 'Europe/London' },
    },
    // The header's scope pills are transparent native selects over a styled
    // label: check Safari hits and drives them too. Only this spec, to keep
    // the run short (`pnpm exec playwright install webkit` once).
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], timezoneId: 'Europe/London' },
      testMatch: 'scope.e2e.ts',
    },
  ],
  webServer: [
    {
      // Creates PG_DB if missing, migrates and starts the API. Postgres must
      // already be up (`pnpm dev:db`): e2e never runs docker compose, so it
      // can't recreate the container other checkouts share.
      command: `PORT=${apiPort} ALLOWED_ORIGINS=${baseURL} DISABLE_RATE_LIMIT=1 pnpm run e2e:server`,
      url: `${apiUrl}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `VITE_API_URL=http://localhost:${apiPort} VITE_USER_ID=dev-user-1 pnpm --filter @pls/web run dev --port ${webPort} --strictPort`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
