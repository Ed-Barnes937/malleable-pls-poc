/**
 * A lecture's AI summary is stored as an annotation anchored to the whole
 * recording with this dedicated anchor type (anchor_id = recording id, one per
 * lecture, body = one line per summary line). It never collides with the
 * student's own notes, which anchor to transcript segments.
 */
export const LECTURE_SUMMARY_ANCHOR = 'recording_summary'
