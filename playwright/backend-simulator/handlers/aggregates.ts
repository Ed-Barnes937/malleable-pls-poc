import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

const COURSE_LABELS = ['biology', 'chemistry', 'physics']

export function registerAggregatesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('aggregates.weeklyOverview', () => {
    const courseSegments = buildCourseSegmentMap(db)
    const segConfidence = buildSegConfidenceMap(db)
    const confusedSegIds = new Set(
      db.tags
        .filter((t) => t.label === 'confused')
        .map((t) => t.target_id),
    )

    return Array.from(courseSegments.entries())
      .map(([course, segIds]) => {
        const total = segIds.length
        const confident = segIds.filter((id) => (segConfidence.get(id) ?? 0) >= 70).length
        const gaps = segIds.filter((id) => confusedSegIds.has(id)).length
        return {
          course,
          totalSegments: total,
          confidentSegments: confident,
          gapCount: gaps,
          percentage: total > 0 ? Math.round((confident / total) * 100) : 0,
        }
      })
      .sort((a, b) => a.course.localeCompare(b.course))
  })

  router.register('aggregates.gapAnalysis', () => {
    const courseSegments = buildCourseSegmentMap(db)
    const segConfidence = buildSegConfidenceMap(db)

    return Array.from(courseSegments.entries())
      .map(([course, segIds]) => {
        const total = segIds.length
        const confident = segIds.filter((id) => (segConfidence.get(id) ?? 0) >= 70).length
        const weak = segIds.filter((id) => (segConfidence.get(id) ?? 0) < 40).length
        return {
          course,
          percentage: total > 0 ? Math.round((confident / total) * 100) : 0,
          weakAreaCount: weak,
        }
      })
      .sort((a, b) => a.course.localeCompare(b.course))
  })

  router.register('aggregates.weakestTopics', (input) => {
    const limit = (input as number | undefined) ?? 10
    const segConfidence = buildSegAvgConfidenceMap(db)

    const ranked = db.transcriptSegments
      .map((seg) => {
        const rec = db.recordings.find((r) => r.id === seg.recording_id)
        const courseTag = rec
          ? db.tags.find(
              (t) => t.target_type === 'recording' && t.target_id === rec.id && COURSE_LABELS.includes(t.label),
            )
          : undefined
        if (!courseTag) return null
        return {
          conceptLabel: seg.text,
          course: courseTag.label,
          week: 'Week 1',
          avgConfidence: segConfidence.get(seg.id) ?? 0,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.avgConfidence - b.avgConfidence)
      .slice(0, limit)
      .map((item, i) => ({ rank: i + 1, ...item }))

    return ranked
  })
}

function buildCourseSegmentMap(db: InMemoryDb): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const tag of db.tags) {
    if (tag.target_type !== 'recording' || !COURSE_LABELS.includes(tag.label)) continue
    const segs = db.transcriptSegments
      .filter((s) => s.recording_id === tag.target_id)
      .map((s) => s.id)
    const existing = result.get(tag.label) ?? []
    result.set(tag.label, [...existing, ...segs])
  }
  return result
}

function buildSegConfidenceMap(db: InMemoryDb): Map<string, number> {
  const result = new Map<string, number>()
  for (const cs of db.confidenceSignals) {
    if (cs.target_type !== 'transcript_segment') continue
    const current = result.get(cs.target_id) ?? 0
    if (cs.score > current) result.set(cs.target_id, cs.score)
  }
  return result
}

function buildSegAvgConfidenceMap(db: InMemoryDb): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const cs of db.confidenceSignals) {
    if (cs.target_type !== 'transcript_segment') continue
    const entry = sums.get(cs.target_id) ?? { total: 0, count: 0 }
    entry.total += cs.score
    entry.count += 1
    sums.set(cs.target_id, entry)
  }
  const result = new Map<string, number>()
  for (const [id, { total, count }] of sums) {
    result.set(id, total / count)
  }
  return result
}
