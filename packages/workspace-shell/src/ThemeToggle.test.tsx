import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, it, vi } from 'vitest'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'
import { ThemeToggle } from './ThemeToggle'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView ??= () => {}
})

describe('the theme menu meets its WAI-ARIA pattern', () => {
  it('Menu with a radio group', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await act(settle)
    await checkPattern(screen.getByRole('menu'), 'menu')
  })
})
