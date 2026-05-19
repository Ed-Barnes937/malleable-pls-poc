import { test, expect } from '@playwright/experimental-ct-react'
import { IconButtonWithIcon } from './test-helpers'

test('renders with aria-label', async ({ mount, page }) => {
  await mount(<IconButtonWithIcon label="Add item" />)
  await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible()
})

test('fires click handler', async ({ mount, page }) => {
  let clicked = false
  await mount(
    <IconButtonWithIcon label="Click me" onClick={() => { clicked = true }} />,
  )
  await page.getByRole('button').click()
  expect(clicked).toBe(true)
})

test('does not fire click when disabled', async ({ mount, page }) => {
  let clicked = false
  await mount(
    <IconButtonWithIcon label="Disabled" disabled onClick={() => { clicked = true }} />,
  )
  const btn = page.getByRole('button')
  await expect(btn).toBeDisabled()
  await btn.click({ force: true })
  expect(clicked).toBe(false)
})

test('renders the icon element', async ({ mount, page }) => {
  await mount(<IconButtonWithIcon label="Star" />)
  await expect(page.getByText('★')).toBeVisible()
})

test('sm size applies smaller dimensions', async ({ mount, page }) => {
  await mount(<IconButtonWithIcon label="Small" size="sm" />)
  const btn = page.getByRole('button')
  await expect(btn).toHaveClass(/h-7/)
  await expect(btn).toHaveClass(/w-7/)
})

test('md size applies larger dimensions', async ({ mount, page }) => {
  await mount(<IconButtonWithIcon label="Medium" size="md" />)
  const btn = page.getByRole('button')
  await expect(btn).toHaveClass(/h-9/)
  await expect(btn).toHaveClass(/w-9/)
})

test('defaults to type button', async ({ mount, page }) => {
  await mount(<IconButtonWithIcon label="Default type" />)
  await expect(page.getByRole('button')).toHaveAttribute('type', 'button')
})
