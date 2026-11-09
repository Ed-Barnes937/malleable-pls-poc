import { useCallback } from 'react'
import type { PlanItemRef } from '@pls/lens-framework'
import { usePlanItemLookup } from '@pls/substrate-client'
import { useToastStore } from './toast'

/**
 * "See it" on a toast about a plan item (a new review): shows the block with
 * `show` only if it is still there. A toast can outlive its item (its
 * lecture deleted, the block deleted elsewhere); then it says so in a short
 * note instead, and never throws. A lookup that fails (offline) says that.
 */
export function useRevealPlanItem(show: (item: PlanItemRef) => boolean): (item: PlanItemRef) => Promise<void> {
  const lookup = usePlanItemLookup()
  const pushToast = useToastStore((s) => s.push)
  return useCallback(async (item: PlanItemRef) => {
    let found: unknown
    try {
      found = await lookup(item.id)
    } catch {
      pushToast({ message: "Couldn't find that study block - try again", tone: 'error', key: 'reveal-plan-item' })
      return
    }
    if (!found) {
      pushToast({ message: 'That study block was deleted', tone: 'info', key: 'reveal-plan-item' })
      return
    }
    show(item)
  }, [lookup, pushToast, show])
}
