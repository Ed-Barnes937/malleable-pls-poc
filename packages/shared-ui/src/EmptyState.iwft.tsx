import { test, expect } from '@playwright/experimental-ct-react'
import { EmptyState } from './EmptyState'
import { EmptyStateWithIcon, EmptyStateWithAction } from './test-helpers'

test('renders message text', async ({ mount }) => {
  const component = await mount(<EmptyState message="No items found" />)
  await expect(component.getByText('No items found')).toBeVisible()
})

test('renders icon when provided', async ({ mount }) => {
  const component = await mount(
    <EmptyStateWithIcon message="Empty" />,
  )
  await expect(component.getByText('★')).toBeVisible()
})

test('does not render icon when not provided', async ({ mount }) => {
  const component = await mount(<EmptyState message="No icon" />)
  await expect(component.getByText('★')).toHaveCount(0)
})

test('renders action slot when provided', async ({ mount }) => {
  const component = await mount(
    <EmptyStateWithAction message="No data" actionLabel="Retry" />,
  )
  await expect(component.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('action button is clickable', async ({ mount }) => {
  const component = await mount(
    <EmptyStateWithAction message="No data" actionLabel="Retry" />,
  )
  const btn = component.getByRole('button', { name: 'Retry' })
  await expect(btn).toBeVisible()
  await btn.click()
  // Button exists and is interactive (no error thrown)
})

test('renders only the message when no icon or action', async ({ mount }) => {
  const component = await mount(<EmptyState message="Bare" />)
  await expect(component.getByText('Bare')).toBeVisible()
  await expect(component.getByText('★')).toHaveCount(0)
})
