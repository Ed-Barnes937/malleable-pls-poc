import { exec, query } from '../db'

interface JobResult {
  output: Record<string, unknown>
  eventType?: string
  affectedQueryKeys: string[][]
}

function randomId(): string {
  return crypto.randomUUID()
}

const SIMULATED_DELAY_MS = { min: 800, max: 2500 }

function simulateDelay(): Promise<void> {
  const ms = SIMULATED_DELAY_MS.min + Math.random() * (SIMULATED_DELAY_MS.max - SIMULATED_DELAY_MS.min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function executeTranscribe(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const recordingId = input.recordingId as string ?? input.target_id as string
  if (!recordingId) {
    return { output: { skipped: true, reason: 'no recordingId' }, affectedQueryKeys: [] }
  }

  const existing = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM transcript_segments WHERE recording_id = ?',
    [recordingId]
  )
  if ((existing[0]?.count ?? 0) > 0) {
    return { output: { skipped: true, reason: 'transcript already exists' }, affectedQueryKeys: [] }
  }

  const segments = [
    { offset: 0, text: 'Welcome back everyone. Today we have an exciting topic to cover.' },
    { offset: 180000, text: 'Let me start with the key concepts you need to understand.' },
    { offset: 360000, text: 'This builds on what we discussed last week about the fundamentals.' },
  ]

  for (const seg of segments) {
    exec(
      `INSERT INTO transcript_segments (id, recording_id, start_ms, end_ms, text, speaker)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomId(), recordingId, seg.offset, seg.offset + 180000, seg.text, 'Lecturer']
    )
  }

  return {
    output: { segmentsCreated: segments.length, recordingId },
    eventType: 'job:completed',
    affectedQueryKeys: [['transcript', recordingId], ['transcript_segments']],
  }
}

async function executeSearchRelatedDocs(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true }, affectedQueryKeys: [] }
  }

  const existingLinks = query<{ count: number }>(
    "SELECT COUNT(*) as count FROM links WHERE source_id = ? AND relationship = 'related'",
    [segmentId]
  )
  if ((existingLinks[0]?.count ?? 0) >= 3) {
    return { output: { skipped: true, reason: 'enough links exist' }, affectedQueryKeys: [] }
  }

  const candidates = query<{ id: string }>(
    `SELECT id FROM transcript_segments
     WHERE id != ? ORDER BY RANDOM() LIMIT 2`,
    [segmentId]
  )

  let linksCreated = 0
  for (const candidate of candidates) {
    const alreadyLinked = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM links
       WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)`,
      [segmentId, candidate.id, candidate.id, segmentId]
    )
    if ((alreadyLinked[0]?.count ?? 0) === 0) {
      exec(
        `INSERT INTO links (id, source_type, source_id, target_type, target_id, relationship)
         VALUES (?, 'transcript_segment', ?, 'transcript_segment', ?, 'related')`,
        [randomId(), segmentId, candidate.id]
      )
      linksCreated++
    }
  }

  return {
    output: { linksCreated, segmentId },
    eventType: linksCreated > 0 ? 'job:completed' : undefined,
    affectedQueryKeys: linksCreated > 0 ? [['connections'], ['connections_recording'], ['links']] : [],
  }
}

async function executeScheduleQuiz(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true }, affectedQueryKeys: [] }
  }

  const delayMs = (input._delayMs as number) || 7 * 24 * 60 * 60 * 1000
  const scheduledFor = new Date(Date.now() + delayMs).toISOString()

  exec(
    `INSERT INTO annotations (id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body, created_at, author_id)
     VALUES (?, 'transcript_segment', ?, NULL, NULL, ?, ?, 'system')`,
    [randomId(), segmentId, `[Auto] Quiz scheduled for review`, scheduledFor]
  )

  return {
    output: { scheduledFor, segmentId },
    affectedQueryKeys: [['annotations']],
  }
}

async function executeGenerateQuestions(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true }, affectedQueryKeys: [] }
  }

  exec(
    `INSERT INTO annotations (id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body, created_at, author_id)
     VALUES (?, 'transcript_segment', ?, NULL, NULL, ?, ?, 'system')`,
    [randomId(), segmentId, '[Auto] Practice question generated for low-confidence topic', new Date().toISOString()]
  )

  return {
    output: { segmentId, questionsGenerated: 1 },
    affectedQueryKeys: [['annotations']],
  }
}

async function executeFindConnections(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true }, affectedQueryKeys: [] }
  }

  const candidates = query<{ id: string; text: string }>(
    `SELECT id, text FROM transcript_segments WHERE id != ? ORDER BY RANDOM() LIMIT 1`,
    [segmentId]
  )

  let linksCreated = 0
  for (const candidate of candidates) {
    const alreadyLinked = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM links
       WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)`,
      [segmentId, candidate.id, candidate.id, segmentId]
    )
    if ((alreadyLinked[0]?.count ?? 0) === 0) {
      exec(
        `INSERT INTO links (id, source_type, source_id, target_type, target_id, relationship)
         VALUES (?, 'transcript_segment', ?, 'transcript_segment', ?, 'same-concept')`,
        [randomId(), segmentId, candidate.id]
      )
      linksCreated++
    }
  }

  return {
    output: { linksCreated, segmentId },
    affectedQueryKeys: linksCreated > 0 ? [['connections'], ['connections_recording'], ['links']] : [],
  }
}

const EXECUTORS: Record<string, (input: Record<string, unknown>) => Promise<JobResult>> = {
  'ai:transcribe': executeTranscribe,
  'search:related-docs': executeSearchRelatedDocs,
  'schedule:quiz': executeScheduleQuiz,
  'ai:generate-questions': executeGenerateQuestions,
  'ai:find-connections': executeFindConnections,
}

export async function executeJob(
  jobType: string,
  input: Record<string, unknown>
): Promise<JobResult> {
  const executor = EXECUTORS[jobType]
  if (!executor) {
    return {
      output: { error: `Unknown job type: ${jobType}` },
      affectedQueryKeys: [],
    }
  }
  return executor(input)
}

export function getAvailableJobTypes(): { type: string; label: string; category: string }[] {
  return [
    { type: 'ai:transcribe', label: 'Generate transcript', category: 'AI' },
    { type: 'search:related-docs', label: 'Search related documents', category: 'Search' },
    { type: 'schedule:quiz', label: 'Schedule quiz review', category: 'Schedule' },
    { type: 'ai:generate-questions', label: 'Generate practice questions', category: 'AI' },
    { type: 'ai:find-connections', label: 'Find cross-lecture connections', category: 'AI' },
  ]
}
