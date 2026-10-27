import { useState } from 'react'
import type { FocusedPlanItem, PlanItemRef, Scope, ShowMomentResult } from '@pls/lens-framework'
import CalendarLens from '@pls/lens-calendar'
import { TestProviders } from './mount-wrapper'

/**
 * Mounts the Calendar at a realistic panel size with a stub `onShowMoment`
 * that records each request (as "recordingId@offsetMs [elsewhere]") in a
 * list the test can read, and answers `result` (or `no-viewer` elsewhere).
 * Each of `reveal` gets a "Reveal <id>" button that hands it to the Calendar
 * as `focusedPlanItem`, as the shell does for "See it"; requests the Calendar
 * reports shown are listed in `plan-item-calls`.
 */
export function CalendarHarness({
  highlight,
  result = 'shown',
  reveal = [],
  width = 1000,
}: {
  highlight?: Scope
  /** The Calendar panel's width (the demo board's is about 900). */
  width?: number
  /** `fail` makes the stub reject, like a failed scope update. */
  result?: ShowMomentResult | 'fail'
  reveal?: PlanItemRef[]
}) {
  const [calls, setCalls] = useState<string[]>([])
  const [focused, setFocused] = useState<FocusedPlanItem | undefined>()
  const [shown, setShown] = useState<number[]>([])
  const [nextRequest, setNextRequest] = useState(1)
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
          focusedPlanItem={focused}
          onPlanItemShown={(requestId) => {
            setShown((s) => [...s, requestId])
            setFocused((f) => (f?.requestId === requestId ? undefined : f))
          }}
        />
      </div>
      {reveal.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setFocused({ ...item, requestId: nextRequest })
            setNextRequest((n) => n + 1)
          }}
        >
          Reveal {item.id}
        </button>
      ))}
      <ul data-testid="plan-item-calls">
        {shown.map((id) => <li key={id}>{id}</li>)}
      </ul>
      <ul data-testid="moment-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
