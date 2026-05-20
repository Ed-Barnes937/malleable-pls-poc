import { test, expect } from '@playwright/experimental-ct-react'
import { Dialog } from './Dialog'

test('renders nothing when open is false', async ({ mount }) => {
  const component = await mount(
    <Dialog open={false} onClose={() => {}}>
      <p>Hidden content</p>
    </Dialog>,
  )
  await expect(component).toBeEmpty()
})

test('renders children when open', async ({ mount }) => {
  const component = await mount(
    <Dialog open={true} onClose={() => {}}>
      <p>Visible content</p>
    </Dialog>,
  )
  await expect(component.getByText('Visible content')).toBeVisible()
})

test('renders title when provided', async ({ mount }) => {
  const component = await mount(
    <Dialog open={true} onClose={() => {}} title="My Dialog">
      <p>Body</p>
    </Dialog>,
  )
  await expect(component.getByRole('heading', { name: 'My Dialog' })).toBeVisible()
})

test('has correct aria attributes', async ({ mount }) => {
  const component = await mount(
    <Dialog open={true} onClose={() => {}} title="Accessible Dialog">
      <p>Body</p>
    </Dialog>,
  )
  const dialog = component.getByRole('dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-label', 'Accessible Dialog')
})

test('calls onClose when Escape is pressed', async ({ mount, page }) => {
  let closed = false
  const component = await mount(
    <Dialog open={true} onClose={() => { closed = true }} title="Escape me">
      <p>Press escape</p>
    </Dialog>,
  )
  // Click into the dialog first to ensure the page has focus
  await component.getByText('Press escape').click()
  await page.keyboard.press('Escape')
  expect(closed).toBe(true)
})

test('calls onClose when backdrop is clicked', async ({ mount, page }) => {
  let closed = false
  const component = await mount(
    <Dialog open={true} onClose={() => { closed = true }}>
      <p>Click outside</p>
    </Dialog>,
  )
  // The backdrop is behind the dialog (z-index), so use dispatchEvent to trigger click
  await component.getByTestId('dialog-backdrop').dispatchEvent('click')
  expect(closed).toBe(true)
})

test('calls onClose when close button is clicked', async ({ mount }) => {
  let closed = false
  const component = await mount(
    <Dialog open={true} onClose={() => { closed = true }} title="With Close">
      <p>Body</p>
    </Dialog>,
  )
  await component.getByRole('button', { name: 'Close' }).click()
  expect(closed).toBe(true)
})

test('shows close button even without title', async ({ mount }) => {
  const component = await mount(
    <Dialog open={true} onClose={() => {}}>
      <p>No title</p>
    </Dialog>,
  )
  await expect(component.getByRole('button', { name: 'Close' })).toBeVisible()
})
