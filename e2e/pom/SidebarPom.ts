import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class SidebarPom {
  readonly root: Locator
  readonly workspaceButtons: Locator
  readonly newWorkspaceButton: Locator
  readonly scopeSection: Locator
  readonly courseSelect: Locator
  readonly recordingSelect: Locator
  readonly timeframeSelect: Locator
  readonly lensItems: Locator

  constructor(private page: Page) {
    this.root = page.locator('aside')
    this.workspaceButtons = this.root.locator('section').first().locator('.group')
    this.newWorkspaceButton = this.root.getByText('New workspace')
    this.scopeSection = this.root.locator('section').nth(1)
    this.courseSelect = this.scopeSection.getByRole('combobox').first()
    this.recordingSelect = this.scopeSection.getByRole('combobox').nth(1)
    this.timeframeSelect = this.scopeSection.getByRole('combobox').nth(2)
    this.lensItems = this.root.locator('[draggable="true"]')
  }

  async switchToWorkspace(name: string) {
    await this.root.getByRole('button', { name, exact: true }).click()
  }

  async expectActiveWorkspace(name: string) {
    const btn = this.root.getByRole('button', { name, exact: true })
    await expect(btn).toHaveClass(/bg-accent/)
  }

  async openCreateWorkspaceDialog() {
    await this.newWorkspaceButton.click()
  }

  async selectCourse(label: string) {
    await this.courseSelect.selectOption({ label })
  }

  async selectRecording(label: string) {
    await this.recordingSelect.selectOption({ label })
  }

  async selectTimeframe(label: string) {
    await this.timeframeSelect.selectOption({ label })
  }

  async dragLensToGrid(lensName: string, target: Locator) {
    const lens = this.lensItems.filter({ hasText: lensName })
    await lens.dragTo(target)
  }

  async deleteWorkspace(name: string) {
    const btn = this.root.getByLabel(`Delete ${name}`)
    await btn.click({ force: true })
  }
}
