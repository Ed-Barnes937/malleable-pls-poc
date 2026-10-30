// @vitest-environment node
/**
 * Integration tests for the progress / weak topics aggregates against a real
 * Postgres (opt-in, see plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t10 pnpm test aggregates.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { insertRecording } from '../test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('aggregates router (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const user = `test-agg-${randomUUID().slice(0, 8)}`
  const rec = `rec-${user}`
  const seg = (n: number) => `seg-${user}-${n}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })

    await db.withUser(user, async (tx) => {
      await insertRecording(tx, { id: rec, userId: user, title: 'Genetics', course: 'biology' })
      const texts = [
        'Welcome to genetics.',
        'Here is the critical point: mitochondrial DNA comes from the maternal line.',
        'This is called maternal inheritance.',
        'Ribosomes are the protein factories of the cell.',
        'The Krebs cycle runs in the matrix.',
        'Mitochondria have their own DNA.',
      ]
      for (const [i, text] of texts.entries()) {
        await tx`
          INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text)
          VALUES (${seg(i)}, ${user}, ${rec}, ${i * 60000}, ${(i + 1) * 60000}, ${text})
        `
      }
      const signal = (s: string, score: number, at: string) => tx`
        INSERT INTO confidence_signals (user_id, target_type, target_id, score, created_at)
        VALUES (${user}, 'transcript_segment', ${s}, ${score}, ${at})
      `
      const confused = (s: string, at: string) => tx`
        INSERT INTO tags (user_id, target_type, target_id, label, created_at)
        VALUES (${user}, 'transcript_segment', ${s}, 'confused', ${at})
      `
      // 1: marked confusing, never rated -> review (weakest, counts as 0).
      await confused(seg(1), '2026-10-01T10:00:00Z')
      // 2: rated solid, then low -> review at 30.
      await signal(seg(2), 90, '2026-10-01T10:00:00Z')
      await signal(seg(2), 30, '2026-10-02T10:00:00Z')
      // 3: marked confusing, then felt sure -> solid.
      await confused(seg(3), '2026-10-01T10:00:00Z')
      await signal(seg(3), 80, '2026-10-02T10:00:00Z')
      // 4: felt sure, then marked confusing -> review at 85.
      await signal(seg(4), 85, '2026-10-01T10:00:00Z')
      await confused(seg(4), '2026-10-02T10:00:00Z')
      // 5: in between -> neither.
      await signal(seg(5), 60, '2026-10-01T10:00:00Z')
      // The confusion automation's review for moment 4 names it.
      await tx`
        INSERT INTO plan_items (user_id, kind, title, subtype, source_type, source_id, source_offset_ms, duration_min)
        VALUES (${user}, 'task', 'Review: the citric acid cycle', 'review', 'recording', ${rec}, 240000, 20)
      `
    })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['confidence_signals', 'tags', 'transcript_segments', 'plan_items', 'recordings', 'lectures']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [user])
    }
    await db.sql.end()
  })

  it('counts moments by one status rule, the same in both progress widgets', async () => {
    const api = caller(user)
    const progress = await api.aggregates.weeklyOverview({})
    expect(progress).toEqual([{ course: 'biology', totalMoments: 6, solidMoments: 1, reviewMoments: 3, percentage: 17 }])
    expect(await api.aggregates.gapAnalysis()).toEqual(progress)
    expect(await api.aggregates.weeklyOverview({ courseTag: 'chemistry' })).toEqual([])
  })

  it('lists exactly the moments to review, weakest first, with readable labels and their place in the lecture', async () => {
    const topics = await caller(user).aggregates.weakestTopics({})
    expect(topics.map((t) => t.segmentId)).toEqual([seg(1), seg(2), seg(4)])
    expect(topics[0]).toMatchObject({
      rank: 1,
      recordingId: rec,
      recordingTitle: 'Genetics',
      offsetMs: 60000,
      label: 'Maternal inheritance',
      course: 'biology',
      confidence: null,
      confused: true,
    })
    expect(topics[1]).toMatchObject({ confidence: 30, confused: false })
    expect(topics[2]).toMatchObject({ label: 'The citric acid cycle', confidence: 85, confused: true })
  })

  it('the SQL and momentStatus agree on every case of one fixture table', async () => {
    const { momentStatus, stillConfused, WEAK_BELOW, SOLID_FROM } = await import('@pls/substrate')
    // Each case: what the student did, in order (r = rating, c = confusing mark).
    type Event = ['r', number] | ['c']
    const scores = [0, WEAK_BELOW - 1, WEAK_BELOW, SOLID_FROM - 1, SOLID_FROM, 100]
    const cases: Event[][] = [[]]
    for (const s of scores) {
      cases.push([['r', s]], [['c'], ['r', s]], [['r', s], ['c']], [['r', 90], ['r', s]], [['c'], ['r', 90], ['r', s]])
    }
    cases.push([['c']], [['c'], ['c']])

    const other = `test-agg-table-${randomUUID().slice(0, 8)}`
    const tableRec = `rec-${other}`
    const segOf = (i: number) => `seg-${other}-${i}`
    const at = (step: number) => new Date(Date.UTC(2026, 9, 1, 10, step)).toISOString()
    const expected = new Map<string, { status: string; confused: boolean }>()
    try {
      await db.withUser(other, async (tx) => {
        await insertRecording(tx, { id: tableRec, userId: other, title: 'Table', course: 'chemistry' })
        for (const [i, events] of cases.entries()) {
          await tx`
            INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text)
            VALUES (${segOf(i)}, ${other}, ${tableRec}, ${i * 1000}, ${(i + 1) * 1000}, 'A moment.')
          `
          let latestScore: number | null = null
          let latestAt: string | null = null
          let confusedAt: string | null = null
          for (const [step, ev] of events.entries()) {
            if (ev[0] === 'r') {
              await tx`
                INSERT INTO confidence_signals (user_id, target_type, target_id, score, created_at)
                VALUES (${other}, 'transcript_segment', ${segOf(i)}, ${ev[1]}, ${at(step)})
              `
              latestScore = ev[1]
              latestAt = at(step)
            } else {
              await tx`
                INSERT INTO tags (user_id, target_type, target_id, label, created_at)
                VALUES (${other}, 'transcript_segment', ${segOf(i)}, 'confused', ${at(step)})
              `
              confusedAt = at(step)
            }
          }
          const signals = { latestScore, latestAt, confusedAt }
          expected.set(segOf(i), { status: momentStatus(signals), confused: stillConfused(signals) })
        }
      })

      const api = caller(other)
      const review = [...expected].filter(([, e]) => e.status === 'review')
      const [progress] = await api.aggregates.weeklyOverview({})
      expect(progress).toMatchObject({
        totalMoments: cases.length,
        solidMoments: [...expected.values()].filter((e) => e.status === 'solid').length,
        reviewMoments: review.length,
      })
      const topics = await api.aggregates.weakestTopics({ limit: 100 })
      expect(new Map(topics.map((t) => [t.segmentId, t.confused]))).toEqual(new Map(review.map(([id, e]) => [id, e.confused])))
    } finally {
      for (const table of ['confidence_signals', 'tags', 'transcript_segments', 'recordings', 'lectures']) {
        await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [other])
      }
    }
  })
})
