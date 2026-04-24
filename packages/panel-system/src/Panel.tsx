import { Suspense, Component, type ReactNode, type ErrorInfo, type ComponentType } from 'react'
import { cn } from '@pls/shared-ui'
import { GripVertical, FileText, AlertTriangle, RefreshCw, X } from 'lucide-react'

interface ErrorBoundaryProps { children: ReactNode; label: string }
interface ErrorBoundaryState { error: Error | null }

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.label}]`, error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-tag-confused/60" />
          <p className="text-xs text-neutral-500">Something went wrong in this panel</p>
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

export interface PanelProps {
  label: string
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
  onRemove?: () => void
  headerActions?: ReactNode
  focused?: boolean
  onFocus?: () => void
  pulsing?: boolean
}

export function Panel({
  label,
  icon: Icon = FileText,
  children,
  onRemove,
  headerActions,
  focused = false,
  onFocus,
  pulsing = false,
}: PanelProps) {
  return (
    <div
      className={cn(
        'group/panel relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface-raised transition-[border-color,box-shadow] duration-150',
        pulsing
          ? 'border-accent/60 ring-2 ring-accent/30'
          : focused
            ? 'border-accent/40 ring-1 ring-accent/20'
            : 'border-border-subtle'
      )}
      onClick={onFocus}
    >
      <div className="panel-drag-handle flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-700 transition-colors hover:text-neutral-500 active:cursor-grabbing" />
        <Icon className="h-3.5 w-3.5 text-neutral-600" />
        <span className="text-xs font-medium text-neutral-400">{label}</span>
        <div className="ml-auto flex items-center gap-1">
          {headerActions}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-700 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
              title="Remove panel"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <PanelErrorBoundary label={label}>
          <Suspense fallback={<LoadingSkeleton />}>
            {children}
          </Suspense>
        </PanelErrorBoundary>
      </div>
    </div>
  )
}
