import { describe, expect, it, vi } from 'vitest'
import type { ResourceWithBody } from '@pls/substrate'
import { anyNoteUnsaved, dropNoteSaver, hasNoteSaver, openNoteSaver, type NoteSaver } from './noteSavers'

const note = (id: string): ResourceWithBody =>
  ({ id, title: 'Note', body_md: 'hello', updated_at: '2026-10-30T10:00:00.000Z' }) as ResourceWithBody

const registered = hasNoteSaver

const saved = (id: string) => vi.fn().mockResolvedValue({ ...note(id), updated_at: '2026-10-30T10:05:00.000Z' })
const notFound = () => vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { data: { code: 'NOT_FOUND' } }))

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('note savers', () => {
  it('leaves no saver behind when a note opens and closes without edits', () => {
    const saver = openNoteSaver('n-clean', note('n-clean'), saved('n-clean')) as NoteSaver
    expect(registered('n-clean')).toBe(true)
    saver.attach()
    saver.detach()
    expect(registered('n-clean')).toBe(false)
  })

  it('keeps one with unsaved changes after the view closes, and releases it once saved', async () => {
    const save = saved('n-edit')
    const saver = openNoteSaver('n-edit', note('n-edit'), save) as NoteSaver
    saver.attach()
    saver.change({ body_md: 'more' })
    saver.detach()
    expect(registered('n-edit')).toBe(true)
    await tick()
    expect(save).toHaveBeenCalledOnce()
    expect(registered('n-edit')).toBe(false)
  })

  it('stays registered when a view closes and another opens straight away (a remount)', () => {
    const saver = openNoteSaver('n-remount', note('n-remount'), saved('n-remount')) as NoteSaver
    saver.attach()
    saver.detach()
    saver.attach()
    saver.change({ body_md: 'typed after the remount' })
    expect(registered('n-remount')).toBe(true)
    saver.detach()
  })

  it('takes the editor\'s last words after the view closed (and was released), and releases again once saved', async () => {
    const save = saved('n-late')
    const saver = openNoteSaver('n-late', note('n-late'), save) as NoteSaver
    saver.attach()
    saver.detach()
    expect(registered('n-late')).toBe(false)
    saver.change({ body_md: 'last words' })
    expect(registered('n-late')).toBe(true)
    await tick()
    expect(save).toHaveBeenCalledOnce()
    expect(registered('n-late')).toBe(false)
  })

  it('drops a saver whose note is not found on the server, with nothing left to prompt about', async () => {
    const saver = openNoteSaver('n-gone', note('n-gone'), notFound()) as NoteSaver
    saver.attach()
    saver.change({ body_md: 'text for a deleted note' })
    saver.detach()
    await tick()
    expect(registered('n-gone')).toBe(false)
    expect(anyNoteUnsaved()).toBe(false)
  })

  it('drops a failed saver when its note is deleted', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    const saver = openNoteSaver('n-failed', note('n-failed'), save) as NoteSaver
    saver.attach()
    saver.change({ body_md: 'lost connection' })
    saver.detach()
    await tick()
    expect(saver.stuck).toBe(true)
    expect(anyNoteUnsaved()).toBe(true)
    dropNoteSaver('n-failed')
    expect(registered('n-failed')).toBe(false)
    expect(anyNoteUnsaved()).toBe(false)
  })
})
