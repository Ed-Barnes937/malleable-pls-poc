import { useCallback } from 'react'
import { useSubstrateMutations } from './substrate-context'
import type { LensNotice } from './types'

/**
 * Marking a confusing moment sorted, and un-sorting it, the same from every
 * widget (Transcript, Test Me). Sorting says so with Undo, which un-sorts the
 * moment and brings back the reviews sorting took off the plan.
 */
export function useMarkSorted(onNotify?: (notice: LensNotice) => void) {
  const mutations = useSubstrateMutations()
  const sortMoment = mutations.useSortMoment()
  const unsortMoment = mutations.useUnsortMoment()

  const sort = useCallback(
    async (segmentId: string) => {
      const { dismissed } = await sortMoment.mutateAsync({ segmentId })
      onNotify?.({
        message: dismissed.length > 0 ? 'Marked sorted. Its review is off your plan' : 'Marked sorted',
        key: `sorted-${segmentId}`,
        action: { label: 'Undo', onClick: () => unsortMoment.mutate({ segmentId, restore: dismissed }) },
      })
    },
    [sortMoment, unsortMoment, onNotify],
  )
  const unsort = useCallback(
    (segmentId: string) => unsortMoment.mutateAsync({ segmentId }).then(() => undefined),
    [unsortMoment],
  )
  return { sort, unsort, isPending: sortMoment.isPending || unsortMoment.isPending }
}
