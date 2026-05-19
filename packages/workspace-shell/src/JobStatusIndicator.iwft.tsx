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
