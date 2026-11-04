import { createHash } from 'crypto'
import type { TxSql } from '@pls/db'
import { LECTURE_SUMMARY_ANCHOR, lectureDeletionFingerprintSource, type LectureDeletePreview } from '@pls/substrate'

type Fragment = ReturnType<TxSql['unsafe']>

/*
 * What a recording owns beyond its row. Segments go with it (foreign key
 * cascade); everything else points at it, or at one of its segments, by
 * type and id with no foreign key, so it is deleted here:
 *
 *   tags                target_type 'recording' | 'transcript_segment'
 *   annotations         anchor_type 'transcript_segment' | 'recording' | LECTURE_SUMMARY_ANCHOR (on the recording)
 *   links               either end 'recording' | 'transcript_segment'
 *   confidence_signals  target_type 'recording' | 'transcript_segment'
 *   plan_items          source_type 'recording' (a study block made from a moment)
 *
 * A new target type that can point at a recording or a segment belongs
 * here, and in the seeded db test that checks nothing is left behind.
 */

/** True when (`type`, `id`) is one of the recordings or one of their segments. */
function onRecordingData(tx: TxSql, type: Fragment, id: Fragment, recordingIds: string[], segmentIds: string[]): Fragment {
  return tx`(
    (${type} = 'recording' AND ${id} = ANY(${recordingIds}::text[]))
    OR (${type} = 'transcript_segment' AND ${id} = ANY(${segmentIds}::text[]))
  )`
}

/** The same for an annotation, which can also be a recording's summary. */
function annotationOnRecordingData(tx: TxSql, recordingIds: string[], segmentIds: string[]): Fragment {
  return tx`(
    ${onRecordingData(tx, tx`anchor_type`, tx`anchor_id`, recordingIds, segmentIds)}
    OR (anchor_type = ${LECTURE_SUMMARY_ANCHOR} AND anchor_id = ANY(${recordingIds}::text[]))
  )`
}

async function segmentIdsOf(tx: TxSql, userId: string, recordingIds: string[]): Promise<string[]> {
  const rows = await tx`
    SELECT id FROM transcript_segments WHERE recording_id = ANY(${recordingIds}::text[]) AND user_id = ${userId}
  `
  return rows.map((r) => r.id as string)
}

/** Plan items made from the recordings' moments, soonest first; `done` ones stay when the recordings go. */
async function derivedPlanItems(tx: TxSql, userId: string, recordingIds: string[]) {
  const rows = await tx`
    SELECT id, title, starts_at, due_at, status FROM plan_items
    WHERE user_id = ${userId} AND source_type = 'recording' AND source_id = ANY(${recordingIds}::text[])
    ORDER BY COALESCE(starts_at, due_at) NULLS LAST, created_at, id
  `
  const iso = (v: unknown) => (v == null ? null : (v as Date).toISOString())
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    starts_at: iso(r.starts_at),
    due_at: iso(r.due_at),
    done: r.status === 'done',
  }))
}

/** What deleting the recordings would remove from other tables, by id. */
async function recordingData(tx: TxSql, userId: string, recordingIds: string[]) {
  const segmentIds = await segmentIdsOf(tx, userId, recordingIds)
  const on = (type: Fragment, id: Fragment) => onRecordingData(tx, type, id, recordingIds, segmentIds)
  // Prefixed by table, as ids are only unique within one.
  const marks = await tx`
    SELECT 'tag:' || id AS id FROM tags WHERE user_id = ${userId} AND ${on(tx`target_type`, tx`target_id`)}
    UNION ALL
    SELECT 'annotation:' || id FROM annotations WHERE user_id = ${userId} AND ${annotationOnRecordingData(tx, recordingIds, segmentIds)}
    UNION ALL
    SELECT 'confidence:' || id FROM confidence_signals WHERE user_id = ${userId} AND ${on(tx`target_type`, tx`target_id`)}
    UNION ALL
    SELECT 'link:' || id FROM links
    WHERE user_id = ${userId} AND (${on(tx`source_type`, tx`source_id`)} OR ${on(tx`target_type`, tx`target_id`)})
  `
  const planItems = await derivedPlanItems(tx, userId, recordingIds)
  return { segmentIds, markIds: marks.map((m) => m.id as string), planItems }
}

