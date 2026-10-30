/**
 * The demo student's lectures, each with the one recording 002_seed.sql
 * seeds (same id, title and time; the lecture id is 'lec-' + the recording
 * id, as the lectures migration names backfilled lectures). reseed.ts
 * inserts these itself, since 002 inserts recordings without a lecture.
 */
export interface SeedLecture {
  id: string
  title: string
  course: string
  startsAt: string
  recording: { id: string; durationMs: number }
}

const lecture = (recordingId: string, title: string, course: string, startsAt: string, durationMs: number): SeedLecture => ({
  id: `lec-${recordingId}`,
  title,
  course,
  startsAt,
  recording: { id: recordingId, durationMs },
})

export const SEED_LECTURES: SeedLecture[] = [
  lecture('rec-bio-1', 'Biology Lecture: Cell Structure', 'biology', '2026-03-28T10:00:00Z', 2820000),
  lecture('rec-bio-2', 'Biology Lecture: Cell Division', 'biology', '2026-04-04T10:00:00Z', 2700000),
  lecture('rec-bio-3', 'Biology Lecture: Mitochondria & Energy', 'biology', '2026-04-11T10:00:00Z', 3000000),
  lecture('rec-bio-4', 'Biology Lecture: Mitochondrial DNA', 'biology', '2026-04-16T10:00:00Z', 2832000),
  lecture('rec-chem-1', 'Chemistry Lecture: Organic Reactions', 'chemistry', '2026-04-09T14:00:00Z', 2520000),
]

/**
 * `sql` (002_seed.sql) without its one `INSERT INTO recordings` statement,
 * after checking that statement seeds exactly the SEED_LECTURES recordings
 * with the same titles and times, so the two cannot drift apart.
 */
export function withoutSeedRecordings(sql: string): string {
  const start = sql.indexOf('INSERT INTO recordings')
  if (start < 0 || sql.indexOf('INSERT INTO recordings', start + 1) >= 0) {
    throw new Error('Expected exactly one INSERT INTO recordings statement in the seed')
  }
  const end = sql.indexOf(';', start) + 1
  const statement = sql.slice(start, end)
  const rows = statement.match(/\('rec-[^']+'/g) ?? []
  if (rows.length !== SEED_LECTURES.length) {
    throw new Error(`Seed recordings (${rows.length}) and SEED_LECTURES (${SEED_LECTURES.length}) differ`)
  }
  for (const { recording, title, startsAt } of SEED_LECTURES) {
    const sqlTitle = title.replace(/'/g, "''")
    if (!statement.includes(`('${recording.id}', 'dev-user-1', '${sqlTitle}', '${startsAt}', ${recording.durationMs},`)) {
      throw new Error(`Seed recording ${recording.id} differs from SEED_LECTURES`)
    }
  }
  return sql.slice(0, start) + sql.slice(end)
}
