import { useState } from 'react'
import type { ShowMomentResult } from '@pls/lens-framework'
import WeakestTopicsLens from '@pls/lens-weakest-topics'
import { TestProviders } from './mount-wrapper'

/**
 * Mounts Weakest Topics with a stub `onShowMoment` that records each request
 * (as "recordingId@offsetMs [elsewhere]") in a list the test can read, and
 * answers `result` on this board (`shown` elsewhere).
 */
export function WeakTopicsHarness({ result = 'shown' }: { result?: ShowMomentResult }) {
  const [calls, setCalls] = useState<string[]>([])
  return (
    <TestProviders>
      <div className="flex flex-col bg-surface p-3" style={{ width: 360, height: 480 }}>
        <WeakestTopicsLens
          panelId="weak-topics-test"
          scope={{}}
          config={{}}
          onShowMoment={async (moment, options) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}${options?.elsewhere ? ' elsewhere' : ''}`])
            return options?.elsewhere ? 'shown' : result
          }}
        />
      </div>
      <ul data-testid="moment-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
