import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * Cost guardrail: Playwright reuses an API server that is already listening,
 * which bypasses the AI_MODE=mock forcing in playwright.config.ts and
 * e2e:server. Refuse to run unless the server under test reports mock AI.
 */
async function assertMockApi() {
  const res = await fetch(`${apiUrl}/health`)
  const health = (await res.json()) as { aiMode?: string }
  if (health.aiMode !== 'mock') {
    throw new Error(
      `Refusing to run e2e: the API at ${apiUrl} reports aiMode=${String(health.aiMode)}, not "mock". ` +
        'Stop that server or point API_PORT at a free port so Playwright starts a mock one.',
    )
  }
}

export default async function globalSetup() {
  await assertMockApi()
  await reseed()
}
