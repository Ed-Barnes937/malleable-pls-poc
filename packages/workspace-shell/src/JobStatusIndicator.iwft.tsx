import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { JobStatusIndicator } from './JobStatusIndicator'

test('shows running job count from seed data', async ({ mount, page, simulator }) => {
  const component = await mount(
    <ShellProviders>
      <JobStatusIndicator />
    </ShellProviders>,
  )

  // Seed data has 1 running + 1 pending = 2 running jobs
  await expect(page.getByText('2 running')).toBeVisible()
})

test('shows no count when all jobs completed', async ({ mount, page, simulator }) => {
  // Clear running jobs from seed data
  for (const job of simulator.db.jobRuns) {
    if (job.status === 'running') job.status = 'completed'
    if (job.status === 'pending') job.status = 'completed'
  }

  const component = await mount(
    <ShellProviders>
      <JobStatusIndicator />
    </ShellProviders>,
  )

  await expect(page.getByText('running')).not.toBeVisible()
})

test('failed job explains itself and can be retried from Activity', async ({ mount, page, simulator }) => {
  simulator.db.jobRuns.push({
    ...simulator.db.jobRuns[0],
    id: 'jr-failed',
    job_type: 'ai:transcribe',
    status: 'failed',
    output: null,
    error: 'Recording rec-x not found',
    created_at: '2026-04-17T09:00:00Z',
  })

  await mount(
    <ShellProviders>
      <JobStatusIndicator />
    </ShellProviders>,
  )

  await page.getByTitle('2 jobs running').click()
  const failed = page.getByTestId('job-item').filter({ hasText: 'failed' })
  await expect(failed.getByText("This didn't finish. Give it another go.")).toBeVisible()
  await failed.getByText('Details').click()
  await expect(failed.getByText('Recording rec-x not found')).toBeVisible()

  await failed.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('3 running')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
})
