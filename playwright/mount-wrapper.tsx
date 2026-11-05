import { Children, cloneElement, isValidElement, useState, type ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from '@pls/substrate-client'
import { substrateTrpc } from '@pls/substrate-client'
import { ManifestRegistryProvider, SubstrateProvider, type PanelManifest } from '@pls/lens-framework'
import { ToastHost, notifyToast } from '@pls/workspace-shell'
import { manifest as audioCapture } from '@pls/lens-audio-capture'
import { manifest as transcript } from '@pls/lens-transcript'
import { manifest as testMe } from '@pls/lens-test-me'
import { manifest as weeklyOverview } from '@pls/lens-weekly-overview'
import { manifest as connections } from '@pls/lens-connections'
import { manifest as gapAnalysis } from '@pls/lens-gap-analysis'
import { manifest as weakestTopics } from '@pls/lens-weakest-topics'
import { manifest as calendar } from '@pls/lens-calendar'
import { manifest as todo } from '@pls/lens-todo'
import { manifest as comingUp } from '@pls/lens-coming-up'
import { manifest as resources } from '@pls/lens-resources'
import { TRPC_URL } from './backend-simulator'

const manifests: PanelManifest[] = [
  audioCapture,
  resources,
  transcript,
  testMe,
  weeklyOverview,
  connections,
  gapAnalysis,
  weakestTopics,
  calendar,
  todo,
  comingUp,
]

/**
 * `boardId`: the board the mounted widgets sit on (none by default, as outside a board).
 * `toasts`: the mounted widget's `onNotify` (Undo toasts) shows in the shell's toast bar, under it, as on a board.
 */
export function TestProviders({ children, boardId, toasts }: { children: React.ReactNode; boardId?: string; toasts?: boolean }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      }),
  )
  const [trpcClient] = useState(() => createTRPCClient(TRPC_URL, 'dev-user-1'))

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ManifestRegistryProvider manifests={manifests}>
          <SubstrateProvider reader={substrateTrpc} writer={substrateTrpc} boardId={boardId}>
            {toasts ? (
              <div className="flex h-full flex-col">
                {/* As the shell does: each widget's onNotify is the toast bar. */}
                <div className="min-h-0 flex-1">
                  {Children.map(children, (child) => (isValidElement(child) && typeof child.type !== 'string' ? cloneElement(child as ReactElement<{ onNotify?: unknown }>, { onNotify: notifyToast }) : child))}
                </div>
                <ToastHost />
              </div>
            ) : children}
          </SubstrateProvider>
        </ManifestRegistryProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export function ShellProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      }),
  )
  const [trpcClient] = useState(() => createTRPCClient(TRPC_URL, 'dev-user-1'))

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ManifestRegistryProvider manifests={manifests}>
          {children}
        </ManifestRegistryProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
