import { describe, it, expect } from 'vitest'
import { isLectureBoard, lectureBoards, openedLectureMessage, type BoardContents } from './class-focus'

// The lecture declarations of the registered widgets (each package's manifest in src/index.ts).
const manifests = [
  { id: 'audio-capture', scope: { courseTag: 'filter', lectureId: 'target' } },
  { id: 'transcript', scope: { courseTag: 'filter', lectureId: 'target' } },
  { id: 'connections', scope: { courseTag: 'filter', lectureId: 'target' } },
  { id: 'resources', scope: { courseTag: 'filter', lectureId: 'target' } },
  { id: 'calendar', scope: { courseTag: 'highlight', lectureId: 'highlight' } },
  { id: 'todo', scope: { courseTag: 'filter', lectureId: 'highlight' } },
  { id: 'coming-up', scope: { courseTag: 'filter', lectureId: 'highlight' } },
  { id: 'weakest-topics', scope: { courseTag: 'filter', lectureId: 'ignore' } },
  { id: 'test-me', scope: { courseTag: 'filter' } },
] as const

describe('isLectureBoard', () => {
  it('is true when any widget works on the selected lecture: Record, Transcript, Connections, Resources', () => {
    for (const type of ['audio-capture', 'transcript', 'connections', 'resources']) {
      expect(isLectureBoard(['calendar', type], manifests)).toBe(true)
    }
  })

  it('is false for widgets that only highlight or ignore a lecture, unknown widgets, and an empty board', () => {
    expect(isLectureBoard(['calendar', 'todo', 'coming-up'], manifests)).toBe(false)
    expect(isLectureBoard(['weakest-topics', 'test-me'], manifests)).toBe(false)
    expect(isLectureBoard(['unregistered-widget'], manifests)).toBe(false)
    expect(isLectureBoard([], manifests)).toBe(false)
  })
})

describe('lectureBoards', () => {
  const boards: BoardContents[] = [
    { id: 'plan', name: 'Plan', lens_types: ['calendar', 'todo'] },
    { id: 'bio', name: 'Biology stuff', lens_types: ['audio-capture'] },
    { id: 'exam', name: 'Exam Prep', lens_types: ['weakest-topics', 'test-me'] },
    { id: 'lecture', name: 'In Lecture', lens_types: ['transcript', 'audio-capture'] },
    { id: 'empty', name: 'Empty', lens_types: [] },
  ]

  it('lists other boards that can show a lecture, by their own names, in tab order', () => {
    expect(lectureBoards(boards, manifests, 'plan')).toEqual([
      { id: 'bio', name: 'Biology stuff' },
      { id: 'lecture', name: 'In Lecture' },
    ])
  })

  it('finds boards by contents, not by name', () => {
    const renamed = boards.map((b) => (b.id === 'lecture' ? { ...b, name: 'Plan B', lens_types: ['calendar'] } : b))
    expect(lectureBoards(renamed, manifests, 'plan').map((b) => b.name)).toEqual(['Biology stuff'])
  })

  it('leaves out the open board', () => {
    expect(lectureBoards(boards, manifests, 'lecture')).toEqual([{ id: 'bio', name: 'Biology stuff' }])
  })

  it('is empty when no other board can show a lecture', () => {
    expect(lectureBoards(boards.filter((b) => b.id !== 'bio' && b.id !== 'lecture'), manifests, 'plan')).toEqual([])
    expect(lectureBoards([], manifests, null)).toEqual([])
  })
})

describe('openedLectureMessage', () => {
  it('names the lecture and the board it opened on', () => {
    expect(openedLectureMessage('Biology lecture · Tue 28 Oct', 'In Lecture')).toBe('Opened Biology lecture · Tue 28 Oct in In Lecture')
  })
})
