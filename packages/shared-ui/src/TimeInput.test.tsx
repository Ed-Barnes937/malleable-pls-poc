import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { TimeInput } from './TimeInput'

function Harness({ initial = '09:30', step }: { initial?: string | null; step?: number }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <TimeInput label="Starts" value={value} onValueChange={setValue} step={step} hourCycle={24} />
      <output data-testid="value">{value ?? 'none'}</output>
    </>
  )
}

const value = () => screen.getByTestId('value').textContent

describe('TimeInput', () => {
  it('is a labelled group of spinbuttons', async () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Starts' })).toBeVisible()
    expect(screen.getAllByRole('spinbutton').map((s) => s.getAttribute('aria-label'))).toEqual(['hour', 'minute'])
  })

  it('typing fills the segments and reports 24-hour HH:MM', async () => {
    const user = userEvent.setup()
    render(<Harness initial={null} />)
    screen.getByRole('spinbutton', { name: 'hour' }).focus()
    await user.keyboard('1445')
    expect(value()).toBe('14:45')
  })

  it('with the default step, arrows move the minute by one', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('spinbutton', { name: 'minute' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(value()).toBe('09:31')
  })

  it('step 15: ArrowUp and ArrowDown on the minute move to the next and previous quarter hour', async () => {
    const user = userEvent.setup()
    render(<Harness initial="09:30" step={15} />)
    screen.getByRole('spinbutton', { name: 'minute' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(value()).toBe('09:45')
    await user.keyboard('{ArrowUp}')
    expect(value()).toBe('09:00')
    await user.keyboard('{ArrowDown}')
    expect(value()).toBe('09:45')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(value()).toBe('09:15')
  })

  it('step 15 snaps an off-grid minute to the grid in the direction pressed', async () => {
    const user = userEvent.setup()
    render(<Harness initial="09:07" step={15} />)
    screen.getByRole('spinbutton', { name: 'minute' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(value()).toBe('09:15')
    await user.keyboard('{ArrowDown}')
    expect(value()).toBe('09:00')
  })

  it('step does not change how the hour steps', async () => {
    const user = userEvent.setup()
    render(<Harness initial="09:30" step={15} />)
    screen.getByRole('spinbutton', { name: 'hour' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(value()).toBe('10:30')
  })
})
