import { useCallback } from 'react'
import { useSubstrateMutations } from './substrate-context'
import { confirmWithUndo } from './undo-toast'
import type { LensNotice } from './types'

const UNDO_FAILED = "Couldn't undo that. Try again."

/** The key every notice about one moment's marks shares, so a newer one replaces an older (and its stale Undo). */
export function momentMarksKey(segmentId: string): string {
  return `marks-${segmentId}`
}

/**
 * A moment's confusing and sorted marks, changed the same way from every
 * widget (Transcript, Test Me). Each says what happened in the shell's
 * notification bar: sorting and turning a confusing mark off take the
 * moment's open reviews off the plan, so they offer Undo, which puts the mark
 * and those reviews back. A change that fails says so, and resolves false.
 */
export function useMomentMarks(onNotify?: (notice: LensNotice) => void) {
  const mutations = useSubstrateMutations()
  const sortMoment = mutations.useSortMoment()
  const unsortMoment = mutations.useUnsortMoment()
  const unmarkConfused = mutations.useUnmarkConfused()
  const remarkConfused = mutations.useRemarkConfused()

  const failed = useCallback(
    (segmentId: string, message: string) => onNotify?.({ message, tone: 'error', key: momentMarksKey(segmentId) }),
    [onNotify],
  )
  const sort = useCallback(
    async (segmentId: string): Promise<boolean> => {
      try {
        const { dismissed } = await sortMoment.mutateAsync({ segmentId })
        confirmWithUndo(onNotify, {
          message: dismissed.length > 0 ? 'Marked sorted. Its review is off your plan' : 'Marked sorted',
          key: momentMarksKey(segmentId),
          failMessage: UNDO_FAILED,
          undo: () => unsortMoment.mutateAsync({ segmentId, restore: dismissed }),
        })
        return true
      } catch {
        failed(segmentId, "Couldn't mark it sorted. Try again.")
        return false
      }
    },
    [sortMoment, unsortMoment, onNotify, failed],
  )

  const unsort = useCallback(
    async (segmentId: string): Promise<boolean> => {
      try {
        await unsortMoment.mutateAsync({ segmentId })
        onNotify?.({ message: 'Back on your moments to review', key: momentMarksKey(segmentId) })
        return true
      } catch {
        failed(segmentId, "Couldn't put it back on your moments to review. Try again.")
        return false
      }
    },
    [unsortMoment, onNotify, failed],
  )

  const unmark = useCallback(
    async (segmentId: string): Promise<boolean> => {
      try {
        const { confusedAt, dismissed } = await unmarkConfused.mutateAsync({ segmentId })
        if (confusedAt) {
          confirmWithUndo(onNotify, {
            message: dismissed.length > 0 ? 'No longer marked confusing. Its review is off your plan' : 'No longer marked confusing',
            key: momentMarksKey(segmentId),
            failMessage: UNDO_FAILED,
            undo: () => remarkConfused.mutateAsync({ segmentId, confusedAt, restore: dismissed }),
          })
        }
        return true
      } catch {
        failed(segmentId, "Couldn't take the confusing mark off. Try again.")
        return false
      }
    },
    [unmarkConfused, remarkConfused, onNotify, failed],
  )

  return {
    sort,
    unsort,
    unmarkConfused: unmark,
    isPending: sortMoment.isPending || unsortMoment.isPending || unmarkConfused.isPending,
  }
}
