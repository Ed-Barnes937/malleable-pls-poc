import { test, expect } from '@playwright/experimental-ct-react'
import { Badge } from './Badge'
import { BadgeWithIcon } from './test-helpers'

test('renders text content', async ({ mount }) => {
  const component = await mount(<Badge>Active</Badge>)
  await expect(component.getByText('Active')).toBeVisible()
})

test('applies accent variant classes', async ({ mount, page }) => {
  await mount(<Badge variant="accent">Accent</Badge>)
  // The Badge root is a <span>, query it directly via the text content
  const badge = page.getByText('Accent')
  await expect(badge).toHaveClass(/bg-accent/)
})

test('applies success variant classes', async ({ mount, page }) => {
  await mount(<Badge variant="success">Success</Badge>)
  const badge = page.getByText('Success')
  await expect(badge).toHaveClass(/bg-emerald/)
})

test('applies warning variant classes', async ({ mount, page }) => {
  await mount(<Badge variant="warning">Warning</Badge>)
  const badge = page.getByText('Warning')
  await expect(badge).toHaveClass(/text-tag-confused/)
})

test('defaults to neutral variant', async ({ mount, page }) => {
  await mount(<Badge>Neutral</Badge>)
  const badge = page.getByText('Neutral')
  await expect(badge).toHaveClass(/bg-neutral/)
})

test('renders icon when provided', async ({ mount }) => {
  const component = await mount(<BadgeWithIcon>With Icon</BadgeWithIcon>)
  await expect(component.getByText('★')).toBeVisible()
  await expect(component.getByText('With Icon')).toBeVisible()
})

test('does not render icon when not provided', async ({ mount }) => {
  const component = await mount(<Badge>No Icon</Badge>)
  await expect(component.getByText('★')).toHaveCount(0)
})

test('sm size applies smaller text', async ({ mount, page }) => {
  await mount(<Badge size="sm">Small</Badge>)
  const badge = page.getByText('Small')
  await expect(badge).toHaveClass(/text-\[10px\]/)
})

test('md size applies larger text', async ({ mount, page }) => {
  await mount(<Badge size="md">Medium</Badge>)
  const badge = page.getByText('Medium')
  await expect(badge).toHaveClass(/text-xs/)
})

test('applies ring when ring prop is true', async ({ mount, page }) => {
  await mount(<Badge ring>Ringed</Badge>)
  const badge = page.getByText('Ringed')
  await expect(badge).toHaveClass(/ring-1/)
})
