import { WorkspaceShell } from '@pls/workspace-shell'
import { CoursesProvider } from '@pls/shared-ui'
import { useCourses } from '@pls/substrate-client'
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
  // The student's courses, for every widget and the shell to look up by id.
  const courses = useCourses()
  return (
    <CoursesProvider courses={courses.data}>
      <ManifestRegistryProvider manifests={manifests}>
        <WorkspaceShell />
      </ManifestRegistryProvider>
    </CoursesProvider>
  )
}
