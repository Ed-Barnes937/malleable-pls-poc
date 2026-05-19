import { WorkspaceShell } from '@pls/workspace-shell'
import { ManifestRegistryProvider, type PanelManifest } from '@pls/lens-framework'
import { manifest as audioCapture } from '@pls/lens-audio-capture'
import { manifest as transcript } from '@pls/lens-transcript'
import { manifest as testMe } from '@pls/lens-test-me'
import { manifest as weeklyOverview } from '@pls/lens-weekly-overview'
import { manifest as connections } from '@pls/lens-connections'
import { manifest as gapAnalysis } from '@pls/lens-gap-analysis'
import { manifest as weakestTopics } from '@pls/lens-weakest-topics'

const manifests: PanelManifest[] = [
  audioCapture,
  transcript,
  testMe,
  weeklyOverview,
  connections,
  gapAnalysis,
  weakestTopics,
]

export function App() {
  return (
    <ManifestRegistryProvider manifests={manifests}>
      <WorkspaceShell />
    </ManifestRegistryProvider>
  )
}
