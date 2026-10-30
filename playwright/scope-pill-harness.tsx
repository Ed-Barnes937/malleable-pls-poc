import { useState } from 'react'
import { ScopePill } from '../packages/workspace-shell/src/ScopePill'

const OPTIONS = [
  { value: 'a', label: 'Apples' },
  { value: 'b', label: 'Bananas' },
  { value: 'c', label: 'A very long option label that cannot fit in a narrow pill' },
]

/** A ScopePill holding its own value, in a box `width` px wide, after a button to Tab from. */
export function ScopePillHarness({ width = 600, initial = 'a' }: { width?: number; initial?: string }) {
  const [value, setValue] = useState(initial)
  const text = OPTIONS.find((o) => o.value === value)!.label
  return (
    <div style={{ width, display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <button type="button">Before</button>
      <ScopePill label="Fruit" data-testid="pill" value={value} onChange={setValue} text={text} dotClassName="bg-course-biology">
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </ScopePill>
      <output data-testid="value">{value}</output>
    </div>
  )
}
