import { useState } from 'react'
import type { FocusedPlanItem, PlanItemRef, Scope, ShowMomentResult } from '@pls/lens-framework'
import CalendarLens from '@pls/lens-calendar'
import { TestProviders } from './mount-wrapper'

/**
 * Mounts the Calendar at a realistic panel size with a stub `onShowMoment`
 * that records each request (as "recordingId@offsetMs") in a list the test
 * can read and answers `result`, and a stub `onEditAutomation` that records
 * each automation asked for (as "edit <workflowId>") in the same list.
 * Each of `reveal` gets a "Reveal <id>" button that hands it to the Calendar
 * as `focusedPlanItem`, as the shell does for "See it"; requests the Calendar
 * reports shown are listed in `plan-item-calls`.
 * Saved config changes are listed as JSON in `config-calls`.
 */
export function CalendarHarness({
  highlight,
  result = 'shown',
  config = {},
  reveal = [],
  width = 1000,
}: {
  highlight?: Scope
  /** The Calendar panel's width (the demo board's is about 900), or e.g. '100%'. */
  width?: number | string
  /** `fail` makes the stub reject, like a failed scope update. */
  result?: ShowMomentResult | 'fail'
  /** The panel's saved config, e.g. `{ view: 'week' }`. */
  config?: Record<string, unknown>
  reveal?: PlanItemRef[]
}) {
  const [calls, setCalls] = useState<string[]>([])
  const [focused, setFocused] = useState<FocusedPlanItem | undefined>()
  const [shown, setShown] = useState<number[]>([])
  const [nextRequest, setNextRequest] = useState(1)
  const [configCalls, setConfigCalls] = useState<string[]>([])
  return (
    <TestProviders>
      <div className="flex flex-col bg-surface p-3" style={{ width, height: 640 }}>
        <CalendarLens
          panelId="calendar-test"
          scope={{}}
          highlight={highlight}
          config={config}
          onConfigChange={(patch) => setConfigCalls((c) => [...c, JSON.stringify(patch)])}
          onShowMoment={async (moment) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}`])
            if (result === 'fail') throw new Error('setScope failed')
            return result
          }}
          focusedPlanItem={focused}
          onPlanItemShown={(requestId) => {
            setShown((s) => [...s, requestId])
            setFocused((f) => (f?.requestId === requestId ? undefined : f))
          }}
          onEditAutomation={(workflowId) => setCalls((c) => [...c, `edit ${workflowId}`])}
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
      <ul data-testid="config-calls">
        {configCalls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
