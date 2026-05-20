import { StrictMode, useState, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from '@pls/substrate-client'
import './index.css'
import { App } from './App'

const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools/production').then((m) => ({
    default: m.ReactQueryDevtools,
  }))
)

const serverUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const userId = import.meta.env.VITE_USER_ID ?? 'dev-user-1'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

const trpcClient = createTRPCClient(serverUrl, userId)

function Root() {
  const [showDevtools, setShowDevtools] = useState(false)

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).tqdevtools = () => setShowDevtools((v) => !v)
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
        {import.meta.env.DEV && showDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen />
          </Suspense>
        )}
      </QueryClientProvider>
    </trpc.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
