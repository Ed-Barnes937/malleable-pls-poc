import { render, screen } from '@testing-library/react'
import { describe, it } from 'vitest'
import { useState } from 'react'
import { Switch } from './Switch'
import { checkPattern } from './testing'

function Harness() {
  const [on, setOn] = useState(false)
  return <Switch checked={on} onCheckedChange={setOn} label="Automation" />
}

describe('Switch', () => {
  it('follows the switch ARIA pattern', async () => {
    render(<Harness />)
    await checkPattern(screen.getByRole('switch', { name: 'Automation' }), 'switch')
  })
})
