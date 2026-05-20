import { test, expect } from '@playwright/experimental-ct-react'
import { Panel } from './Panel'

test.describe('Panel', () => {
  test('renders label and children', async ({ mount }) => {
    const component = await mount(
      <Panel label="Test Panel">
        <p>Panel content</p>
      </Panel>
    )
    await expect(component.getByText('Test Panel')).toBeVisible()
    await expect(component.getByText('Panel content')).toBeVisible()
  })

  test('shows remove button and fires callback', async ({ mount, page }) => {
    let removed = false
    const component = await mount(
      <Panel label="Removable" onRemove={() => { removed = true }}>Content</Panel>
    )
    const removeBtn = component.getByTitle('Remove panel')
    await expect(removeBtn).toBeVisible()
    await removeBtn.click()
    expect(removed).toBe(true)
  })

  test('hides remove button when no onRemove', async ({ mount }) => {
    const component = await mount(<Panel label="Static">Content</Panel>)
    await expect(component.getByTitle('Remove panel')).toHaveCount(0)
  })

  test('renders header actions slot', async ({ mount }) => {
    const component = await mount(
      <Panel label="With Actions" headerActions={<button>Act</button>}>
        Content
      </Panel>
    )
    await expect(component.getByRole('button', { name: 'Act' })).toBeVisible()
  })

  test('has drag handle', async ({ mount }) => {
    const component = await mount(<Panel label="Draggable">Content</Panel>)
    await expect(component.locator('.panel-drag-handle')).toBeVisible()
  })
})
