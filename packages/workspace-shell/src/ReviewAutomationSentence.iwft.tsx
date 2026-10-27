import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { WorkflowCard } from './WorkflowCard'

const workflow = {
  id: 'wf-confused-review',
  source_lens: 'transcript',
  trigger_event: 'tag:created',
  condition_field: 'label',
  condition_value: 'confused',
  enabled: true,
  workspace_id: null,
  jobs: [{
    id: 'wfj-confused-review',
    workflow_id: 'wf-confused-review',
    job_type: 'plan:review-task',
    params: { durationMin: 20, windowDays: 3, timeZone: 'Europe/London' },
    sort_order: 0,
    delay_ms: 0,
  }],
}

test('reads the confusion automation as a sentence', async ({ mount, page }) => {
  await mount(
    <ShellProviders>
      <WorkflowCard workflow={workflow} workspaceId="ws-in-lecture" />
    </ShellProviders>,
  )

  const sentence = page.getByTestId('review-automation-sentence')
  await expect(sentence).toContainText('When I mark something')
  await expect(sentence.getByLabel('Which mark starts this')).toHaveValue('confused')
  await expect(sentence.getByLabel('Review length in minutes')).toHaveValue('20')
  await expect(sentence.getByLabel('When the review should happen by')).toHaveValue('3')
  await expect(sentence.getByLabel('When the review should happen by').locator('option:checked')).toHaveText('within 3 days')
})

test('editing a field saves the new params in place', async ({ mount, page, simulator }) => {
  await mount(
    <ShellProviders>
      <WorkflowCard workflow={workflow} workspaceId="ws-in-lecture" />
    </ShellProviders>,
  )

  const sentence = page.getByTestId('review-automation-sentence')
  await sentence.getByLabel('Review length in minutes').selectOption('30')
  await expect(sentence).toContainText('Saved.')
  await sentence.getByLabel('When the review should happen by').selectOption({ label: 'by tomorrow' })

  await expect.poll(() => {
    const job = simulator.db.workflowJobs.find((j) => j.id === 'wfj-confused-review')
    return job ? JSON.parse(job.params as string) : null
  }).toMatchObject({ durationMin: 30, windowDays: 1 })
  // Edited in place: the job keeps its id, the default automation is not copied.
  expect(simulator.db.workflows.filter((w) => w.trigger_event === 'tag:created')).toHaveLength(1)
})
