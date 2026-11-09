import { test, expect } from './test'
import type { APIRequestContext, Page } from '@playwright/test'
import { PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation } from './api'

/**
 * Uploading files to the Resources widget against the real server and
 * database: a PDF goes up, opens from its signed link, and is gone from the
 * server when deleted; a file that isn't what its name says is refused.
 */

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 This program cannot be run in DOS mode.\r\n')

async function resourcesBoard(request: APIRequestContext) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Course stuff' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: board.id, lensType: 'resources', slotName: 'resources', pos_x: 24, pos_y: 24, width: 520, height: 640,
  })
  await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: board.id, courseTag: 'biology' })
  return board.id
}

async function open(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('Course stuff')
  const panel = new PanelGridPom(page).panelByLabel('Resources')
  await expect(panel).toBeVisible()
  return panel
}

test.describe('Resource files', () => {
  test.beforeEach(async () => {
    await reseed()
  })
  test.afterAll(async () => {
    await reseed()
  })

  test('uploads a PDF, opens it from a signed link, and the link 404s once it is deleted', async ({ page, request, context }) => {
    await resourcesBoard(request)
    const panel = await open(page)

    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    await panel.getByTestId('resource-file-input').setInputFiles({ name: 'Cell notes.pdf', mimeType: 'application/pdf', buffer: PDF })
    const row = panel.getByTestId('resource-row').filter({ hasText: 'Cell notes' })
    await expect(row).toBeVisible()
    await expect(row.getByText(`PDF · ${PDF.length} B`)).toBeVisible()

    // Opening makes a signed link and shows it in a new tab.
    const served = context.waitForEvent('response', { predicate: (r) => r.url().includes('/resource-files/') })
    const popup = context.waitForEvent('page')
    await row.getByRole('button', { name: 'Cell notes', exact: true }).click()
    await popup
    const response = await served
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/pdf')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(response.headers()['content-security-policy']).toBe('sandbox')
    const link = response.url()
    expect((await request.get(link)).status()).toBe(200)

    // Delete (with its Undo window), and the file is gone for the link too.
    await row.getByRole('button', { name: 'More for Cell notes' }).click()
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(panel.getByRole('button', { name: 'Undo delete: Cell notes' })).toBeVisible()
    await expect.poll(async () => (await request.get(link)).status(), { timeout: 15_000 }).toBe(404)
  })

  test('refuses an .exe renamed to .pdf, and a type that is not allowed, with a message', async ({ page, request, consoleErrors }) => {
    consoleErrors.allowFailedRequest('resource-upload')
    await resourcesBoard(request)
    const panel = await open(page)
    const rows = panel.getByTestId('resource-row')
    await expect(rows.first()).toBeVisible()
    const before = await rows.count()

    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    const input = panel.getByTestId('resource-file-input')
    await input.setInputFiles({ name: 'virus.pdf', mimeType: 'application/pdf', buffer: EXE })
    await expect(panel.getByRole('alert')).toHaveText("That file isn't a valid PDF file.")

    await input.setInputFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: EXE })
    await expect(panel.getByRole('alert')).toContainText("That file type isn't supported")

    await expect(rows).toHaveCount(before)
  })
})
