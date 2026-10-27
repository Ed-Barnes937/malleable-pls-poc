import { useCallback } from 'react'
import type { Moment, PanelManifest, ShowMomentOptions, ShowMomentResult } from '@pls/lens-framework'
import { trpc, decodeScope, useSetWorkspaceScope, SCOPE_TYPE_BY_DIM } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'

/** What `chooseMomentBoard` needs to know about each board. */
export interface MomentBoardCandidate {
  id: string
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

/**
 * The shell side of `LensProps.onShowMoment`: focus the moment's recording on
 * a board and publish the moment to widgets that declare `showsMoments` (they
 * read it as `LensProps.focusedMoment`, scroll to it and highlight it).
 *
 * Shown on the active board by default; with `elsewhere`, switches to the
 * best board that has a moment viewer.
 */
export function useShowMoment(
  activeWorkspaceId: string,
  activeLensTypes: string[],
  manifests: PanelManifest[],
): (moment: Moment, options?: ShowMomentOptions) => Promise<ShowMomentResult> {
  const utils = trpc.useUtils()
  const { mutateAsync: setScope } = useSetWorkspaceScope()
  const focusMoment = useWorkspaceStore((s) => s.focusMoment)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)

  const focusRecording = useCallback(
    (workspaceId: string, recordingId: string) =>
      setScope({ workspaceId, scopeType: SCOPE_TYPE_BY_DIM.recordingId, scopeValue: recordingId }),
    [setScope],
  )

  return useCallback(
    async (moment: Moment, options?: ShowMomentOptions): Promise<ShowMomentResult> => {
      let workspaceId = activeWorkspaceId
      if (options?.elsewhere) {
        const workspaces = (await utils.workspaces.list.fetch()) as unknown as { id: string }[]
        const boards = await Promise.all(
          workspaces.map(async (ws): Promise<MomentBoardCandidate> => {
            const [panels, scopes] = await Promise.all([
              utils.workspaces.panels.fetch(ws.id),
              utils.workspaces.scopes.fetch(ws.id),
            ])
            return {
              id: ws.id,
              lensTypes: (panels as unknown as { lens_type: string }[]).map((p) => p.lens_type),
              recordingId: decodeScope(scopes as unknown as { scope_type: string; scope_value: string }[]).recordingId,
            }
          }),
        )
        const target = chooseMomentBoard(boards, manifests, moment.recordingId)
        if (!target) {
          await focusRecording(activeWorkspaceId, moment.recordingId)
          return 'no-viewer'
        }
        workspaceId = target
      } else if (!hasMomentViewer(activeLensTypes, manifests)) {
        await focusRecording(activeWorkspaceId, moment.recordingId)
        return 'no-viewer'
      }

      // Publish first: a viewer acts once its focused recording matches.
      focusMoment(moment)
      if (workspaceId !== activeWorkspaceId) setActiveWorkspaceId(workspaceId)
      await focusRecording(workspaceId, moment.recordingId)
      return 'shown'
    },
    [activeWorkspaceId, activeLensTypes, manifests, utils, focusMoment, setActiveWorkspaceId, focusRecording],
  )
}
