import { defineConfig, devices } from '@playwright/test'
process.env.AI_MODE = 'mock'
delete process.env.OPENROUTER_API_KEY
process.env.TZ = 'Europe/London'
export default defineConfig({
  testDir: '.',
  testMatch: '*.spike.ts',
  outputDir: './test-results',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5283', timezoneId: 'Europe/London' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grep: /@desktop/ },
    { name: 'phone-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' }, grep: /@phone/ },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] }, grep: /@phone/ },
  ],
})
