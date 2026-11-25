// THROWAWAY SPIKE (K0 spike 1): the spike's phone presses in WebKit (iPhone, touch).
import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: '**/spike-popover.e2e.ts',
  projects: [{ name: 'webkit-iphone', use: { ...devices['iPhone 13'], timezoneId: 'Europe/London' } }],
})
