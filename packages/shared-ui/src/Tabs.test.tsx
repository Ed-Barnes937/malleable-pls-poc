import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { Tabs, TabsList, TabsTab, TabsPanel } from './Tabs'
import { checkPattern } from './testing'

function Example({ onValueChange }: { onValueChange?: (v: string | null) => void }) {
  return (
    <Tabs defaultValue="week" onValueChange={onValueChange}>
      <TabsList label="Calendar view">
        <TabsTab value="day">Day</TabsTab>
        <TabsTab value="week">Week</TabsTab>
        <TabsTab value="month">Month</TabsTab>
      </TabsList>
      <TabsPanel value="day">Day panel</TabsPanel>
      <TabsPanel value="week">Week panel</TabsPanel>
      <TabsPanel value="month">Month panel</TabsPanel>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('follows the tabs ARIA pattern', async () => {
    render(<Example />)
    await checkPattern(screen.getByRole('tablist', { name: 'Calendar view' }), 'tabs')
  })

  it('arrow keys, Home and End move between tabs and show the matching panel', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    render(<Example onValueChange={(v) => seen.push(String(v))} />)
    expect(screen.getByText('Week panel')).toBeVisible()
    screen.getByRole('tab', { name: 'Week' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveFocus()
    expect(screen.getByText('Month panel')).toBeVisible()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Day' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Day' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveFocus()
    expect(seen.at(-1)).toBe('month')
  })

  it('a press selects a tab', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('tab', { name: 'Day' }))
    expect(screen.getByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Day panel')).toBeVisible()
  })
})
