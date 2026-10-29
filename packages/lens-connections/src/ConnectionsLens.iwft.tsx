import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import ConnectionsLens from './ConnectionsLens'

test('renders connections for a concept', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <ConnectionsLens
        panelId="test-panel"
        scope={{ recordingId: 'rec-bio-4' }}
        config={{ conceptLabel: 'mitochondrial DNA' }}
      />
    </TestProviders>,
  )

  await expect(page.getByRole('heading', { name: 'mitochondrial DNA' })).toBeVisible()
  // The widget title already says "Connections" (panel chrome); the body doesn't repeat it.
  await expect(page.getByText('Connections', { exact: true })).toHaveCount(0)
  // Should find connections from the seed data links
  await expect(page.getByText(/Same concept|Builds on|Related|References/).first()).toBeVisible()
})

test('shows empty state when no connections exist', async ({ mount, page, simulator }) => {
  // Clear all links
  simulator.db.links.length = 0

  await mount(
    <TestProviders>
      <ConnectionsLens
        panelId="test-panel"
        scope={{}}
        config={{ conceptLabel: 'mitochondrial DNA' }}
      />
    </TestProviders>,
  )

  await expect(page.getByText('No connections found')).toBeVisible()
})

test('prompts to focus a lecture when nothing is in scope', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <ConnectionsLens panelId="test-panel" scope={{}} config={{}} />
    </TestProviders>,
  )

  await expect(page.getByText('Focus a lecture to see its connections')).toBeVisible()
})

test('says what a course filter hides from a configured concept', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <ConnectionsLens panelId="test-panel" scope={{ courseTag: 'chemistry' }} config={{ conceptLabel: 'mitochondrial DNA' }} />
    </TestProviders>,
  )

  await expect(page.getByText('No connections found')).toBeVisible()
  await expect(page.getByText(/^\+\d+ in other courses$/)).toBeVisible()
})

test('the focused lecture keeps its connections whatever the course', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <ConnectionsLens panelId="test-panel" scope={{ recordingId: 'rec-bio-4', courseTag: 'chemistry' }} config={{}} />
    </TestProviders>,
  )

  await expect(page.getByText(/Same concept|Builds on|Related|References/).first()).toBeVisible()
})
