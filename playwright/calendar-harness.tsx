import { useState } from 'react'
import type { Scope, ShowMomentResult } from '@pls/lens-framework'
import CalendarLens from '@pls/lens-calendar'
import { TestProviders } from './mount-wrapper'

/**
 * Mounts the Calendar at a realistic panel size with a stub `onShowMoment`
 * that records each request (as "recordingId@offsetMs") in a list the test
 * can read and answers `result`, and a stub `onEditAutomation` that records
 * each automation asked for (as "edit <workflowId>") in the same list.
 */
export function CalendarHarness({
  highlight,
  result = 'shown',
}: {
  highlight?: Scope
  /** `fail` makes the stub reject, like a failed scope update. */
  result?: ShowMomentResult | 'fail'
}) {
  const [calls, setCalls] = useState<string[]>([])
  return (
    <TestProviders>
      <div className="flex flex-col bg-surface p-3" style={{ width: 1000, height: 640 }}>
        <CalendarLens
          panelId="calendar-test"
          scope={{}}
          highlight={highlight}
          config={{}}
          onShowMoment={async (moment) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}`])
            if (result === 'fail') throw new Error('setScope failed')
            return result
          }}
          onEditAutomation={(workflowId) => setCalls((c) => [...c, `edit ${workflowId}`])}
        />
      </div>
      <ul data-testid="moment-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
