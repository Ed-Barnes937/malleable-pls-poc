import { useState } from 'react'
import { ScopePill } from '../packages/workspace-shell/src/ScopePill'

const OPTIONS = [
  { value: 'a', label: 'Apples' },
  { value: 'b', label: 'Bananas' },
  { value: 'c', label: 'A very long option label that cannot fit in a narrow pill' },
]

/**
 * A ScopePill holding its own value, in a box `width` px wide, between two
 * buttons to Tab from and to. Every confirmed choice is listed in `changes`.
 */
export function ScopePillHarness({ width = 600, initial = 'a' }: { width?: number; initial?: string }) {
  const [value, setValue] = useState(initial)
  const [changes, setChanges] = useState<string[]>([])
  return (
    <div style={{ width, display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <button type="button">Before</button>
      <ScopePill
        label="Fruit"
        data-testid="pill"
        value={value}
        onChange={(next) => {
          setValue(next)
          setChanges((c) => [...c, next])
        }}
        describe={(v) => ({ text: OPTIONS.find((o) => o.value === v)!.label, dotClassName: 'bg-course-biology' })}
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </ScopePill>
      <output data-testid="value">{value}</output>
      <output data-testid="changes">{changes.join(',')}</output>
      <button type="button">After</button>
    </div>
  )
}
