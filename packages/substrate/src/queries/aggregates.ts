import { query } from '../db'
import type { CourseOverview, CourseGap, WeakTopic, Scope } from '../types'

export function getWeeklyOverview(scope: Scope): CourseOverview[] {
  const rows = query<{ course: string; totalSegments: number; confidentSegments: number; gapCount: number }>(
    `SELECT
       ct.label as course,
       COUNT(DISTINCT ts.id) as totalSegments,
       COUNT(DISTINCT CASE WHEN cs.score >= 70 THEN cs.target_id END) as confidentSegments,
       COUNT(DISTINCT CASE WHEN tg.label = 'confused' THEN tg.target_id END) as gapCount
     FROM tags ct
     JOIN recordings r ON ct.target_type = 'recording' AND ct.target_id = r.id
     JOIN transcript_segments ts ON ts.recording_id = r.id
     LEFT JOIN confidence_signals cs ON cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
     LEFT JOIN tags tg ON tg.target_type = 'transcript_segment' AND tg.target_id = ts.id AND tg.label = 'confused'
     WHERE ct.label IN ('biology', 'chemistry')
     GROUP BY ct.label
     ORDER BY ct.label`
  )

  return rows.map((r) => ({
    ...r,
    percentage: r.totalSegments > 0 ? Math.round((r.confidentSegments / r.totalSegments) * 100) : 0,
  }))
}

export function getGapAnalysis(): CourseGap[] {
  const rows = query<{ course: string; totalSegments: number; confidentSegments: number; weakAreaCount: number }>(
    `SELECT
       ct.label as course,
       COUNT(DISTINCT ts.id) as totalSegments,
       COUNT(DISTINCT CASE WHEN cs.score >= 70 THEN cs.target_id END) as confidentSegments,
       COUNT(DISTINCT CASE WHEN tg.label = 'confused' THEN tg.target_id END) as weakAreaCount
     FROM tags ct
     JOIN recordings r ON ct.target_type = 'recording' AND ct.target_id = r.id
     JOIN transcript_segments ts ON ts.recording_id = r.id
     LEFT JOIN confidence_signals cs ON cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
     LEFT JOIN tags tg ON tg.target_type = 'transcript_segment' AND tg.target_id = ts.id AND tg.label = 'confused'
     WHERE ct.label IN ('biology', 'chemistry')
     GROUP BY ct.label
     ORDER BY ct.label`
  )

  return rows.map((r) => ({
    course: r.course,
    percentage: r.totalSegments > 0 ? Math.round((r.confidentSegments / r.totalSegments) * 100) : 0,
    weakAreaCount: r.weakAreaCount,
  }))
}

export function getWeakestTopics(limit = 10): WeakTopic[] {
  const rows = query<{ conceptLabel: string; course: string; week: string; avgConfidence: number }>(
    `SELECT
       SUBSTR(ts.text, 1, 50) as conceptLabel,
       ct.label as course,
       'wk' || CAST((JULIANDAY(r.created_at) - JULIANDAY('2026-03-23')) / 7 + 1 AS INT) as week,
       cs.score as avgConfidence
     FROM confidence_signals cs
     JOIN transcript_segments ts ON cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
     JOIN recordings r ON ts.recording_id = r.id
     JOIN tags ct ON ct.target_type = 'recording' AND ct.target_id = r.id AND ct.label IN ('biology', 'chemistry')
     WHERE cs.score < 60
     ORDER BY cs.score ASC
     LIMIT ?`,
    [limit]
  )

  return rows.map((r, i) => ({
    rank: i + 1,
    ...r,
  }))
}
