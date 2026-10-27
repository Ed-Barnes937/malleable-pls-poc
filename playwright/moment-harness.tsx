import { useState } from 'react'
import type { LensProps, ShowMomentResult } from '@pls/lens-framework'
import WeakestTopicsLens from '@pls/lens-weakest-topics'
import TodoLens from '@pls/lens-todo'
import { TestProviders } from './mount-wrapper'

const LENSES = { 'weakest-topics': WeakestTopicsLens, todo: TodoLens } as const

/**
 * Mounts a widget that links to lecture moments with a stub `onShowMoment`
 * that records each request (as "recordingId@offsetMs") in a list the test
 * can read, and answers `result`. The Calendar has its own
 * (calendar-harness.tsx).
 */
export function MomentHarness({ lens, result = 'shown' }: { lens: keyof typeof LENSES; result?: ShowMomentResult }) {
  const [calls, setCalls] = useState<string[]>([])
  const Lens: React.ComponentType<LensProps> = LENSES[lens]
  return (
    <TestProviders>
      <div className="flex flex-col bg-surface p-3" style={{ width: 360, height: 480 }}>
        <Lens
          panelId="moment-test"
          scope={{}}
          config={{}}
          onShowMoment={async (moment) => {
            setCalls((c) => [...c, `${moment.recordingId}@${moment.offsetMs}`])
            return result
          }}
        />
      </div>
      <ul data-testid="moment-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </TestProviders>
  )
}
