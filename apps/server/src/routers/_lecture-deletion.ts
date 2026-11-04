import { createHash } from 'crypto'
import type { TxSql } from '@pls/db'
import { LECTURE_SUMMARY_ANCHOR, lectureDeletionFingerprintSource, type LectureDeletePreview } from '@pls/substrate'

type Fragment = ReturnType<TxSql['unsafe']>

/** The recordings being deleted, and their segments. */
interface Targets {
  recordingIds: string[]
  segmentIds: string[]
}

/** True when (`type`, `id`) is one of the recordings or one of their segments. */
function onRecordingData(tx: TxSql, type: Fragment, id: Fragment, { recordingIds, segmentIds }: Targets): Fragment {
  return tx`(
    (${type} = 'recording' AND ${id} = ANY(${recordingIds}::text[]))
    OR (${type} = 'transcript_segment' AND ${id} = ANY(${segmentIds}::text[]))
  )`
}

/**
 * What a recording owns beyond its row, as one list that both the preview
 * (counting) and the delete read, so they can't disagree. Segments go with
 * the recording (foreign key cascade); these point at it, or at one of its
 * segments, by type and id with no foreign key, so they are deleted here.
 * A new table or target type that can point at a recording or a segment
 * belongs in this list (and in the seeded db test that checks nothing is
 * left behind). Plan items made from its moments are handled apart, as the
 * finished ones stay (`derivedPlanItemsWhere`).
 */
const RECORDING_DATA: { table: string; kind: string; where: (tx: TxSql, t: Targets) => Fragment }[] = [
  { table: 'tags', kind: 'tag', where: (tx, t) => onRecordingData(tx, tx`target_type`, tx`target_id`, t) },
  {
    table: 'annotations',
    kind: 'annotation',
    // A note on a moment, or the recording's AI summary.
    where: (tx, t) => tx`(
      ${onRecordingData(tx, tx`anchor_type`, tx`anchor_id`, t)}
      OR (anchor_type = ${LECTURE_SUMMARY_ANCHOR} AND anchor_id = ANY(${t.recordingIds}::text[]))
    )`,
  },
  { table: 'confidence_signals', kind: 'confidence', where: (tx, t) => onRecordingData(tx, tx`target_type`, tx`target_id`, t) },
  {
    table: 'links',
    kind: 'link',
    // Either end.
    where: (tx, t) => tx`(${onRecordingData(tx, tx`source_type`, tx`source_id`, t)} OR ${onRecordingData(tx, tx`target_type`, tx`target_id`, t)})`,
  },
]

/** Plan items made from the recordings' moments (a review study block). */
function derivedPlanItemsWhere(tx: TxSql, userId: string, recordingIds: string[]): Fragment {
  return tx`user_id = ${userId} AND source_type = 'recording' AND source_id = ANY(${recordingIds}::text[])`
}

async function targetsOf(tx: TxSql, userId: string, recordingIds: string[]): Promise<Targets> {
  const rows = await tx`
    SELECT id FROM transcript_segments WHERE recording_id = ANY(${recordingIds}::text[]) AND user_id = ${userId}
  `
  return { recordingIds, segmentIds: rows.map((r) => r.id as string) }
}

/** The ids `RECORDING_DATA` would delete, prefixed by kind (ids are only unique within a table). */
async function recordingDataIds(tx: TxSql, userId: string, targets: Targets): Promise<string[]> {
  const ids: string[] = []
  for (const { table, kind, where } of RECORDING_DATA) {
    const rows = await tx`SELECT id FROM ${tx(table)} WHERE user_id = ${userId} AND ${where(tx, targets)}`
    ids.push(...rows.map((r) => `${kind}:${r.id as string}`))
  }
  return ids
}

/** Plan items made from the recordings' moments, soonest first; `done` ones stay when the recordings go. */
async function derivedPlanItems(tx: TxSql, userId: string, recordingIds: string[]) {
  const rows = await tx`
    SELECT id, title, starts_at, due_at, status FROM plan_items
    WHERE ${derivedPlanItemsWhere(tx, userId, recordingIds)}
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

/**
 * Locks the plan items made from the recordings' moments (FOR UPDATE, in id
 * order, the order any other write locking several of them should use), so
 * the list made next can't change before they are deleted or kept.
 */
export async function lockDerivedPlanItems(tx: TxSql, userId: string, recordingIds: string[]): Promise<void> {
  await tx`SELECT id FROM plan_items WHERE ${derivedPlanItemsWhere(tx, userId, recordingIds)} ORDER BY id FOR UPDATE`
}

/**
 * Deletes what points at these recordings and their segments
 * (`RECORDING_DATA`), ahead of deleting the recordings themselves (their
 * segments go with them by cascade). Unfinished plan items made from their
 * moments go, with their course tags; finished ones stay as the student's
 * record, no longer linked to a moment. The one place for this, so deleting
 * a lecture and (later) one recording clean up the same way.
 */
export async function deleteRecordingData(tx: TxSql, userId: string, recordingIds: string[]): Promise<void> {
  if (recordingIds.length === 0) return
  const targets = await targetsOf(tx, userId, recordingIds)

  const removed = await tx`
    DELETE FROM plan_items WHERE ${derivedPlanItemsWhere(tx, userId, recordingIds)} AND status <> 'done'
    RETURNING id
  `
  await tx`
    DELETE FROM tags
    WHERE user_id = ${userId} AND target_type = 'plan_item' AND target_id = ANY(${removed.map((r) => r.id as string)}::text[])
  `
  await tx`
    UPDATE plan_items SET source_type = NULL, source_id = NULL, source_offset_ms = NULL, updated_at = now()
    WHERE ${derivedPlanItemsWhere(tx, userId, recordingIds)}
  `
  for (const { table, where } of RECORDING_DATA) {
    await tx`DELETE FROM ${tx(table)} WHERE user_id = ${userId} AND ${where(tx, targets)}`
  }
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
  const targets = await targetsOf(tx, userId, recordingIds)
  const markIds = await recordingDataIds(tx, userId, targets)
  const planItems = await derivedPlanItems(tx, userId, recordingIds)
  const resources = await tx`SELECT id, file_key FROM resources WHERE lecture_id = ${lecture.id} AND user_id = ${userId}`
  const resourceFileKeys = resources.flatMap((r) => (r.file_key ? [r.file_key as string] : []))
  const going = planItems.filter((p) => !p.done)
  const kept = planItems.filter((p) => p.done)

  const fingerprint = createHash('sha256')
    .update(lectureDeletionFingerprintSource({
      recordings: recordingIds,
      segments: targets.segmentIds,
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
