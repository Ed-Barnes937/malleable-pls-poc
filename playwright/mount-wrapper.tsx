import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from '@pls/substrate-client'
import { substrateTrpc } from '@pls/substrate-client'
import { ManifestRegistryProvider, SubstrateProvider, type PanelManifest } from '@pls/lens-framework'
import { manifest as audioCapture } from '@pls/lens-audio-capture'
import { manifest as transcript } from '@pls/lens-transcript'
import { manifest as testMe } from '@pls/lens-test-me'
import { manifest as weeklyOverview } from '@pls/lens-weekly-overview'
import { manifest as connections } from '@pls/lens-connections'
import { manifest as gapAnalysis } from '@pls/lens-gap-analysis'
import { manifest as weakestTopics } from '@pls/lens-weakest-topics'
import { TRPC_URL } from './backend-simulator'

const manifests: PanelManifest[] = [
  audioCapture,
  transcript,
  testMe,
  weeklyOverview,
  connections,
  gapAnalysis,
  weakestTopics,
]

export function TestProviders({ children }: { children: React.ReactNode }) {
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
          <SubstrateProvider reader={substrateTrpc} writer={substrateTrpc}>
            {children}
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
