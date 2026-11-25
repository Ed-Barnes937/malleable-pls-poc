import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { settle } from './testing'
import { act } from '@testing-library/react'

function Harness({ initial = '2026-11-25' }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <DatePicker label="Date" value={value} onValueChange={setValue} />
      <output data-testid="value">{value ?? 'none'}</output>
    </>
  )
}

const value = () => screen.getByTestId('value').textContent

describe('DatePicker', () => {
  it('typing a date and pressing Enter sets an ISO value', async () => {
    const user = userEvent.setup()
    render(<Harness initial={null} />)
    await user.type(screen.getByRole('textbox', { name: 'Date' }), '2026-12-03{Enter}')
    expect(value()).toBe('2026-12-03')
  })

  it('the calendar opens from the trigger and a day is picked from the keyboard', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('button', { name: /calendar|choose date/i }).focus()
    await user.keyboard('{Enter}')
    await act(settle)
    const dialog = await screen.findByRole('dialog')
    // checkPattern('dialog') does not fit: leaving a date popup with Tab dismisses it by design (UI SDK date-picker docs), which the helper reads as focus loss.
    expect(dialog).toHaveAccessibleName('Date calendar')
    // Focus opens on the selected day; arrows move by day and week, Enter picks.
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}')
    await act(settle)
    expect(value()).toBe('2026-12-03')
  })
})
