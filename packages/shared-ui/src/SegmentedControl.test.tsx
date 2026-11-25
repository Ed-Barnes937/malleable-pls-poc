import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'
import { checkPattern } from './testing'

const OPTIONS = [
  { value: 'event', label: 'Event' },
  { value: 'study', label: 'Study block' },
  { value: 'task', label: 'Task' },
]

function Harness({ onValueChange }: { onValueChange?: (v: string) => void }) {
  const [value, setValue] = useState('event')
  return (
    <SegmentedControl
      label="Kind"
      value={value}
      options={OPTIONS}
      onValueChange={(v) => { setValue(v); onValueChange?.(v) }}
    />
  )
}

describe('SegmentedControl', () => {
  it('follows the radio group ARIA pattern', async () => {
    render(<Harness />)
    await checkPattern(screen.getByRole('radiogroup', { name: 'Kind' }), 'radio-group')
  })

  it('arrow keys move the choice, wrap, and keep one tab stop', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    screen.getByRole('radio', { name: 'Event' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenLastCalledWith('study')
    expect(screen.getByRole('radio', { name: 'Study block' })).toBeChecked()
    await user.keyboard('{ArrowDown}')
    expect(onValueChange).toHaveBeenLastCalledWith('task')
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenLastCalledWith('event')
    await user.keyboard('{ArrowLeft}')
    expect(onValueChange).toHaveBeenLastCalledWith('task')
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') !== '-1')
    expect(stops).toHaveLength(1)
  })

  it('a press chooses an option', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await user.click(screen.getByRole('radio', { name: 'Task' }))
    expect(onValueChange).toHaveBeenLastCalledWith('task')
  })

  it('arrow keys skip a disabled option', async () => {
    const user = userEvent.setup()
    render(
      <SegmentedControl
        label="Kind"
        defaultValue="event"
        options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]}
      />,
    )
    screen.getByRole('radio', { name: 'Event' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Task' })).toBeChecked()
  })
})
