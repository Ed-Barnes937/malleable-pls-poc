import { test, expect } from '@playwright/experimental-ct-react'
import { SectionLabel } from './SectionLabel'

test('renders text content', async ({ mount, page }) => {
  await mount(<SectionLabel>Settings</SectionLabel>)
  await expect(page.getByText('Settings')).toBeVisible()
})

test('applies uppercase styling', async ({ mount, page }) => {
  await mount(<SectionLabel>Options</SectionLabel>)
  const label = page.getByText('Options')
  await expect(label).toHaveClass(/uppercase/)
})

test('applies tracking-widest for letter spacing', async ({ mount, page }) => {
  await mount(<SectionLabel>Tracking</SectionLabel>)
  const label = page.getByText('Tracking')
  await expect(label).toHaveClass(/tracking-widest/)
})

test('accepts custom className', async ({ mount, page }) => {
  await mount(<SectionLabel className="mt-4">Custom</SectionLabel>)
  const label = page.getByText('Custom')
  await expect(label).toHaveClass(/mt-4/)
})

test('renders children as ReactNode', async ({ mount, page }) => {
  await mount(
    <SectionLabel>
      <strong>Bold Label</strong>
    </SectionLabel>,
  )
  await expect(page.getByText('Bold Label')).toBeVisible()
})
