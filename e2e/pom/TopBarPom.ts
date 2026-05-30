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

  constructor(private page: Page) {
    this.root = page.getByTestId('top-bar')
    this.workspaceTabs = this.root.getByTestId('workspace-tab')
    this.newWorkspaceButton = this.root.getByRole('button', { name: 'New workspace' })
    this.drawerTrigger = this.root.getByTestId('drawer-trigger')
    this.scopeChip = this.root.getByTestId('scope-chip')
  }

  async switchToWorkspace(name: string) {
    await this.root.getByRole('button', { name, exact: true }).click()
  }

  async expectActiveWorkspace(name: string) {
    const btn = this.root.getByRole('button', { name, exact: true })
    await expect(btn).toHaveAttribute('aria-current', 'page')
  }

  async openCreateWorkspaceDialog() {
    await this.newWorkspaceButton.click()
  }

  async deleteWorkspace(name: string) {
    // The delete button is hidden until hover on its tab; force-click to
    // bypass the opacity-0 state.
    const btn = this.root.getByLabel(`Delete ${name}`)
    await btn.click({ force: true })
  }
}
