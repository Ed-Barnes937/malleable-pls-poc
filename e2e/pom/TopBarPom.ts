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
  /** "Showing [Biology] > [Mitochondrial DNA]": the board's scope pickers. */
  readonly scopeGroup: Locator
  readonly courseSelect: Locator
  readonly lectureSelect: Locator
  /** What the course and lecture pills read. */
  readonly coursePill: Locator
  readonly lecturePill: Locator
  /** "Tuesday · Chemistry 14:00 · ...": today at a glance, on wide screens and (short) on a phone. */
  readonly todayLine: Locator

  constructor(private page: Page) {
    this.root = page.getByTestId('top-bar')
    this.workspaceTabs = this.root.getByTestId('workspace-tab')
    this.newWorkspaceButton = this.root.getByRole('button', { name: 'New board' })
    this.drawerTrigger = this.root.getByTestId('drawer-trigger')
    this.scopeGroup = this.root.getByRole('group', { name: 'What this board shows' })
    this.courseSelect = this.scopeGroup.getByRole('combobox', { name: 'Course' })
    this.lectureSelect = this.scopeGroup.getByRole('combobox', { name: 'Lecture' })
    this.coursePill = this.scopeGroup.getByTestId('scope-course').getByTestId('scope-pill-text')
    this.lecturePill = this.scopeGroup.getByTestId('scope-lecture').getByTestId('scope-pill-text')
    this.todayLine = this.root.getByTestId('today-line')
  }

  /** Chooses a course by its label ("Biology", "All courses"). */
  async selectCourse(label: string) {
    await this.courseSelect.selectOption({ label })
  }

  /**
   * Chooses a lecture by its title (its option also has its date), or
   * "No lecture". Waits for it to be in the list.
   */
  async selectLecture(title: string) {
    if (title === 'No lecture') {
      await this.lectureSelect.selectOption('')
      return
    }
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const option = this.lectureSelect.locator('option').filter({ hasText: new RegExp(`^${escaped}( · |$)`) })
    await expect(option).toHaveCount(1)
    await this.lectureSelect.selectOption((await option.getAttribute('value'))!)
  }

  /**
   * What the pills read: the course, and the lecture ("No lecture" for
   * null; `undefined` when the board shows no lecture pill at all).
   */
  async expectScope(course: string, lecture?: string | null, options?: { timeout?: number }) {
    await expect(this.coursePill).toHaveText(course, options)
    if (lecture === undefined) await expect(this.lectureSelect).toHaveCount(0, options)
    else await expect(this.lecturePill).toHaveText(lecture ?? 'No lecture', options)
  }

  /** A board's tab button, by the board's name. */
  workspaceTab(name: string) {
    return this.root.getByRole('button', { name, exact: true })
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
