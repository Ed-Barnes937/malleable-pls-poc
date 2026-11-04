import { useState } from 'react'
import { useDeleteLecture, useLectureDeletePreview } from '@pls/substrate-client'
import type { LectureDeletePreview } from '@pls/substrate'
import { Dialog, dayAndTime, doByLabel } from '@pls/shared-ui'

/** How many plan items the confirm step names before "and N more". */
export const NAMED_PLAN_ITEMS = 5

/** "1 recording", "2 recordings". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "1h 04m", "12m", "45s": a recording length. */
export function lengthLabel(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}

/** When a plan item is: "Thu 12 Nov 14:00", "Do by Fri 13 Nov", or "Not scheduled". */
function whenLabel(item: LectureDeletePreview['planItems'][number]): string {
  if (item.starts_at) return dayAndTime(item.starts_at)
  if (item.due_at) return doByLabel(item.due_at)
  return 'Not scheduled'
}

/** "(2 finished ones stay)" after the plan items line, or nothing. */
function keptNote(kept: number): string {
  return kept === 0 ? '' : kept === 1 ? ' (1 finished one stays)' : ` (${kept} finished ones stay)`
}

/**
 * The confirm step for deleting a lecture that has something in it: what
 * goes, for good, from `lectures.deletePreview` (only the groups that have
 * anything; plan items by title and time, as they live on other widgets).
 * Cancel has focus. "Delete lecture" sends the preview's fingerprint; if the
 * lecture changed since (CONFLICT), the list is asked for again and shown
 * with a note, and nothing is deleted until the student confirms that.
 */
export function DeleteLectureDialog({ preview: initial, hasClass, onClose, onDeleted }: {
  preview: LectureDeletePreview
  /** The lecture was made for a calendar class (which stays). */
  hasClass: boolean
  onClose: () => void
  /** After the delete, with the lecture's title. */
  onDeleted: (title: string) => void
}) {
  const [preview, setPreview] = useState(initial)
  const [notice, setNotice] = useState<string | null>(null)
  const deleteLecture = useDeleteLecture()
  const fetchPreview = useLectureDeletePreview()
  const [refreshing, setRefreshing] = useState(false)

  const { recordings, marks, planItems, keptPlanItems, resources } = preview
  const busy = deleteLecture.isPending || refreshing

  const confirm = () => {
    setNotice(null)
    deleteLecture.mutateAsync({ id: preview.lecture.id, fingerprint: preview.fingerprint }).then(
      () => onDeleted(preview.lecture.title),
      async (err: { data?: { code?: string } | null }) => {
        const code = err.data?.code
        // Gone already (another tab): what the student wanted.
        if (code === 'NOT_FOUND') return onDeleted(preview.lecture.title)
        if (code !== 'CONFLICT') return setNotice("Couldn't delete the lecture - try again")
        setRefreshing(true)
        try {
          setPreview(await fetchPreview(preview.lecture.id))
          setNotice('Something was added to this lecture since. Check the list again.')
        } catch {
          setNotice("Couldn't delete the lecture - try again")
        } finally {
          setRefreshing(false)
        }
      },
    )
  }

  const named = planItems.slice(0, NAMED_PLAN_ITEMS)
  const more = planItems.length - named.length

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete "${preview.lecture.title}"?`}
      // Full width on a phone; the list scrolls between the title and the buttons.
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col"
    >
      <div data-testid="delete-lecture-dialog" className="flex min-h-0 flex-col gap-4">
        <div className="min-h-0 overflow-y-auto text-body text-text-secondary" data-testid="delete-lecture-list">
          <p>This deletes, for good:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
            {recordings.count > 0 && (
              <li>
                {count(recordings.count, 'recording', 'recordings')} ({lengthLabel(recordings.durationMs)}) and{' '}
                {recordings.count === 1 ? 'its transcript' : 'their transcripts'}
              </li>
            )}
            {marks > 0 && <li>{count(marks, 'mark or note', 'marks and notes')} on the transcript</li>}
            {planItems.length > 0 && (
              <li>
                {count(planItems.length, 'item', 'items')} made from its moments{keptNote(keptPlanItems)}:
                <ul className="mt-1 flex flex-col gap-0.5">
                  {named.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium text-text-primary">{item.title}</span>{' '}
                      <span className="text-text-muted">({whenLabel(item)})</span>
                    </li>
                  ))}
                  {more > 0 && <li className="text-text-muted">and {more} more</li>}
                </ul>
              </li>
            )}
            {resources.count > 0 && (
              <li>
                {count(resources.count, 'resource', 'resources')}
                {resources.files > 0 && `, including ${count(resources.files, 'uploaded file', 'uploaded files')}`}
              </li>
            )}
          </ul>
          {planItems.length === 0 && keptPlanItems > 0 && (
            <p className="mt-3">
              {keptPlanItems === 1
                ? 'The finished item made from its moments stays.'
                : `The ${keptPlanItems} finished items made from its moments stay.`}
            </p>
          )}
          {hasClass && <p className="mt-3">The class stays on your calendar.</p>}
        </div>
        {notice && <p role="alert" className="text-meta text-confused">{notice}</p>}
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-9 rounded-control px-3.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="h-9 rounded-control bg-confused px-3.5 text-body font-medium text-surface-raised transition-colors hover:bg-confused/90 disabled:opacity-40"
          >
            {deleteLecture.isPending ? 'Deleting...' : 'Delete lecture'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
