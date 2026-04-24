import { WorkspaceShell } from '@pls/workspace-shell'
import { LensRegistryProvider } from '@pls/lens-framework'

const lensRegistry = {
  'audio-capture': () => import('@pls/lens-audio-capture'),
  'transcript': () => import('@pls/lens-transcript'),
  'test-me': () => import('@pls/lens-test-me'),
  'weekly-overview': () => import('@pls/lens-weekly-overview'),
  'connections': () => import('@pls/lens-connections'),
  'gap-analysis': () => import('@pls/lens-gap-analysis'),
  'weakest-topics': () => import('@pls/lens-weakest-topics'),
}

export function App() {
  return (
    <LensRegistryProvider registry={lensRegistry}>
      <WorkspaceShell />
    </LensRegistryProvider>
  )
}
