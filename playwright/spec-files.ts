// Where each Playwright suite finds its specs: read by its config and by
// console-guard.test.ts, which checks every one of them runs with the guard.
export const E2E_SPECS = { testDir: 'e2e', testMatch: '**/*.e2e.ts' }
export const CT_SPECS = { testDir: '.', testMatch: '**/*.iwft.{ts,tsx}' }
