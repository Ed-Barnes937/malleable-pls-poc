import { test, expect } from '@playwright/test'
import { SidebarPom } from './pom'

test.describe('Scope filtering', () => {
  test('course filter dropdown changes value', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)

    await expect(sidebar.courseSelect).toHaveValue('biology', { timeout: 10000 })

    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })

    await sidebar.selectCourse('All courses')
    await expect(sidebar.courseSelect).toHaveValue('', { timeout: 10000 })

    // Restore original value so later tests see clean state
    await sidebar.selectCourse('Biology')
    await expect(sidebar.courseSelect).toHaveValue('biology')
  })

  test('timeframe filter dropdown changes value', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)

    await expect(sidebar.timeframeSelect).toHaveValue('week', { timeout: 10000 })

    await sidebar.selectTimeframe('All time')
    await expect(sidebar.timeframeSelect).toHaveValue('all', { timeout: 10000 })

    await sidebar.selectTimeframe('No filter')
    await expect(sidebar.timeframeSelect).toHaveValue('', { timeout: 10000 })

    // Restore original value so later tests see clean state
    await sidebar.selectTimeframe('This week')
    await expect(sidebar.timeframeSelect).toHaveValue('week')
  })
})
