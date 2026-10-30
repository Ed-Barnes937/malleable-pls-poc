import { test, expect, type Locator, type Page } from '@playwright/test'
import { CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * The board header's scope pickers: a course pill for every board with a
 * widget that uses the course, and a lecture pill when a widget targets or
 * highlights the lecture, per each manifest's `scope` declaration.
 *
 * In Lecture: Record and Transcript use both, so it shows Course and Lecture.
 * Exam Prep: All Courses, Weakest Topics and Test Me use the course but
 * ignore the lecture, so it shows Course only.
 *
 * Every choice is one `setBoardScope`, and the server keeps the board rule:
 * a selected lecture brings its course, and a course change (including
 * "All courses") clears a lecture outside it.
 *
 * Also run in WebKit (`playwright.config.ts`): the pills are transparent
 * native selects over a styled label, so this checks Safari hits them too.
 */

const DNA = 'Biology Lecture: Mitochondrial DNA'
const ORGANIC = 'Chemistry Lecture: Organic Reactions'

test.beforeEach(async () => { await reseed() })
test.afterAll(async () => { await reseed() })

async function openBoard(page: Page, name: string) {
  await page.goto('/')
  const topBar = new TopBarPom(page)
  await topBar.switchToWorkspace(name)
  await topBar.expectActiveWorkspace(name)
  return topBar
}

test.describe('Header scope pickers', () => {
  test('In Lecture shows Course and Lecture; Exam Prep shows Course only', async ({ page }) => {
    const topBar = await openBoard(page, 'In Lecture')
    await expect(topBar.scopeGroup).toContainText('Showing')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
    await expect(topBar.lectureSelect).toHaveValue('lec-rec-bio-4')

    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectScope('All courses', undefined, { timeout: 10000 })
  })

  test('an empty board shows no pickers until a widget that uses scope is added', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')
    await expect(topBar.scopeGroup).toHaveCount(0)

    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Calendar')
    await page.keyboard.press('Escape')
    // Calendar highlights the course and the lecture.
    await topBar.expectScope('All courses', null, { timeout: 10000 })
  })

  test('changing the course updates the widgets without opening the menu, and clears a lecture outside it', async ({ page }) => {
    const topBar = await openBoard(page, 'Evening Review')
    const grid = new PanelGridPom(page)
    const transcript = grid.panelByLabel('Transcript')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
    await expect(transcript.getByTestId('lecture-title')).toHaveText(DNA)

    // Biology again keeps the Biology lecture.
    await topBar.selectCourse('Biology')
    await topBar.expectScope('Biology', DNA)

    // The Biology lecture is not in Chemistry: it goes at once.
    await topBar.selectCourse('Chemistry')
    await topBar.expectScope('Chemistry', null)
    await expect(transcript.getByText('Pick a lecture to see its transcript')).toBeVisible({ timeout: 10000 })
    await expect(grid.panelByLabel('Your Progress').getByText('chemistry')).toBeVisible()
    await expect(page.getByTestId('drawer-sidebar')).toHaveAttribute('aria-hidden', 'true')

    await page.reload()
    await topBar.expectScope('Chemistry', null, { timeout: 10000 })
  })

  test('"All courses" clears a lecture filed under a course', async ({ page }) => {
    const topBar = await openBoard(page, 'Evening Review')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
    await topBar.selectCourse('All courses')
    await topBar.expectScope('All courses', null)
    await expect(topBar.courseSelect).toHaveValue('')
    await expect(topBar.lectureSelect).toHaveValue('')
  })

  test('on an "All courses" board, choosing a lecture brings its course and persists', async ({ page }) => {
    const topBar = await openBoard(page, 'Evening Review')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
    await topBar.selectCourse('All courses')
    await topBar.expectScope('All courses', null)

    // Every lecture is listed; choosing Chemistry's brings its course.
    await topBar.selectLecture(ORGANIC)
    await topBar.expectScope('Chemistry', ORGANIC)
    // Only Chemistry's lectures are offered now.
    await expect(topBar.lectureSelect.locator('option')).toHaveText(['No lecture', `${ORGANIC} · 9 Apr`])

    // And back to a Biology one from "All courses".
    await topBar.selectCourse('All courses')
    await topBar.selectLecture(DNA)
    await topBar.expectScope('Biology', DNA)

    await page.reload()
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
  })

  test('renaming the lecture inline renames it in the pill and the Transcript', async ({ page }) => {
    const topBar = await openBoard(page, 'In Lecture')
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })

    await topBar.renameLectureButton.click()
    const name = topBar.scopeGroup.getByRole('textbox', { name: 'Lecture name' })
    await expect(name).toBeFocused()
    await expect(name).toHaveValue(DNA)
    await name.press('Escape')
    await topBar.renameLecture('mtDNA and inheritance')

    await topBar.expectScope('Biology', 'mtDNA and inheritance')
    await expect(transcript.getByTestId('lecture-title')).toHaveText('mtDNA and inheritance')
    await page.reload()
    await topBar.expectScope('Biology', 'mtDNA and inheritance', { timeout: 10000 })
    await expect(transcript.getByTestId('lecture-title')).toHaveText('mtDNA and inheritance')
  })

  // From the phone layout's edge (640px) to a small laptop: the pills keep
  // their minimum and the tabs give way, so nothing sits on top of anything
  // (a tap on Activity must not open the Lecture picker).
  for (const width of [640, 768, 1024]) {
    test(`at ${width}px the header fits and nothing overlaps: tabs, both pills, the right-hand buttons`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const topBar = await openBoard(page, 'In Lecture')
      await topBar.expectScope('Biology', DNA, { timeout: 10000 })
      const box = async (locator: Locator) => (await locator.boundingBox())!
      const right = (b: { x: number; width: number }) => b.x + b.width

      const header = await box(topBar.root)
      const tabs = await box(topBar.root.getByTestId('board-tabs'))
      const course = await box(topBar.scopeGroup.getByTestId('scope-course'))
      const lecture = await box(topBar.scopeGroup.getByTestId('scope-lecture'))
      const rename = await box(topBar.renameLectureButton)
      const activity = await box(page.getByTestId('activity-button'))
      const lastButton = await box(page.getByTestId('organize-button'))

      // Left to right, each clear of the next.
      expect(right(tabs)).toBeLessThanOrEqual(course.x)
      expect(right(course)).toBeLessThanOrEqual(lecture.x)
      expect(right(lecture)).toBeLessThanOrEqual(rename.x)
      expect(right(lecture)).toBeLessThanOrEqual(activity.x)
      expect(right(rename)).toBeLessThanOrEqual(activity.x)
      expect(right(lastButton)).toBeLessThanOrEqual(right(header))
      // A tap on Activity reaches Activity.
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
        [activity.x + activity.width / 2, activity.y + activity.height / 2])
      expect(hit).toBe('activity-button')

      // The lecture title is cut short rather than pushing anything out, and still readable.
      expect(lecture.width).toBeGreaterThanOrEqual(96)
      // Nothing scrolls sideways (boxes, not scrollWidth: WebKit counts a hidden select's option text).
      expect(right(lastButton)).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})

