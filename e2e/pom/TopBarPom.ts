import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { motionSettled } from '../settle'

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
  /** The "..." beside the lecture pill (only with a lecture selected): Rename, Delete. */
  readonly lectureMenuButton: Locator
  /** "Up next: Chemistry 14:00": the next item in the calendar, at every width. Opens `upNextPopover`. */
  readonly upNext: Locator
  readonly upNextPopover: Locator

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
    this.lectureMenuButton = this.scopeGroup.getByRole('button', { name: 'Lecture options' })
    this.upNext = this.root.getByTestId('up-next')
    // Rendered in a portal, so not inside the top bar.
    this.upNextPopover = page.getByTestId('up-next-popover')
  }

  /**
   * Chooses a course by its label ("Biology", "All courses"), and waits for
   * the server to have it (the pills show it before then), so a reload after
   * this reads it back.
   */
  async selectCourse(label: string) {
    await this.saving(this.courseSelect, () => this.courseSelect.selectOption({ label }))
  }

  /**
   * Chooses a lecture by its title (its option also has its date), or
   * "No lecture". Waits for it to be in the list, and for the server to have
   * the choice.
   */
  async selectLecture(title: string) {
    if (title === 'No lecture') {
      await this.saving(this.lectureSelect, () => this.lectureSelect.selectOption(''))
      return
    }
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const option = this.lectureSelect.locator('option').filter({ hasText: new RegExp(`^${escaped}( · |$)`) })
    await expect(option).toHaveCount(1)
    const value = (await option.getAttribute('value'))!
    await this.saving(this.lectureSelect, () => this.lectureSelect.selectOption(value))
  }

  /** Chooses an item ("Rename this lecture...", "Delete this lecture...") from the lecture's menu. */
  async chooseLectureAction(name: string) {
    await this.lectureMenuButton.click()
    await this.page.getByRole('menu', { name: 'Lecture options' }).getByRole('menuitem', { name }).click()
  }

  /** Renames the board's lecture inline (from the menu beside the lecture pill), and waits for the server to have it. */
  async renameLecture(title: string) {
    await this.chooseLectureAction('Rename this lecture...')
    const field = this.scopeGroup.getByRole('textbox', { name: 'Lecture name' })
    await expect(field).toBeFocused()
    await field.fill(title)
    const saved = this.page.waitForResponse((r) => r.url().includes('lectures.update') && r.request().method() === 'POST')
    await field.press('Enter')
    expect((await saved).ok()).toBe(true)
  }

  /**
   * Runs `choose` on `select` and, when it changed the choice, waits for the
   * `setBoardScope` it makes to be answered (an unchanged choice writes nothing).
   */
  private async saving(select: Locator, choose: () => Promise<unknown>) {
    const before = await select.inputValue()
    const saved = this.page.waitForResponse((r) => r.url().includes('workspaces.setBoardScope') && r.request().method() === 'POST')
    saved.catch(() => {})
    await choose()
    if ((await select.inputValue()) === before) return
    expect((await saved).ok()).toBe(true)
  }

  /**
   * What the pills read: the course, and the lecture ("No lecture" for
   * null; `undefined` when the board shows no lecture pill at all). Once
   * they read it, they have also landed (pills arrive with the board).
   */
  async expectScope(course: string, lecture?: string | null, options?: { timeout?: number }) {
    await expect(this.coursePill).toHaveText(course, options)
    if (lecture === undefined) await expect(this.lectureSelect).toHaveCount(0, options)
    else await expect(this.lecturePill).toHaveText(lecture ?? 'No lecture', options)
    await motionSettled(this.page.getByRole('group', { name: 'What this board shows' }))
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

  /**
   * Every control in the bar is whole, in view and clear of the others
   * (the board tabs are left out: they scroll on their own by design), the
   * "..." beside the lecture takes a tap at its centre, Up next shows its
   * words, and nothing scrolls sideways.
   */
  async expectControlsFit() {
    await motionSettled(this.root)
    const width = this.page.viewportSize()!.width
    const controls = await this.root.evaluate((bar) => {
      const inScroller = (el: HTMLElement) => {
        for (let up = el.parentElement; up && up !== bar; up = up.parentElement) {
          const overflowX = getComputedStyle(up).overflowX
          if (overflowX === 'auto' || overflowX === 'scroll') return true
        }
        return false
      }
      return [...bar.querySelectorAll<HTMLElement>('button, select, a, input')]
        .filter((el) => el.getClientRects().length > 0 && !inScroller(el))
        .map((el) => {
          const box = el.getBoundingClientRect()
          return { name: el.getAttribute('aria-label') ?? el.getAttribute('data-testid') ?? el.tagName, left: box.left, right: box.right, top: box.top, bottom: box.bottom }
        })
    })
    expect(controls.map((c) => c.name)).toEqual(expect.arrayContaining(['Course', 'Lecture', 'Lecture options', 'up-next']))
    for (const [i, a] of controls.entries()) {
      expect(a.left, a.name).toBeGreaterThanOrEqual(0)
      expect(a.right, a.name).toBeLessThanOrEqual(width)
      for (const b of controls.slice(i + 1)) {
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
        expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false)
      }
    }
    const menu = (await this.lectureMenuButton.boundingBox())!
    const hit = await this.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
      [menu.x + menu.width / 2, menu.y + menu.height / 2])
    expect(hit).toBe('Lecture options')
    // On a phone Up next keeps its words: a few characters of its label show.
    if ((await this.root.getAttribute('data-layout')) === 'phone') {
      expect(await this.upNext.getByTestId('up-next-label').evaluate((el) => el.parentElement!.getBoundingClientRect().width)).toBeGreaterThan(24)
    }
    expect(await this.scopeGroup.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    expect(await this.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
}
