import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import type { WorkflowWithJobs } from '@pls/substrate'
import { WorkflowEditor } from './WorkflowEditor'

const workflow: WorkflowWithJobs = {
  id: 'wf-ct',
  source_lens: 'transcript',
  trigger_event: 'tag:created',
  condition_field: null,
  condition_value: null,
  enabled: 1,
  created_at: '2026-04-16T10:00:00Z',
  jobs: [
    { id: 'j1', workflow_id: 'wf-ct', job_type: 'ai:transcribe', params: {}, sort_order: 0, delay_ms: 0 },
    { id: 'j2', workflow_id: 'wf-ct', job_type: 'ai:summarize-lecture', params: {}, sort_order: 1, delay_ms: 0 },
    { id: 'j3', workflow_id: 'wf-ct', job_type: 'plan:review-task', params: {}, sort_order: 2, delay_ms: 0 },
  ],
} as unknown as WorkflowWithJobs

const editor = (
  <ShellProviders>
    <WorkflowEditor open onClose={() => {}} workspaceId="ws-in-lecture" sourceLens="transcript" workflow={workflow} />
  </ShellProviders>
)

/** The step types in the order shown, read from each row's select. */
const stepTypes = (page: import('@playwright/test').Page) =>
  page.getByTestId('workflow-step').evaluateAll((rows) => rows.map((r) => r.querySelector('select')?.value))

/** What the simulator holds for the saved workflow, in sort order. */
const savedTypes = (simulator: { db: { workflowJobs: { workflow_id: string; job_type: string; sort_order: number }[] } }) =>
  simulator.db.workflowJobs.filter((j) => j.workflow_id === 'wf-ct').sort((a, b) => a.sort_order - b.sort_order).map((j) => j.job_type)

test.describe('workflow step order', () => {
  test('keyboard: Space picks a step up, arrows move it, Space drops it; the order saves', async ({ mount, page, simulator }) => {
    simulator.db.workflows.push({ ...workflow, workspace_id: null } as never)
    await mount(editor)
    expect(await stepTypes(page)).toEqual(['ai:transcribe', 'ai:summarize-lecture', 'plan:review-task'])

    await page.getByRole('button', { name: 'Drag to reorder step 1' }).focus()
    await page.keyboard.press('Space')
    await expect(page.locator('[data-ui-sdk-announcer="assertive"]')).toHaveText('Picked up "Write a transcript" step, position 1 of 3.')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-ui-sdk-announcer="assertive"]')).toHaveText('"Write a transcript" step moved to position 2 of 3')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(page.locator('[data-ui-sdk-announcer="assertive"]')).toHaveText('"Write a transcript" step dropped at position 3 of 3')
    expect(await stepTypes(page)).toEqual(['ai:summarize-lecture', 'plan:review-task', 'ai:transcribe'])
    // Focus stays on the step that moved.
    await expect(page.getByRole('button', { name: 'Drag to reorder step 3' })).toBeFocused()

    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => savedTypes(simulator)).toEqual(['ai:summarize-lecture', 'plan:review-task', 'ai:transcribe'])
  })

  test('Escape puts the step back', async ({ mount, page }) => {
    await mount(editor)
    await page.getByRole('button', { name: 'Drag to reorder step 2' }).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
    expect(await stepTypes(page)).toEqual(['ai:summarize-lecture', 'ai:transcribe', 'plan:review-task'])
    await page.keyboard.press('Escape')
    expect(await stepTypes(page)).toEqual(['ai:transcribe', 'ai:summarize-lecture', 'plan:review-task'])
    // Escape cancelled the move only: the dialog is still open.
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('dragging the grip with the mouse moves the step', async ({ mount, page }) => {
    await mount(editor)
    const grip = (await page.getByRole('button', { name: 'Drag to reorder step 1' }).boundingBox())!
    const third = (await page.getByTestId('workflow-step').nth(2).boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, third.y + third.height - 4, { steps: 10 })
    await page.mouse.up()
    expect(await stepTypes(page)).toEqual(['ai:summarize-lecture', 'plan:review-task', 'ai:transcribe'])
  })

  test('the up and down buttons still move a step', async ({ mount, page }) => {
    await mount(editor)
    await page.getByTestId('workflow-step').nth(2).getByRole('button', { name: 'Move step up' }).click()
    expect(await stepTypes(page)).toEqual(['ai:transcribe', 'plan:review-task', 'ai:summarize-lecture'])
    await page.getByTestId('workflow-step').nth(0).getByRole('button', { name: 'Move step down' }).click()
    expect(await stepTypes(page)).toEqual(['plan:review-task', 'ai:transcribe', 'ai:summarize-lecture'])
  })

  test('a step keeps its own settings when others move around it', async ({ mount, page }) => {
    await mount(editor)
    await page.getByTestId('workflow-step').nth(1).getByLabel(/Days to wait before step/).fill('3')
    await page.getByTestId('workflow-step').nth(1).getByRole('button', { name: 'Move step up' }).click()
    await expect(page.getByTestId('workflow-step').nth(0).getByLabel(/Days to wait before step/)).toHaveValue('3')
  })
})
