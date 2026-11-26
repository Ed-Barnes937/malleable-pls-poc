import { describe, it, expect } from 'vitest'
import { createSaveQueue } from './save-queue'

/** A save the test resolves or rejects by hand, so it can be "in flight". */
function deferredSends() {
  const sent: Array<{ key: string; value: number; resolve: () => void; reject: (e: unknown) => void }> = []
  const send = (key: string, value: number) => new Promise<void>((resolve, reject) => { sent.push({ key, value, resolve, reject }) })
  return { sent, send }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('save queue (latest wins, per block)', () => {
  it('sends a change at once when nothing is in flight', () => {
    const { sent, send } = deferredSends()
    const queue = createSaveQueue(send)
    queue.push('maths', 1)
    expect(sent.map((s) => s.value)).toEqual([1])
    expect(queue.busy('maths')).toBe(true)
  })

  it('8 quick changes send the first, then only the last once the first lands', async () => {
    const { sent, send } = deferredSends()
    const done: Array<{ key: string; value: number; error?: unknown }> = []
    const queue = createSaveQueue(send, { onDone: (key, result) => done.push({ key, ...result }) })
    for (let i = 1; i <= 8; i++) queue.push('maths', i)
    expect(sent.map((s) => s.value)).toEqual([1])

    sent[0].resolve()
    await flush()
    expect(sent.map((s) => s.value)).toEqual([1, 8])
    expect(done).toEqual([])

    sent[1].resolve()
    await flush()
    expect(sent).toHaveLength(2)
    expect(done).toEqual([{ key: 'maths', value: 8 }])
    expect(queue.busy('maths')).toBe(false)
  })

  it('keeps blocks apart: a save in flight for one never holds back another', () => {
    const { sent, send } = deferredSends()
    const queue = createSaveQueue(send)
    queue.push('maths', 1)
    queue.push('biology', 2)
    expect(sent.map((s) => [s.key, s.value])).toEqual([['maths', 1], ['biology', 2]])
  })

  it('a failed save still sends the change queued after it; only the last outcome is reported', async () => {
    const { sent, send } = deferredSends()
    const done: Array<{ key: string; value: number; error?: unknown }> = []
    const queue = createSaveQueue(send, { onDone: (key, result) => done.push({ key, ...result }) })
    queue.push('maths', 1)
    queue.push('maths', 2)
    sent[0].reject(new Error('offline'))
    await flush()
    expect(sent.map((s) => s.value)).toEqual([1, 2])
    expect(done).toEqual([])
    const boom = new Error('still offline')
    sent[1].reject(boom)
    await flush()
    expect(done).toEqual([{ key: 'maths', value: 2, error: boom }])
  })
})
