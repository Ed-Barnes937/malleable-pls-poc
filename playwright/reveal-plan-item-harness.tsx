import { useCallback, useState } from 'react'
import { ShellProviders } from './mount-wrapper'
import { useRevealPlanItem } from '../packages/workspace-shell/src/reveal-plan-item'
import { ToastHost } from '../packages/workspace-shell/src/toast'

/** A "See it" for plan item `id`, with the toast host; says which block it showed. */
export function RevealPlanItemHarness({ id }: { id: string }) {
  return (
    <ShellProviders>
      <SeeIt id={id} />
      <ToastHost />
    </ShellProviders>
  )
}

function SeeIt({ id }: { id: string }) {
  const [shown, setShown] = useState<string | null>(null)
  const reveal = useRevealPlanItem(useCallback((item) => {
    setShown(item.id)
    return true
  }, []))
  return (
    <div>
      <button type="button" onClick={() => void reveal({ id, startsAt: '2030-11-12T14:00:00Z' })}>See it</button>
      <p data-testid="shown">{shown ?? 'nothing'}</p>
    </div>
  )
}