test.describe('Header scope pickers on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 }, hasTouch: true })

  test('a tap lands on the course pill\'s select, and choosing Chemistry changes the board', async ({ page }) => {
    const topBar = await openBoard(page, 'Evening Review')
    await topBar.expectScope('Biology', DNA, { timeout: 10000 })
    await expect(topBar.scopeGroup).not.toContainText('Showing')

    // The transparent select covers the pill, so a tap opens the native picker.
    const box = (await topBar.courseSelect.boundingBox())!
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el?.getAttribute('aria-label') ?? el?.tagName
    }, [box.x + box.width / 2, box.y + box.height / 2])
    expect(hit).toBe('Course')
    expect(box.height).toBeGreaterThanOrEqual(40)

    await topBar.courseSelect.tap()
    await topBar.selectCourse('Chemistry')
    await topBar.expectScope('Chemistry', null)
    await expect(new PanelGridPom(page).panelByLabel('Transcript').getByText('Pick a lecture to see its transcript'))
      .toBeVisible({ timeout: 10000 })
  })
})

test.describe('Course scope filters every widget', () => {
  test('a Biology Exam Prep board shows only Biology and highlights it in All Courses', async ({ page }) => {
    const topBar = await openBoard(page, 'Exam Prep')
    const grid = new PanelGridPom(page)

    const weakest = grid.panelByLabel('Weakest Topics')
    const testMe = grid.panelByLabel('Test Me')
    const allCourses = grid.panelByLabel('All Courses')

    // Unscoped: every course is present and nothing is highlighted.
    await expect(weakest.getByText('chemistry').first()).toBeVisible({ timeout: 10000 })
    await expect(testMe.getByText('1/15')).toBeVisible()
    await expect(allCourses.locator('[data-highlighted]')).toHaveCount(0)

    await topBar.selectCourse('Biology')
    await topBar.expectScope('Biology')

    // Filtered widgets show only Biology and say what they leave out.
    // No course pills on a course board: Chemistry's lecture is simply gone.
    await expect(weakest.getByText(/Organic Reactions/)).toHaveCount(0, { timeout: 10000 })
    await expect(weakest.getByTestId('weak-topic')).toHaveCount(5)
    await expect(weakest.getByText('+1 in other courses')).toBeVisible()
    await expect(testMe.getByText('1/13')).toBeVisible()
    await expect(testMe.getByText('+2 in other courses')).toBeVisible()

    // All Courses highlights Biology and still shows Chemistry.
    await expect(allCourses.locator('[data-course="biology"]')).toHaveAttribute('data-highlighted', 'true')
    await expect(allCourses.locator('[data-course="chemistry"]')).toBeVisible()
    await expect(allCourses.locator('[data-course="chemistry"]')).not.toHaveAttribute('data-highlighted')
  })

  test('the Biology Evening Review board filters Your Progress and follows its lecture', async ({ page }) => {
    const topBar = await openBoard(page, 'Evening Review')
    const grid = new PanelGridPom(page)

    const thisWeek = grid.panelByLabel('Your Progress')
    await expect(thisWeek.getByText('biology')).toBeVisible({ timeout: 10000 })
    await expect(thisWeek.getByText('chemistry')).toHaveCount(0)
    await expect(thisWeek.getByText('+1 in other courses')).toBeVisible()
    await expect(grid.panelByLabel('Connections').getByText(/Same concept|Builds on|Related|References/).first()).toBeVisible()
    await expect(grid.panelByLabel('Transcript').getByText(DNA)).toBeVisible()

    // Clearing the course brings the other courses back.
    await topBar.selectCourse('All courses')
    await expect(thisWeek.getByText('chemistry')).toBeVisible({ timeout: 10000 })
    await expect(thisWeek.getByText('+1 in other courses')).toHaveCount(0)
  })

  test('selecting a Chemistry lecture on a Biology board makes it a Chemistry board: its title shows and tagging it works', async ({ page, request }) => {
    // One write, as a widget makes it (e.g. a moment jump): the lecture brings its course.
    const res = await request.post(`${apiUrl}/workspaces.setBoardScope`, {
      headers: { 'x-user-id': 'dev-user-1' },
      data: { json: { workspaceId: 'ws-evening-review', lectureId: 'lec-rec-chem-1' } },
    })
    expect(res.ok()).toBe(true)

    const topBar = await openBoard(page, 'Evening Review')
    const grid = new PanelGridPom(page)
    await topBar.expectScope('Chemistry', ORGANIC, { timeout: 10000 })
    await expect(topBar.lectureSelect).toHaveValue('lec-rec-chem-1')

    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript.getByText('SN1 vs SN2 still confusing')).toBeVisible({ timeout: 10000 })
    await transcript.getByText(/Good afternoon. Today we begin organic reactions/).click()
    const confusedButton = transcript.getByRole('button', { name: 'confused', exact: true })
    await expect(confusedButton).toBeVisible()
    const before = await transcript.locator('text=confused').count()
    await confusedButton.click()
    await expect(transcript.locator('text=confused')).toHaveCount(before + 1, { timeout: 10000 })
  })
})
