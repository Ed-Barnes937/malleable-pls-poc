import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { UiSdkSmoke } from './UiSdkSmoke'
import { checkPattern, settle } from './testing'

describe('UI SDK foundation (vitest)', () => {
  it('renders a Popover and opens it on press', async () => {
    const user = userEvent.setup()
    render(<UiSdkSmoke />)
    await user.click(screen.getByRole('button', { name: 'Smoke trigger' }))
    await act(settle)
    expect(await screen.findByRole('dialog', { name: 'Smoke popover' })).toBeVisible()
    expect(screen.getByText('Smoke body')).toBeVisible()
  })

  it('checkPattern runs against an opened popup in one line', async () => {
    const user = userEvent.setup()
    render(<UiSdkSmoke />)
    await user.click(screen.getByRole('button', { name: 'Smoke trigger' }))
    await act(settle)
    await checkPattern(await screen.findByRole('dialog'), 'dialog')
  })
})
