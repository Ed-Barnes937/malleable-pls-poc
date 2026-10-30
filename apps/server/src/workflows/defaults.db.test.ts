// @vitest-environment node
/**
 * Default automations for new accounts, against a real Postgres (opt-in, see
 * routers/plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t15 pnpm test defaults.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('ensureDefaultAutomations (Postgres)', () => {
  let db: typeof import('@pls/db')
  let defaults: typeof import('./defaults')
  const tag = randomUUID().slice(0, 8)
  const users = Array.from({ length: 3 }, (_, i) => `test-da-${tag}-${i}`)

  const triggers = (user: string) => db.withUser(user, async (tx) => {
    const rows = await tx`SELECT trigger_event FROM workflows WHERE user_id = ${user} ORDER BY trigger_event`
    return rows.map((r) => r.trigger_event as string)
  })
  const jobs = (user: string) => db.withUser(user, async (tx) => {
    const rows = await tx`SELECT job_type FROM workflow_jobs WHERE user_id = ${user} ORDER BY job_type`
    return rows.map((r) => r.job_type as string)
  })

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    defaults = await import('./defaults')
  })

  afterAll(async () => {
    for (const user of users) {
      await db.withUser(user, async (tx) => {
        await tx`DELETE FROM workflows WHERE user_id = ${user}`
        await tx`DELETE FROM user_provisioning WHERE user_id = ${user}`
      })
    }
    await db.sql.end()
  })

  it('gives a new account transcribe, summary and confused-review, once', async () => {
    const user = users[0]!
    await defaults.provisionAccount(user)
    await db.withUser(user, (tx) => defaults.ensureDefaultAutomations(tx, user))
    expect(await triggers(user)).toEqual(['recording:completed', 'recording:transcribed', 'tag:created'])
    expect(await jobs(user)).toEqual(['ai:summarize-lecture', 'ai:transcribe', 'plan:review-task'])
  })

  it('does not bring back one the student deleted', async () => {
    const user = users[0]!
    await db.withUser(user, (tx) => tx`DELETE FROM workflows WHERE user_id = ${user} AND trigger_event = 'recording:completed'`)
    await db.withUser(user, (tx) => defaults.ensureDefaultAutomations(tx, user))
    expect(await triggers(user)).toEqual(['recording:transcribed', 'tag:created'])
  })

  it('leaves an account that already has automations as it is', async () => {
    const user = users[1]!
    await db.withUser(user, (tx) => tx`
      INSERT INTO workflows (user_id, source_lens, trigger_event) VALUES (${user}, 'transcript', 'tag:created')
    `)
    await db.withUser(user, (tx) => defaults.ensureDefaultAutomations(tx, user))
    expect(await triggers(user)).toEqual(['tag:created'])
  })

  it('adds the defaults once when many first requests arrive together', async () => {
    const user = users[2]!
    await Promise.all(Array.from({ length: 5 }, () => db.withUser(user, (tx) => defaults.ensureDefaultAutomations(tx, user))))
    expect(await triggers(user)).toHaveLength(3)
  })
})