/**
 * Deletes what points at these recordings and their segments (see the table
 * above), ahead of deleting the recordings themselves (their segments go
 * with them by cascade). Unfinished plan items made from their moments go,
 * with their course tags; finished ones stay as the student's record, no
 * longer linked to a moment. The one place for this, so deleting a lecture
 * and (later) one recording clean up the same way.
 */
export async function deleteRecordingData(tx: TxSql, userId: string, recordingIds: string[]): Promise<void> {
  if (recordingIds.length === 0) return
  const segmentIds = await segmentIdsOf(tx, userId, recordingIds)
  const on = (type: Fragment, id: Fragment) => onRecordingData(tx, type, id, recordingIds, segmentIds)

  const removed = await tx`
    DELETE FROM plan_items
    WHERE user_id = ${userId} AND source_type = 'recording' AND source_id = ANY(${recordingIds}::text[])
      AND status <> 'done'
    RETURNING id
  `
  await tx`
    DELETE FROM tags
    WHERE user_id = ${userId} AND target_type = 'plan_item' AND target_id = ANY(${removed.map((r) => r.id as string)}::text[])
  `
  await tx`
    UPDATE plan_items SET source_type = NULL, source_id = NULL, source_offset_ms = NULL, updated_at = now()
    WHERE user_id = ${userId} AND source_type = 'recording' AND source_id = ANY(${recordingIds}::text[])
  `
  await tx`DELETE FROM tags WHERE user_id = ${userId} AND ${on(tx`target_type`, tx`target_id`)}`
  await tx`DELETE FROM annotations WHERE user_id = ${userId} AND ${annotationOnRecordingData(tx, recordingIds, segmentIds)}`
  await tx`
    DELETE FROM links
    WHERE user_id = ${userId} AND (${on(tx`source_type`, tx`source_id`)} OR ${on(tx`target_type`, tx`target_id`)})
  `
  await tx`DELETE FROM confidence_signals WHERE user_id = ${userId} AND ${on(tx`target_type`, tx`target_id`)}`
}

/** Everything deleting a lecture involves: the confirm step's preview, and what to remove from disk after. */
export interface LectureDeletion {
  preview: LectureDeletePreview
  recordingIds: string[]
  audioUrls: string[]
  resourceFileKeys: string[]
}

/** What deleting `lecture` (the student's own, checked by the caller) would remove, as it stands in `tx`. */
export async function planLectureDeletion(
  tx: TxSql,
  userId: string,
  lecture: { id: string; title: string },
): Promise<LectureDeletion> {
  const recordings = await tx`
    SELECT id, duration, audio_url FROM recordings WHERE lecture_id = ${lecture.id} AND user_id = ${userId}
  `
  const recordingIds = recordings.map((r) => r.id as string)
  const { segmentIds, markIds, planItems } = await recordingData(tx, userId, recordingIds)
  const resources = await tx`SELECT id, file_key FROM resources WHERE lecture_id = ${lecture.id} AND user_id = ${userId}`
  const resourceFileKeys = resources.flatMap((r) => (r.file_key ? [r.file_key as string] : []))
  const going = planItems.filter((p) => !p.done)
  const kept = planItems.filter((p) => p.done)

  const fingerprint = createHash('sha256')
    .update(lectureDeletionFingerprintSource({
      recordings: recordingIds,
      segments: segmentIds,
      marks: markIds,
      planItems: going.map((p) => p.id),
      keptPlanItems: kept.map((p) => p.id),
      resources: resources.map((r) => r.id as string),
    }))
    .digest('hex')

  return {
    preview: {
      lecture: { id: lecture.id, title: lecture.title },
      recordings: {
        count: recordings.length,
        durationMs: recordings.reduce((sum, r) => sum + Number(r.duration ?? 0), 0),
      },
      marks: markIds.length,
      planItems: going.map(({ id, title, starts_at, due_at }) => ({ id, title, starts_at, due_at })),
      keptPlanItems: kept.length,
      resources: { count: resources.length, files: resourceFileKeys.length },
      fingerprint,
    },
    recordingIds,
    audioUrls: recordings.flatMap((r) => (r.audio_url ? [r.audio_url as string] : [])),
    resourceFileKeys,
  }
}
