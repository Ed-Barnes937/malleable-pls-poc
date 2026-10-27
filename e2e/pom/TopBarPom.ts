import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Workspace switching, creation, and deletion live in the TopBar's
 * WorkspaceSwitcher — not in the drawer aside. This POM wraps those
 * affordances.
 */
export class TopBarPom {
  readonly root: Locator
  readonly workspaceTabs: Locator
  readonly newWorkspaceButton: Locator
  readonly drawerTrigger: Locator
  readonly scopeChip: Locator
  /** "Tuesday · Chemistry 14:00 · ...": today at a glance, wide screens only. */
  readonly todayLine: Locator

  constructor(private page: Page) {
    this.root = page.getByTestId('top-bar')
    this.workspaceTabs = this.root.getByTestId('workspace-tab')
    this.newWorkspaceButton = this.root.getByRole('button', { name: 'New board' })
    this.drawerTrigger = this.root.getByTestId('drawer-trigger')
    this.scopeChip = this.root.getByTestId('scope-chip')
    this.todayLine = this.root.getByTestId('today-line')
  }

  async switchToWorkspace(name: string) {
    await this.root.getByRole('button', { name, exact: true }).click()
  }

  /** Opens the drawer aside and waits for it to be visible. */
  async openDrawer() {
    await this.drawerTrigger.click()
    await expect(this.page.getByTestId('drawer-sidebar')).toBeVisible()
  }

  async expectActiveWorkspace(name: string) {
    const btn = this.root.getByRole('button', { name, exact: true })
    await expect(btn).toHaveAttribute('aria-current', 'page')
  }

  async openCreateWorkspaceDialog() {
    await this.newWorkspaceButton.click()
  }

  /** Opens the board, then its delete button (only the open board's tab has one). */
  async deleteWorkspace(name: string) {
    await this.switchToWorkspace(name)
    await this.expectActiveWorkspace(name)
    await this.root.getByRole('button', { name: `Delete ${name}`, exact: true }).click()
  }
}
