import { useState } from 'react'
import { Sortable, SortableHandle, SortableItem } from './Sortable'

const NAMES: Record<string, string> = { maths: 'Maths', physics: 'Physics', chem: 'Chemistry', bio: 'Biology' }

/** Stateful fixture for the Sortable component tests: a horizontal strip, as the board tabs use. Not product code. */
export function SortableHarness() {
  const [ids, setIds] = useState(['maths', 'physics', 'chem', 'bio'])
  const [commits, setCommits] = useState(0)
  return (
    <div className="w-[480px] bg-surface p-4 text-text-primary">
      <Sortable
        aria-label="Boards"
        orientation="horizontal"
        value={ids}
        onValueChange={(next) => {
          setIds(next)
          setCommits((n) => n + 1)
        }}
        label={(id) => `${NAMES[id]} board`}
        className="flex gap-1 rounded-track bg-surface-overlay p-1"
      >
        {({ order }) =>
          order.map((id) => (
            <SortableItem key={id} value={id} data-testid="tab" className="rounded-tab bg-surface-raised">
              <SortableHandle className="h-9 rounded-tab px-3.5 text-body">{NAMES[id]}</SortableHandle>
            </SortableItem>
          ))
        }
      </Sortable>
      <output data-testid="commits">{commits}</output>
    </div>
  )
}
