import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient, useCourses } from '@pls/substrate-client'
import { CoursesProvider } from '@pls/shared-ui'
import { substrateTrpc } from '@pls/substrate-client'
import { ManifestRegistryProvider, SubstrateProvider, type PanelManifest } from '@pls/lens-framework'
import { ToastHost } from '@pls/workspace-shell'
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
 * `toasts`: the shell's toast bar, under the widgets, as on a board. A widget's
 * notices reach it when its harness passes `onNotify={notifyToast}` (e.g.
 * TodoHarness, CalendarHarness): props mounted from a test run in Node, not here.
 */
/** The simulator's courses, looked up by every widget and the shell, as the web app provides them. */
function ServerCourses({ children }: { children: React.ReactNode }) {
  const courses = useCourses()
  return <CoursesProvider courses={courses.data}>{children}</CoursesProvider>
}

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
          <ServerCourses>
            <SubstrateProvider reader={substrateTrpc} writer={substrateTrpc} boardId={boardId}>
              {toasts ? (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1">{children}</div>
                  <ToastHost />
                </div>
              ) : children}
            </SubstrateProvider>
          </ServerCourses>
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
          <ServerCourses>{children}</ServerCourses>
        </ManifestRegistryProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
