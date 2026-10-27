import { REVIEW_SUBTYPE, keyPhrase, momentStatus, stillConfused, topicLabel, type CourseProgress, type MomentStatus, type WeakTopic } from '@pls/substrate'
import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

const COURSE_LABELS = ['biology', 'chemistry', 'physics']

// Mirrors apps/server/src/routers/aggregates.ts: one moment status rule
// (`momentStatus`) behind Your progress, All courses and Weak topics.

interface CourseMoment {
  segId: string
  recordingId: string
  recordingTitle: string
  recordingAt: string
  startMs: number
  text: string
  before: string
  after: string
  course: string
  latestScore: number | null
  confusedAt: string | null
  confused: boolean
  status: MomentStatus
}

export function registerAggregatesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('aggregates.weeklyOverview', (input) => {
    const courseTag = (input as { courseTag?: string } | undefined)?.courseTag
    return courseProgress(courseMoments(db, courseTag))
  })

  router.register('aggregates.gapAnalysis', () => courseProgress(courseMoments(db, undefined)))

  router.register('aggregates.weakestTopics', (input): WeakTopic[] => {
    const opts = input as { limit?: number; courseTag?: string } | undefined
    const limit = opts?.limit ?? 10
    return courseMoments(db, opts?.courseTag)
      .filter((m) => m.status === 'review')
      .sort((a, b) =>
        (a.latestScore ?? 0) - (b.latestScore ?? 0)
        || desc(a.confusedAt, b.confusedAt)
        || Date.parse(b.recordingAt) - Date.parse(a.recordingAt)
        || a.startMs - b.startMs
        || a.course.localeCompare(b.course))
      .slice(0, limit)
      .map((m, i) => ({
        rank: i + 1,
        segmentId: m.segId,
        recordingId: m.recordingId,
        recordingTitle: m.recordingTitle,
        offsetMs: m.startMs,
        label: label(db, m),
        course: m.course,
        confidence: m.latestScore == null ? null : Math.round(m.latestScore),
        confused: m.confused,
      }))
  })
}

/** Later instants first, never-marked last (SQL `DESC NULLS LAST`). */
function desc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return Date.parse(b) - Date.parse(a)
}

function courseMoments(db: InMemoryDb, courseTag: string | undefined): CourseMoment[] {
  const moments: CourseMoment[] = []
  for (const tag of db.tags) {
    if (tag.target_type !== 'recording' || !COURSE_LABELS.includes(tag.label)) continue
    const rec = db.recordings.find((r) => r.id === tag.target_id)
    if (!rec) continue
    if (courseTag && !db.tags.some((t) => t.target_type === 'recording' && t.target_id === rec.id && t.label === courseTag)) continue
    const segs = db.transcriptSegments
      .filter((s) => s.recording_id === rec.id)
      .sort((a, b) => a.start_ms - b.start_ms)
    segs.forEach((seg, i) => {
      const latest = db.confidenceSignals
        .filter((cs) => cs.target_type === 'transcript_segment' && cs.target_id === seg.id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))[0]
      const marks = db.tags
        .filter((t) => t.target_type === 'transcript_segment' && t.target_id === seg.id && t.label === 'confused')
        .map((t) => t.created_at)
        .sort()
      const confusedAt = marks.length ? marks[marks.length - 1] : null
      const signals = { latestScore: latest?.score ?? null, latestAt: latest?.created_at ?? null, confusedAt }
      const status = momentStatus(signals)
      const confused = stillConfused(signals)
      moments.push({
        segId: seg.id,
        recordingId: rec.id,
        recordingTitle: rec.title,
        recordingAt: rec.created_at,
        startMs: seg.start_ms,
        text: seg.text,
        before: segs[i - 1]?.text ?? '',
        after: segs[i + 1]?.text ?? '',
        course: tag.label,
        latestScore: signals.latestScore,
        confusedAt,
        confused,
        status,
      })
    })
  }
  return moments
}

function courseProgress(moments: CourseMoment[]): CourseProgress[] {
  const byCourse = new Map<string, CourseMoment[]>()
  for (const m of moments) byCourse.set(m.course, [...(byCourse.get(m.course) ?? []), m])
  return [...byCourse.entries()]
    .map(([course, ms]) => {
      const solid = ms.filter((m) => m.status === 'solid').length
      return {
        course,
        totalMoments: ms.length,
        solidMoments: solid,
        reviewMoments: ms.filter((m) => m.status === 'review').length,
        percentage: Math.round((solid / ms.length) * 100),
      }
    })
    .sort((a, b) => a.course.localeCompare(b.course))
}

function label(db: InMemoryDb, m: CourseMoment): string {
  const review = db.planItems
    .filter((p) => p.kind === 'task' && p.subtype === REVIEW_SUBTYPE && p.source_type === 'recording'
      && p.source_id === m.recordingId && p.source_offset_ms === m.startMs)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  const fromReview = review ? review.title.replace(/^review:\s*/i, '').trim() : ''
  return topicLabel(fromReview || keyPhrase(m.text, { before: m.before, after: m.after }), m.text)
}
