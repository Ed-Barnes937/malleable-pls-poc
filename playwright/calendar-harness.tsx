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
}: {
  highlight?: Scope
  result?: ShowMomentResult
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
          onShowMoment={async (moment, options) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}${options?.elsewhere ? ' elsewhere' : ''}`])
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
