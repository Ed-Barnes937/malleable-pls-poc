import { test, expect } from '@playwright/experimental-ct-react'
import { Switch } from './Switch'

test('renders with aria-checked false when unchecked', async ({ mount, page }) => {
  await mount(<Switch checked={false} onCheckedChange={() => {}} />)
  const sw = page.getByRole('switch')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
})

test('renders with aria-checked true when checked', async ({ mount, page }) => {
  await mount(<Switch checked={true} onCheckedChange={() => {}} />)
  const sw = page.getByRole('switch')
  await expect(sw).toHaveAttribute('aria-checked', 'true')
})

test('fires onCheckedChange with toggled value on click', async ({ mount, page }) => {
  let newValue: boolean | undefined
  await mount(
    <Switch checked={false} onCheckedChange={(v) => { newValue = v }} />,
  )
  await page.getByRole('switch').click()
  expect(newValue).toBe(true)
})

test('fires onCheckedChange with false when checked switch is clicked', async ({ mount, page }) => {
  let newValue: boolean | undefined
  await mount(
    <Switch checked={true} onCheckedChange={(v) => { newValue = v }} />,
  )
  await page.getByRole('switch').click()
  expect(newValue).toBe(false)
})

test('does not fire onCheckedChange when disabled', async ({ mount, page }) => {
  let called = false
  await mount(
    <Switch checked={false} onCheckedChange={() => { called = true }} disabled />,
  )
  const sw = page.getByRole('switch')
  await expect(sw).toBeDisabled()
  await sw.click({ force: true })
  expect(called).toBe(false)
})

test('applies aria-label when label prop is provided', async ({ mount, page }) => {
  await mount(
    <Switch checked={false} onCheckedChange={() => {}} label="Enable notifications" />,
  )
  await expect(page.getByRole('switch')).toHaveAttribute('aria-label', 'Enable notifications')
})

test('toggles via keyboard Space key', async ({ mount, page }) => {
  let newValue: boolean | undefined
  await mount(
    <Switch checked={false} onCheckedChange={(v) => { newValue = v }} />,
  )
  await page.getByRole('switch').focus()
  await page.getByRole('switch').press('Space')
  expect(newValue).toBe(true)
})
