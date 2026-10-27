import { Suspense, Component, type ReactNode, type ErrorInfo } from 'react'
import { SubstrateProvider, useManifest, canWrite } from '@pls/lens-framework'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { substrateBridge } from './substrate-bridge'

/* ── Error boundary ── */

interface ErrorBoundaryProps { children: ReactNode; label: string }
interface ErrorBoundaryState { error: Error | null }

class LensErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.label}]`, error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertTriangle size={24} className="text-confused" />
          <p className="text-body font-semibold text-text-primary">This lens failed to render</p>
          <p className="text-meta text-text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-1 flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface-raised px-3.5 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── Loading skeleton ── */

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-overlay" />
      <div className="h-3 w-full animate-pulse rounded-full bg-surface-overlay/80" />
      <div className="h-3 w-5/6 animate-pulse rounded-full bg-surface-overlay/60" />
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface-overlay/40" />
    </div>
  )
}

/* ── PanelContainer ── */

interface PanelContainerProps {
  lensType: string
  /** The board the panel sits on (see useBoardId). */
  boardId?: string | null
  children: ReactNode
}

/**
 * PanelContainer wraps a lens component with SubstrateProvider, error boundary,
 * and Suspense. In the new canvas-based layout, the outer chrome (header, drag,
 * close, fullscreen) is handled by PanelChrome inside CanvasEngine.
 */
export function PanelContainer({ lensType, boardId, children }: PanelContainerProps) {
  const manifest = useManifest(lensType)
  // Writer access follows the manifest's `writes` declaration.
  const isWritable = canWrite(manifest)

  return (
    <LensErrorBoundary label={manifest?.label ?? lensType}>
      <Suspense fallback={<LoadingSkeleton />}>
        <SubstrateProvider
          reader={substrateBridge}
          writer={isWritable ? substrateBridge : undefined}
          boardId={boardId}
        >
          {children}
        </SubstrateProvider>
      </Suspense>
    </LensErrorBoundary>
  )
}
