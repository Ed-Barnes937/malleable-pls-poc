import { test, expect } from '@playwright/experimental-ct-react'
import { TagPill } from './TagPill'

test('renders confused tag with label', async ({ mount }) => {
  const component = await mount(<TagPill label="confused" />)
  await expect(component).toContainText('confused')
})

test('renders key-point tag with label', async ({ mount }) => {
  const component = await mount(<TagPill label="key-point" />)
  await expect(component).toContainText('key-point')
})

test('renders question tag with label', async ({ mount }) => {
  const component = await mount(<TagPill label="question" />)
  await expect(component).toContainText('question')
})

test('returns null for unknown label', async ({ mount }) => {
  const component = await mount(<TagPill label="unknown-tag" />)
  await expect(component).toBeEmpty()
})
