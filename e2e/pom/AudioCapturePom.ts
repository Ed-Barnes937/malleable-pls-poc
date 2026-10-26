import type { Locator } from '@playwright/test'

/**
 * The Audio Capture lens body. Wraps the "Upload a recording" flow: pick a
 * file, confirm title/course in the inline form, submit.
 */
export class AudioCapturePom {
  readonly uploadButton: Locator
  readonly uploadForm: Locator
  readonly titleInput: Locator
  readonly courseSelect: Locator

  constructor(readonly root: Locator) {
    this.uploadButton = root.getByRole('button', { name: 'Upload a recording' })
    this.uploadForm = root.getByRole('form', { name: 'Upload a recording' })
    this.titleInput = this.uploadForm.getByRole('textbox', { name: 'Recording title' })
    this.courseSelect = this.uploadForm.getByRole('combobox', { name: 'Recording course' })
  }

  /** Picks `filePath` via the Upload button's file chooser, opening the details form. */
  async pickFile(filePath: string) {
    const chooser = this.root.page().waitForEvent('filechooser')
    await this.uploadButton.click()
    await (await chooser).setFiles(filePath)
  }

  async submitUpload(details: { title?: string; course?: string } = {}) {
    if (details.title !== undefined) await this.titleInput.fill(details.title)
    if (details.course !== undefined) await this.courseSelect.selectOption({ label: details.course })
    await this.uploadForm.getByRole('button', { name: 'Upload' }).click()
  }
}
