import type { Locator, Page } from '@playwright/test'

/**
 * The drawer aside hosts the Scope editor, Workflows, and Lens palette.
 * Workspace switching / creation / deletion lives in the TopBar — see
 * `TopBarPom`.
 */
export class SidebarPom {
  readonly root: Locator
  readonly scopeSection: Locator
  readonly courseSelect: Locator
  readonly timeframeSelect: Locator
  readonly lensItems: Locator

  constructor(private page: Page) {
    this.root = page.locator('aside')
    this.scopeSection = this.root.getByTestId('scope-section')
    this.courseSelect = this.scopeSection.getByRole('combobox', { name: 'Course filter' })
    this.timeframeSelect = this.scopeSection.getByRole('combobox', { name: 'Timeframe filter' })
    this.lensItems = this.root.locator('[draggable="true"]')
  }

  async selectCourse(label: string) {
    await this.courseSelect.selectOption({ label })
  }

  async selectTimeframe(label: string) {
    await this.timeframeSelect.selectOption({ label })
  }

  async dragLensToGrid(lensName: string, target: Locator) {
    const lens = this.lensItems.filter({ hasText: lensName })
    await lens.dragTo(target)
  }
}
