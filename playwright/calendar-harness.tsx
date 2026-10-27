import { useState } from 'react'
import type { Scope, ShowMomentResult } from '@pls/lens-framework'
import CalendarLens from '@pls/lens-calendar'
import { TestProviders } from './mount-wrapper'

/**
 * Mounts the Calendar at a realistic panel size with a stub `onShowMoment`
 * that records each request (as "recordingId@offsetMs [elsewhere]") in a
 * list the test can read, and answers `result` (or `no-viewer` elsewhere).
 */
export function CalendarHarness({
  highlight,
  result = 'shown',
  width = 1000,
}: {
  highlight?: Scope
  /** The Calendar panel's width (the demo board's is about 900). */
  width?: number
  /** `fail` makes the stub reject, like a failed scope update. */
  result?: ShowMomentResult | 'fail'
}) {
  const [calls, setCalls] = useState<string[]>([])
  return (
    <TestProviders>
      <div className="flex flex-col bg-surface p-3" style={{ width, height: 640 }}>
        <CalendarLens
          panelId="calendar-test"
          scope={{}}
          highlight={highlight}
          config={{}}
          onShowMoment={async (moment, options) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}${options?.elsewhere ? ' elsewhere' : ''}`])
            if (result === 'fail') throw new Error('setScope failed')
            return options?.elsewhere ? 'no-viewer' : result
          }}
        />
      </div>
      <ul data-testid="moment-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
