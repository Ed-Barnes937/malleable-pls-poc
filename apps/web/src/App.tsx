import { WorkspaceShell } from '@pls/workspace-shell'
import { ManifestRegistryProvider, type PanelManifest } from '@pls/lens-framework'
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

export function App() {
  return (
    <ManifestRegistryProvider manifests={manifests}>
      <WorkspaceShell />
    </ManifestRegistryProvider>
  )
}
