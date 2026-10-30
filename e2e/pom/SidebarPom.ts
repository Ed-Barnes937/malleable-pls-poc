import type { Locator, Page } from '@playwright/test'

/**
 * The drawer ("board menu") hosts the widget palette and the board's
 * automations. Workspace switching / creation / deletion and the scope
 * pickers live in the TopBar - see `TopBarPom`.
 */
export class SidebarPom {
  readonly root: Locator
  readonly lensItems: Locator

  constructor(private page: Page) {
    this.root = page.locator('aside')
    this.lensItems = this.root.locator('[draggable="true"]')
  }

  /** Adds a widget by clicking its palette tile; the drawer stays open. */
  async addWidget(label: string) {
    await this.root.getByRole('button', { name: `Add ${label}`, exact: true }).click()
  }

  async dragLensToGrid(lensName: string, target: Locator) {
    const lens = this.lensItems.filter({ hasText: lensName })
    await lens.dragTo(target)
  }
}
