import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { DialogPom } from './DialogPom'

export class CreateWorkspaceDialogPom extends DialogPom {
  readonly nameInput: Locator
  readonly courseSelect: Locator
  readonly createButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    super(page)
    this.nameInput = this.root.getByLabel('Name')
    this.courseSelect = this.root.getByLabel('Course (optional)')
    this.createButton = this.root.getByRole('button', { name: 'Create' })
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' })
  }

  async fillName(name: string) {
    await this.nameInput.fill(name)
  }

  async submit() {
    await this.createButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }

  /** Creates a board, optionally with a course (by its label, e.g. 'Biology'). */
  async createWorkspace(name: string, course?: string) {
    await this.fillName(name)
    if (course) await this.courseSelect.selectOption({ label: course })
    await this.submit()
  }

  async expectCreateDisabled() {
    await expect(this.createButton).toBeDisabled()
  }

  async expectCreateEnabled() {
    await expect(this.createButton).toBeEnabled()
  }
}
