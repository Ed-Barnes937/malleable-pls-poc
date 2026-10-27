import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The Calendar widget (`packages/lens-calendar`): a Mon-Sun hours grid.
 * `point` turns a day column and a time into viewport coordinates, so tests
 * can click and drag on empty time like a student would.
 */
export class CalendarPom {
  readonly root: Locator
  readonly grid: Locator
  readonly days: Locator
  readonly popover: Locator

  constructor(private page: Page) {
    this.root = page.getByTestId('calendar')
    this.grid = this.root.getByTestId('calendar-grid')
    this.days = this.root.getByTestId('calendar-day')
    this.popover = this.root.getByTestId('calendar-popover')
  }

  block(title: string): Locator {
    return this.root.getByTestId('calendar-block').filter({ hasText: title })
  }

  /** Viewport point for `dayIndex` (0 = Monday in week view) at `hours` (e.g. 14.5 = 14:30). */
  async point(dayIndex: number, hours: number) {
    // Panels animate in and the grid re-fits its hour height as rows load:
    // measure only once the grid has stopped moving.
    let last = ''
    await expect.poll(async () => {
      const box = JSON.stringify(await this.grid.boundingBox())
      const settled = box === last
      last = box
      return settled
    }, { intervals: [100] }).toBe(true)
    const grid = await this.grid.boundingBox()
    const day = await this.days.nth(dayIndex).boundingBox()
    if (!grid || !day) throw new Error('calendar grid not visible')
    return { x: day.x + day.width / 2, y: grid.y + (hours / 24) * grid.height }
  }

  async clickAt(dayIndex: number, hours: number) {
    const p = await this.point(dayIndex, hours)
    await this.page.mouse.click(p.x, p.y)
  }

  /** Presses at one grid point and releases at another (moves a study block, or drag-creates). */
  async drag(from: { dayIndex: number; hours: number }, to: { dayIndex: number; hours: number }) {
    const a = await this.point(from.dayIndex, from.hours)
    const b = await this.point(to.dayIndex, to.hours)
    await this.page.mouse.move(a.x, a.y)
    await this.page.mouse.down()
    await this.page.mouse.move(b.x, b.y, { steps: 8 })
    await this.page.mouse.up()
  }

  async nextWeek() {
    await this.root.getByRole('button', { name: 'Next week' }).click()
  }
}
