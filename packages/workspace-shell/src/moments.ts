import { useCallback } from 'react'
import { AudioLines } from 'lucide-react'
import type { Moment, PanelManifest, ShowMomentResult } from '@pls/lens-framework'
import { formatTime } from '@pls/shared-ui'
import { trpc, decodeScope, useSetWorkspaceScope, SCOPE_TYPE_BY_DIM } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { useToastStore } from './toast'

/** What `chooseMomentBoard` needs to know about each board. */
export interface MomentBoardCandidate {
  id: string
  name?: string
  lensTypes: string[]
  recordingId?: string
}

type ManifestFlags = Pick<PanelManifest, 'id' | 'showsMoments'>

/** Whether any of `lensTypes` is a widget that can show a recording moment. */
export function hasMomentViewer(lensTypes: string[], manifests: ManifestFlags[]): boolean {
  return lensTypes.some((type) => manifests.find((m) => m.id === type)?.showsMoments === true)
}

/**
 * The board to open a moment on: among boards with a moment viewer, prefer
 * one already focused on the recording, else the first in board order.
 */
export function chooseMomentBoard(
  boards: MomentBoardCandidate[],
  manifests: ManifestFlags[],
  recordingId: string,
): string | undefined {
  const viewers = boards.filter((b) => hasMomentViewer(b.lensTypes, manifests))
  return (viewers.find((b) => b.recordingId === recordingId) ?? viewers[0])?.id
}

/** "Opened 1:18 in In Lecture": the toast after a moment opened on another board. */
export function openedElsewhereMessage(offsetMs: number, boardName: string): string {
  return `Opened ${formatTime(offsetMs)} in ${boardName}`
}

/**
 * The shell side of `LensProps.onShowMoment`: focus the moment's recording on
 * a board and publish the moment to widgets that declare `showsMoments` (they
 * read it as `LensProps.focusedMoment`, scroll to it and highlight it).
 *
 * Shown on the active board when it has a moment viewer. Otherwise it
 * switches to the best board that has one (see `chooseMomentBoard`) and says
 * so in a toast that offers the way back.
 */
export function useShowMoment(
  activeWorkspaceId: string,
  activeLensTypes: string[],
  manifests: PanelManifest[],
): (moment: Moment) => Promise<ShowMomentResult> {
  const utils = trpc.useUtils()
  const { mutateAsync: setScope } = useSetWorkspaceScope()
  const focusMoment = useWorkspaceStore((s) => s.focusMoment)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const pushToast = useToastStore((s) => s.push)

  const focusRecording = useCallback(
    (workspaceId: string, recordingId: string) =>
      setScope({ workspaceId, scopeType: SCOPE_TYPE_BY_DIM.recordingId, scopeValue: recordingId }),
    [setScope],
  )

  return useCallback(
    async (moment: Moment): Promise<ShowMomentResult> => {
      let target: MomentBoardCandidate | undefined
      let from: MomentBoardCandidate | undefined
      if (!hasMomentViewer(activeLensTypes, manifests)) {
        const workspaces = (await utils.workspaces.list.fetch()) as unknown as { id: string; name: string }[]
        const boards = await Promise.all(
          workspaces.map(async (ws): Promise<MomentBoardCandidate> => {
            const [panels, scopes] = await Promise.all([
              utils.workspaces.panels.fetch(ws.id),
              utils.workspaces.scopes.fetch(ws.id),
            ])
            return {
              id: ws.id,
              name: ws.name,
              lensTypes: (panels as unknown as { lens_type: string }[]).map((p) => p.lens_type),
              recordingId: decodeScope(scopes as unknown as { scope_type: string; scope_value: string }[]).recordingId,
            }
          }),
        )
        const targetId = chooseMomentBoard(boards, manifests, moment.recordingId)
        if (!targetId) {
          await focusRecording(activeWorkspaceId, moment.recordingId)
          return 'no-viewer'
        }
        target = boards.find((b) => b.id === targetId)
        from = boards.find((b) => b.id === activeWorkspaceId)
      }

      const workspaceId = target?.id ?? activeWorkspaceId
      // Publish first: a viewer acts once its focused recording matches.
      focusMoment(moment)
      if (workspaceId !== activeWorkspaceId) {
        setActiveWorkspaceId(workspaceId)
        const backTo = activeWorkspaceId
        pushToast({
          message: openedElsewhereMessage(moment.offsetMs, target?.name ?? 'another board'),
          tone: 'success',
          icon: AudioLines,
          key: 'moment-opened',
          action: { label: from?.name ? `Back to ${from.name}` : 'Back to your board', onClick: () => setActiveWorkspaceId(backTo) },
        })
      }
      await focusRecording(workspaceId, moment.recordingId)
      return 'shown'
    },
    [activeWorkspaceId, activeLensTypes, manifests, utils, focusMoment, setActiveWorkspaceId, focusRecording, pushToast],
  )
}
