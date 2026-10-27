import type { Locator, Page } from '@playwright/test'

/**
 * The drawer ("board menu") hosts the widget palette, the "Showing" scope
 * pickers and the board's automations.
 * Workspace switching / creation / deletion lives in the TopBar — see
 * `TopBarPom`.
 */
export class SidebarPom {
  readonly root: Locator
  readonly scopeSection: Locator
  readonly courseSelect: Locator
  readonly recordingSelect: Locator
  readonly lensItems: Locator

  constructor(private page: Page) {
    this.root = page.locator('aside')
    this.scopeSection = this.root.getByTestId('scope-section')
    this.courseSelect = this.scopeSection.getByRole('combobox', { name: 'Course' })
    this.recordingSelect = this.scopeSection.getByRole('combobox', { name: 'Lecture' })
    this.lensItems = this.root.locator('[draggable="true"]')
  }

  async selectCourse(label: string) {
    await this.courseSelect.selectOption({ label })
  }

  async selectRecording(label: string) {
    await this.recordingSelect.selectOption({ label })
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
