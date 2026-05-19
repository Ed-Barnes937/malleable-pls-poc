import { test, expect } from '@playwright/experimental-ct-react'
import { StatusDot } from './StatusDot'

test('renders running status with sky color', async ({ mount, page }) => {
  await mount(<StatusDot status="running" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/bg-sky-400/)
})

test('renders complete status with emerald color', async ({ mount, page }) => {
  await mount(<StatusDot status="complete" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/bg-emerald-400/)
})

test('renders failed status with rose color', async ({ mount, page }) => {
  await mount(<StatusDot status="failed" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/bg-rose-400/)
})

test('renders idle status with neutral color', async ({ mount, page }) => {
  await mount(<StatusDot status="idle" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/bg-neutral-500/)
})

test('pulses by default when running', async ({ mount, page }) => {
  await mount(<StatusDot status="running" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/animate-pulse/)
})

test('does not pulse by default when idle', async ({ mount, page }) => {
  await mount(<StatusDot status="idle" />)
  const dot = page.locator('span.inline-block')
  const classes = await dot.getAttribute('class')
  expect(classes).not.toContain('animate-pulse')
})

test('pulse can be forced on for non-running status', async ({ mount, page }) => {
  await mount(<StatusDot status="complete" pulse={true} />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/animate-pulse/)
})

test('pulse can be forced off for running status', async ({ mount, page }) => {
  await mount(<StatusDot status="running" pulse={false} />)
  const dot = page.locator('span.inline-block')
  const classes = await dot.getAttribute('class')
  expect(classes).not.toContain('animate-pulse')
})

test('renders as a small circle', async ({ mount, page }) => {
  await mount(<StatusDot status="idle" />)
  const dot = page.locator('span.inline-block')
  await expect(dot).toHaveClass(/rounded-full/)
  await expect(dot).toHaveClass(/h-2/)
  await expect(dot).toHaveClass(/w-2/)
})
