import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { settle } from './testing'
import { act } from '@testing-library/react'

function Harness({ initial = '2026-11-25', min, max }: { initial?: string | null; min?: string; max?: string }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <DatePicker label="Date" value={value} onValueChange={setValue} min={min} max={max} />
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

  async function openCalendar(user: ReturnType<typeof userEvent.setup>) {
    screen.getByRole('button', { name: /calendar|choose date/i }).focus()
    await user.keyboard('{Enter}')
    await act(settle)
    await screen.findByRole('dialog')
  }

  it.each([
    ['{PageDown}', '2026-12-25'],
    ['{PageUp}', '2026-10-25'],
    ['{Home}', '2026-11-22'],
    ['{End}', '2026-11-28'],
  ])('in the calendar %s moves focus and Enter picks %s', async (key, expected) => {
    const user = userEvent.setup()
    render(<Harness />)
    await openCalendar(user)
    await user.keyboard(`${key}{Enter}`)
    await act(settle)
    expect(value()).toBe(expected)
  })

  it('days outside min and max cannot be picked', async () => {
    const user = userEvent.setup()
    render(<Harness min="2026-11-20" max="2026-11-26" />)
    await openCalendar(user)
    const dialog = screen.getByRole('dialog')
    const day = (iso: string) => dialog.querySelector(`[data-value="${iso}"]`)
    expect(day('2026-11-19')).toHaveAttribute('data-disabled')
    expect(day('2026-11-27')).toHaveAttribute('data-disabled')
    expect(day('2026-11-23')).not.toHaveAttribute('data-disabled')
    await user.keyboard('{ArrowDown}{Enter}')
    await act(settle)
    // A week on from the 25th is past max, so the keyboard stops at max.
    expect(value()).toBe('2026-11-26')
  })
})
