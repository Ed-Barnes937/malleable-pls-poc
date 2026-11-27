import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { WEEKDAYS, type StudyHours } from '@pls/substrate'
import { Popover, PopoverTrigger } from '@pls/shared-ui'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'
import { StudyHoursEditor } from './StudyHoursEditor'

const every = Object.fromEntries(WEEKDAYS.map((d) => [d, { start: '09:00', end: '22:00' }])) as StudyHours

/** As Help me plan has it: the line's Change button opens the editor. */
function Harness({ studyHours = every }: { studyHours?: StudyHours }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} modal="trap-focus">
      <PopoverTrigger aria-label="Change when you study">Change</PopoverTrigger>
      <StudyHoursEditor studyHours={studyHours} studyMinPerDay={120} onSave={() => {}} onDone={() => setOpen(false)} />
    </Popover>
  )
}

async function open(studyHours?: StudyHours) {
  render(<Harness studyHours={studyHours} />)
  await userEvent.click(screen.getByRole('button', { name: 'Change when you study' }))
  await act(settle)
  return screen.getByRole('dialog', { name: 'When do you study?' })
}

describe('StudyHoursEditor', () => {
  it('is a named dialog (WAI-ARIA dialog pattern)', async () => {
    await checkPattern(await open(), 'dialog')
  })

  it('opens on the first time: the hour of "Start time, every day"', async () => {
    await open()
    const start = screen.getByRole('group', { name: 'Start time, every day' })
    expect(start).toContainElement(document.activeElement as HTMLElement)
    expect(document.activeElement).toHaveAccessibleName('hour')
  })

  it('with different days and no study on Monday, opens on the first field', async () => {
    await open({ ...every, mon: null, tue: { start: '10:00', end: '20:00' } })
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Study time per day' }))
  })

  it('an end saved as 24:00 (midnight) shows as 00:00 and is not an error', async () => {
    await open({ ...every, mon: null, tue: { start: '10:00', end: '24:00' } })
    const end = screen.getByRole('group', { name: 'End time, Tuesday' })
    expect(within(end).getByRole('spinbutton', { name: 'hour' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByTestId('study-hours-error')).toBeNull()
  })
})
