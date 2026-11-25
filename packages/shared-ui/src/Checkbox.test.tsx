import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { Checkbox } from './Checkbox'
import { checkPattern } from './testing'

describe('Checkbox', () => {
  it('follows the checkbox ARIA pattern', async () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Checkbox checked={on} onCheckedChange={setOn} label="Repeat" />
    }
    render(<Harness />)
    await checkPattern(screen.getByRole('checkbox', { name: 'Repeat' }), 'checkbox')
  })

  it('reports the new value on click and on Space', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange}>Repeat weekly</Checkbox>)
    await user.click(screen.getByText('Repeat weekly'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    screen.getByRole('checkbox', { name: 'Repeat weekly' }).focus()
    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('does not change when disabled', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox checked onCheckedChange={onCheckedChange} disabled>Locked</Checkbox>)
    await user.click(screen.getByText('Locked'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
