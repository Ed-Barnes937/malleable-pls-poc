import { Suspense, Component, type ReactNode, type ErrorInfo } from 'react'
import { SubstrateProvider, useManifest } from '@pls/lens-framework'
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
          <AlertTriangle size={24} className="text-text-muted" />
          <p className="text-xs text-text-secondary">This lens failed to render</p>
          <p className="text-[10px] text-text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-1 flex items-center gap-1.5 rounded-md bg-surface-overlay px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
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

/* ── Loading skeleton ── */

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

/* ── PanelContainer ── */

interface PanelContainerProps {
  lensType: string
  children: ReactNode
}

/**
 * PanelContainer wraps a lens component with SubstrateProvider, error boundary,
 * and Suspense. In the new canvas-based layout, the outer chrome (header, drag,
 * close, fullscreen) is handled by PanelChrome inside CanvasEngine.
 */
export function PanelContainer({ lensType, children }: PanelContainerProps) {
  const manifest = useManifest(lensType)
  const isWritable = manifest?.category === 'tool'

  return (
    <LensErrorBoundary label={manifest?.label ?? lensType}>
      <Suspense fallback={<LoadingSkeleton />}>
        <SubstrateProvider
          reader={substrateBridge}
          writer={isWritable ? substrateBridge : undefined}
        >
          {children}
        </SubstrateProvider>
      </Suspense>
    </LensErrorBoundary>
  )
}
