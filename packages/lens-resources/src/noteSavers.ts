import { useSyncExternalStore } from 'react'
import { isConflictError } from '@pls/lens-framework'
import type { ResourceUpdate, ResourceWithBody } from '@pls/substrate'

/** How long typing pauses before a note saves. */
export const AUTOSAVE_DELAY_MS = 800

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'conflict'

type Patch = ResourceUpdate['patch']
type Save = (update: ResourceUpdate) => Promise<ResourceWithBody>

/**
 * Autosave for one note, kept for the whole page rather than one view of it.
 *
 * Changes (body and title) gather into one patch and save after a pause in
 * typing, one save at a time and in order. Each save names the `updated_at`
 * the last one returned, so a save on top of a change made elsewhere
 * (another device) is refused with a CONFLICT instead of overwriting it; the
 * student then picks `reload` (take theirs) or `keepMine` (save this text
 * over it).
 *
 * The saver outlives the note's view: leaving the note saves what is left,
 * and a note opened again while a save is still on its way, or after one
 * failed, starts from the saver's text (`title`, `body`), not from the
 * server's last answer, so nothing typed is lost or mistaken for a change
 * made elsewhere. Rows show a saver that could not save as "Not saved".
 */
export class NoteSaver {
  status: SaveStatus = 'idle'
  /** The note as the student last left it: what is saved plus what isn't yet. */
  title: string
  body: string
  /** Views showing this note. Changes save at once when there are none. */
  views = 0
  private base: string | Date | undefined
  private pending: Patch | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  /** Set by "keep mine": the next save skips the check. */
  private force = false
  private save: Save
  private readonly listeners = new Set<() => void>()

  constructor(
    readonly id: string,
    note: Pick<ResourceWithBody, 'title' | 'body_md' | 'updated_at'>,
    save: Save,
  ) {
    this.title = note.title
    this.body = note.body_md ?? ''
    this.base = note.updated_at
    this.save = save
  }

  /** Something the student has not got onto the server yet, or is on its way. */
  get dirty(): boolean {
    return this.pending !== null || this.inFlight || this.status === 'failed' || this.status === 'conflict'
  }

  /** Text that will not save without the student: a failed save or a conflict. */
  get stuck(): boolean {
    return this.status === 'failed' || this.status === 'conflict'
  }

  /** Whether the last save (or the load) was this version of the note. */
  isAt(updatedAt: string | Date) {
    return this.base !== undefined && new Date(this.base).getTime() === new Date(updatedAt).getTime()
  }

  /** The latest way to save (a view's mutation); kept after the view goes. */
  setSave(save: Save) {
    this.save = save
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  change(patch: Patch) {
    if (patch.title !== undefined) this.title = patch.title
    if (patch.body_md !== undefined) this.body = patch.body_md ?? ''
    this.pending = { ...this.pending, ...patch }
    if (this.status === 'conflict') return this.emit()
    // Nobody is looking (the note closed, the page hidden): save now.
    if (this.views === 0 || document.visibilityState === 'hidden') return void this.run()
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), AUTOSAVE_DELAY_MS)
    this.setStatus(this.inFlight ? 'saving' : 'unsaved')
  }

  /** Saves now (leaving the note, the page going away, "Try again"). */
  flush = () => {
    if (this.status !== 'conflict') void this.run()
  }

  /** After a conflict: save this text over the other change. */
  keepMine = () => {
    this.force = true
    this.status = 'unsaved'
    void this.run()
  }

  /** After a conflict: drop unsaved changes and take the saved note (`fresh`). */
  reload = (fresh: ResourceWithBody) => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
    this.force = false
    this.title = fresh.title
    this.body = fresh.body_md ?? ''
    this.base = fresh.updated_at
    this.setStatus('idle')
  }

  private async run() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.inFlight || !this.pending || this.status === 'conflict') return
    const patch = this.pending
    this.pending = null
    this.inFlight = true
    this.setStatus('saving')
    try {
      const saved = await this.save({ id: this.id, patch, expectedUpdatedAt: this.force ? undefined : this.base })
      this.force = false
      this.base = saved.updated_at
      this.inFlight = false
      this.setStatus(this.pending ? 'unsaved' : 'saved')
    } catch (err) {
      // Keep what didn't save, under anything typed since.
      this.pending = { ...patch, ...(this.pending as Patch | null) }
      this.inFlight = false
      this.setStatus(isConflictError(err) ? 'conflict' : 'failed')
    }
    // Typed while that save was on its way.
    if (this.pending && this.status === 'unsaved') void this.run()
  }

  private setStatus(status: SaveStatus) {
    this.status = status
    this.emit()
  }

  private emit() {
    if (this.views === 0 && !this.dirty && savers.get(this.id) === this) savers.delete(this.id)
    for (const listener of this.listeners) listener()
    notifyAll()
  }
}

const savers = new Map<string, NoteSaver>()
const registryListeners = new Set<() => void>()

function notifyAll() {
  for (const listener of registryListeners) listener()
}

/**
 * The saver for a note being opened. One that still has something to save
 * (on its way, failed, or in conflict) or is open elsewhere carries on, with
 * the student's text; so does one at the same version as `note`. Otherwise a
 * new one starts from `note`, the server's copy.
 */
export function openNoteSaver(id: string, note: ResourceWithBody | null | undefined, save: Save): NoteSaver | null {
  const existing = savers.get(id)
  if (existing && (existing.dirty || existing.views > 0 || (note && existing.isAt(note.updated_at)))) {
    existing.setSave(save)
    return existing
  }
  if (!note) return null
  const saver = new NoteSaver(id, note, save)
  savers.set(id, saver)
  return saver
}

/** The saver of a note that still has something to save, if any. */
export function pendingNoteSaver(id: string): NoteSaver | undefined {
  const saver = savers.get(id)
  return saver?.dirty ? saver : undefined
}

/** Whether a note has text that will not save without the student (shown as "Not saved"). */
export function useNoteStuck(id: string): boolean {
  return useSyncExternalStore(
    subscribeAll,
    () => savers.get(id)?.stuck ?? false,
  )
}

function subscribeAll(listener: () => void) {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

/** Saves every note now. */
export function flushAllNotes() {
  for (const saver of savers.values()) saver.flush()
}

/** Whether any note has something not yet saved. */
export function anyNoteUnsaved(): boolean {
  for (const saver of savers.values()) if (saver.dirty) return true
  return false
}

// The page going away (tab closed, app switched on a phone) saves what's left,
// and asks first while something is still unsaved. Coming back online retries.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAllNotes)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAllNotes()
  })
  window.addEventListener('beforeunload', (e) => {
    flushAllNotes()
    if (anyNoteUnsaved()) e.preventDefault()
  })
  window.addEventListener('online', () => {
    for (const saver of savers.values()) if (saver.status === 'failed') saver.flush()
  })
}
