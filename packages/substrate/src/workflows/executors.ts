import { createExecutorRegistry } from '@pls/workflows'
import type { ExecutorContext, ExecutorRegistry, JobResult, WorkflowEvent } from '@pls/workflows'
import { exec, query } from '../db'

function randomId(): string {
  return crypto.randomUUID()
}

const SIMULATED_DELAY_MS = { min: 800, max: 2500 }

function simulateDelay(): Promise<void> {
  const ms = SIMULATED_DELAY_MS.min + Math.random() * (SIMULATED_DELAY_MS.max - SIMULATED_DELAY_MS.min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// affectedQueryKeys side channel.
//
// LOCKED DECISION 5: `affectedQueryKeys` is NOT part of the core JobResult.
// Executors expose the domain tables they touch via this exported map so the
// runner hook can do COARSE query invalidation on `job:completed`.
// TODO: this is coarser than the old per-key invalidation (it keys off
// job_type, not the concrete keys the executor returned). Could be made
// fine-grained again via a side channel that carries per-run keys (e.g. a
// WeakMap keyed by jobRun id) later.
// ---------------------------------------------------------------------------
export const AFFECTED_QUERY_KEYS: Record<string, string[][]> = {
  'ai:transcribe': [['transcript'], ['transcript_segments']],
  'search:related-docs': [['connections'], ['connections_recording'], ['links']],
  'schedule:quiz': [['annotations']],
  'ai:generate-questions': [['annotations']],
  'ai:find-connections': [['connections'], ['connections_recording'], ['links']],
}

// The `job:completed` cascade event substrate workflows trigger on. Mirrors the
// old `eventType: 'job:completed'` string, now expressed as a WorkflowEvent.
function completedEvent(payload: Record<string, unknown>): WorkflowEvent {
  return { type: 'job:completed', payload }
}

async function executeTranscribe(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const recordingId = (input.recordingId as string) ?? (input.target_id as string)
  if (!recordingId) {
    return { output: { skipped: true, reason: 'no recordingId' } }
  }

  const existing = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM transcript_segments WHERE recording_id = ?',
    [recordingId]
  )
  if ((existing[0]?.count ?? 0) > 0) {
    return { output: { skipped: true, reason: 'transcript already exists' } }
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

  const output = { segmentsCreated: segments.length, recordingId }
  return { output, events: [completedEvent(output)] }
}

async function executeSearchRelatedDocs(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true } }
  }

  const existingLinks = query<{ count: number }>(
    "SELECT COUNT(*) as count FROM links WHERE source_id = ? AND relationship = 'related'",
    [segmentId]
  )
  if ((existingLinks[0]?.count ?? 0) >= 3) {
    return { output: { skipped: true, reason: 'enough links exist' } }
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

  const output = { linksCreated, segmentId }
  return { output, events: linksCreated > 0 ? [completedEvent(output)] : [] }
}

async function executeScheduleQuiz(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true } }
  }

  const delayMs = (input._delayMs as number) || 7 * 24 * 60 * 60 * 1000
  const scheduledFor = new Date(Date.now() + delayMs).toISOString()

  exec(
    `INSERT INTO annotations (id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body, created_at, author_id)
     VALUES (?, 'transcript_segment', ?, NULL, NULL, ?, ?, 'system')`,
    [randomId(), segmentId, `[Auto] Quiz scheduled for review`, scheduledFor]
  )

  return { output: { scheduledFor, segmentId } }
}

async function executeGenerateQuestions(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true } }
  }

  exec(
    `INSERT INTO annotations (id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body, created_at, author_id)
     VALUES (?, 'transcript_segment', ?, NULL, NULL, ?, ?, 'system')`,
    [randomId(), segmentId, '[Auto] Practice question generated for low-confidence topic', new Date().toISOString()]
  )

  return { output: { segmentId, questionsGenerated: 1 } }
}

async function executeFindConnections(input: Record<string, unknown>): Promise<JobResult> {
  await simulateDelay()

  const segmentId = input.target_id as string
  if (!segmentId) {
    return { output: { skipped: true } }
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

  return { output: { linksCreated, segmentId } }
}

// Each executor adopts the shared `Executor` signature
// `(input, ctx: ExecutorContext) => Promise<JobResult>`. Substrate's bodies
// ignore `ctx` (no `_userId` reliance — they hardcode author_id 'system'), but
// the parameter is accepted so the contract matches.
const SUBSTRATE_EXECUTORS: Array<{
  type: string
  label: string
  category: string
  executor: (input: Record<string, unknown>, ctx: ExecutorContext) => Promise<JobResult>
}> = [
  { type: 'ai:transcribe', label: 'Generate transcript', category: 'AI', executor: (input) => executeTranscribe(input) },
  { type: 'search:related-docs', label: 'Search related documents', category: 'Search', executor: (input) => executeSearchRelatedDocs(input) },
  { type: 'schedule:quiz', label: 'Schedule quiz review', category: 'Schedule', executor: (input) => executeScheduleQuiz(input) },
  { type: 'ai:generate-questions', label: 'Generate practice questions', category: 'AI', executor: (input) => executeGenerateQuestions(input) },
  { type: 'ai:find-connections', label: 'Find cross-lecture connections', category: 'AI', executor: (input) => executeFindConnections(input) },
]

/** Builds a fresh registry with all substrate executors registered. */
export function createSubstrateExecutorRegistry(): ExecutorRegistry {
  const registry = createExecutorRegistry()
  for (const { type, label, category, executor } of SUBSTRATE_EXECUTORS) {
    registry.register(type, executor, { label, category })
  }
  return registry
}

export function getAvailableJobTypes(): { type: string; label: string; category: string }[] {
  return createSubstrateExecutorRegistry().getAvailableTypes()
}

export function getAvailableTriggerEvents(): { event: string; label: string }[] {
  return [
    { event: 'recording:completed', label: 'When a recording is completed' },
    { event: 'tag:created', label: 'When a tag is added' },
    { event: 'confidence:recorded', label: 'When confidence is recorded' },
    { event: 'annotation:created', label: 'When a note is added' },
  ]
}

export function getTriggerEventsForLens(emits: readonly string[]): { event: string; label: string }[] {
  const allowed = new Set(emits)
  return getAvailableTriggerEvents().filter((t) => allowed.has(t.event))
}
