import { ArrowLeft } from 'lucide-react'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { ToastHost, useToastStore } from './toast'
import { useActiveWorkspaceId } from './activeBoard'
import { useWorkspaceStore } from './store'

/** Test fixture for the toast bar (component tests only): buttons that push toasts, and the bar. */
export function ToastHarness(props: { durationMs?: number; onAction?: () => void }) {
  return <ShellProviders><Buttons {...props} /></ShellProviders>
}

function Buttons({ durationMs, onAction }: { durationMs?: number; onAction?: () => void }) {
  const push = useToastStore((s) => s.push)
  const dismissKey = useToastStore((s) => s.dismissKey)
  const board = useActiveWorkspaceId()
  const setBoard = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const base = durationMs === undefined ? {} : { durationMs }
  return (
    <>
      <div className="flex h-screen flex-col">
        <div className="flex-1 p-4">
          <button type="button" onClick={() => push({ message: 'Transcript added', tone: 'success', ...base })}>Add plain</button>
          <button type="button" onClick={() => push({ message: 'Opened in In Lecture', tone: 'success', ...base, action: { label: 'Back to My week', icon: ArrowLeft, onClick: () => onAction?.() } })}>Add with action</button>
          <button type="button" onClick={() => push({ message: 'Widget added', tone: 'success', key: 'widget', ...base })}>Add keyed</button>
          <button type="button" onClick={() => push({ message: 'Stays until dismissed', tone: 'success', durationMs: null })}>Add forever</button>
          {/* A toast about the open board, pushed right behind another (so it waits its turn), then the student leaves the board. */}
          <button type="button" onClick={() => {
            push({ message: 'Transcript added', tone: 'success' })
            push({ message: 'About this board', tone: 'success', durationMs: null, board: board ?? undefined })
            setBoard('ws-evening-review')
          }}>Add board toast and leave</button>
          {/* The way "Go to moment" says it: switch boards, then push a toast about the board just opened. */}
          <button type="button" onClick={() => {
            setBoard('ws-evening-review')
            push({ message: 'Opened on the new board', tone: 'success', durationMs: null, board: 'ws-evening-review' })
          }}>Switch board and say so</button>
          <button type="button" onClick={() => push({ message: 'Could not save', tone: 'error', ...base })}>Add error</button>
          <button type="button" onClick={() => {
            push({ message: 'No longer marked confusing', tone: 'success', key: 'marks-seg-1', durationMs: null })
            push({ message: 'Review added to your plan', tone: 'success', durationMs: null })
          }}>Add marked and review</button>
          {/* The keyed toast waits its turn behind the first, and is dismissed before it is shown. */}
          <button type="button" onClick={() => {
            push({ message: 'Review added to your plan', tone: 'success', durationMs: null })
            push({ message: 'No longer marked confusing', tone: 'success', key: 'marks-seg-1', durationMs: null })
            dismissKey('marks-seg-1')
          }}>Add review, then marked, dismissed at once</button>
          <button type="button" onClick={() => {
            dismissKey('marks-seg-1')
            dismissKey('marks-none')
          }}>Dismiss marked</button>
        </div>
        <ToastHost />
      </div>
    </>
  )
}
