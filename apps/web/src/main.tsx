import { StrictMode, useState, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initDb } from '@pls/substrate'
import './index.css'
import { App } from './App'

const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools/production').then((m) => ({
    default: m.ReactQueryDevtools,
  }))
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

function Root() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDevtools, setShowDevtools] = useState(false)

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    (window as unknown as Record<string, unknown>).tqdevtools = () => setShowDevtools((v) => !v)
  }, [])

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center text-red-400">
        Failed to initialize database: {error}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 animate-pulse rounded-full bg-accent/50"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-600">Initializing substrate...</p>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <App />
      {showDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen />
        </Suspense>
      )}
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
