import { Suspense, Component, useState, type ReactNode, type ErrorInfo } from 'react'
import { cn } from '@pls/shared-ui'
import { GripVertical, FileText, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { LENS_META } from './lens-meta'

interface ErrorBoundaryProps { children: ReactNode; lensType: string }
interface ErrorBoundaryState { error: Error | null }

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.lensType}]`, error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-tag-confused/60" />
          <p className="text-xs text-neutral-500">Something went wrong in this lens</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-1.5 rounded-md bg-surface-overlay px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-800" />
      <div className="h-3 w-full animate-pulse rounded bg-neutral-800/60" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-800/40" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-800/30" />
    </div>
  )
}

interface PanelContainerProps {
  panelId: string
  lensType: string
  dbPanelId?: string
  onRemove?: () => void
  onReplace?: (newLensType: string) => void
  children: ReactNode
}

export function PanelContainer({
  panelId,
  lensType,
  onRemove,
  onReplace,
  children,
}: PanelContainerProps) {
  const focusedPanelId = useWorkspaceStore((s) => s.focusedPanelId)
  const setFocusedPanelId = useWorkspaceStore((s) => s.setFocusedPanelId)
  const isFocused = focusedPanelId === panelId
  const [dragOver, setDragOver] = useState(false)

  const meta = LENS_META[lensType]
  const Icon = meta?.icon ?? FileText

  return (
    <div
      className={cn(
        'group/panel relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface-raised transition-[border-color,box-shadow] duration-150',
        dragOver
          ? 'border-accent/60 ring-2 ring-accent/20'
          : isFocused
            ? 'border-accent/40 ring-1 ring-accent/20'
            : 'border-border-subtle'
      )}
      onClick={() => setFocusedPanelId(panelId)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-lens-type')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const newLensType = e.dataTransfer.getData('application/x-lens-type')
        if (newLensType && onReplace) onReplace(newLensType)
      }}
    >
      <div className="panel-drag-handle flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-700 transition-colors hover:text-neutral-500 active:cursor-grabbing" />
        <Icon className="h-3.5 w-3.5 text-neutral-600" />
        <span className="text-xs font-medium text-neutral-400">
          {meta?.label ?? lensType}
        </span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-neutral-700 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
            title="Remove panel"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <PanelErrorBoundary lensType={lensType}>
          <Suspense fallback={<LoadingSkeleton />}>
            {children}
          </Suspense>
        </PanelErrorBoundary>
      </div>
    </div>
  )
}
