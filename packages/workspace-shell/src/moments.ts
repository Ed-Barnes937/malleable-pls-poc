import { useCallback } from 'react'
import { AudioLines, ChevronLeft } from 'lucide-react'
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
  /** It has a moment viewer set up for reviewing (not a Transcript in capture mode). */
  reviewViewer?: boolean
}

type ManifestFlags = Pick<PanelManifest, 'id' | 'showsMoments'>

/** Whether any of `lensTypes` is a widget that can show a recording moment. */
export function hasMomentViewer(lensTypes: string[], manifests: ManifestFlags[]): boolean {
  return lensTypes.some((type) => manifests.find((m) => m.id === type)?.showsMoments === true)
}

/**
 * Whether any of `panels` is a moment viewer set up for reviewing: a
 * Transcript in capture mode is for marking a lecture as it happens, so a
 * moment to revisit goes to one in review mode (the default) first.
 */
export function hasReviewViewer(
  panels: { lens_type: string; config?: Record<string, unknown> | null }[],
  manifests: ManifestFlags[],
): boolean {
  return panels.some((p) => hasMomentViewer([p.lens_type], manifests) && p.config?.mode !== 'capture')
}

/**
 * The board to open a moment on, among boards with a moment viewer: one set
 * up for reviewing first, then any; within each, one already focused on the
 * recording first, then board (tab) order.
 */
export function chooseMomentBoard(
  boards: MomentBoardCandidate[],
  manifests: ManifestFlags[],
  recordingId: string,
): string | undefined {
  const viewers = boards.filter((b) => hasMomentViewer(b.lensTypes, manifests))
  const rank = (b: MomentBoardCandidate) => (b.reviewViewer ? 0 : 2) + (b.recordingId === recordingId ? 0 : 1)
  // Stable: ties keep board order.
  return [...viewers].sort((a, b) => rank(a) - rank(b))[0]?.id
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
            const [rawPanels, scopes] = await Promise.all([
              utils.workspaces.panels.fetch(ws.id),
              utils.workspaces.scopes.fetch(ws.id),
            ])
            const panels = rawPanels as unknown as { lens_type: string; config?: Record<string, unknown> | null }[]
            return {
              id: ws.id,
              name: ws.name,
              lensTypes: panels.map((p) => p.lens_type),
              reviewViewer: hasReviewViewer(panels, manifests),
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
      const switching = workspaceId !== activeWorkspaceId
      // Publish first: a viewer acts once its focused recording matches. On
      // another board, focus goes to the moment too (the widget that asked
      // is no longer on screen).
      focusMoment(moment, { takeFocus: switching })
      if (switching) {
        setActiveWorkspaceId(workspaceId)
        const backTo = activeWorkspaceId
        pushToast({
          message: openedElsewhereMessage(moment.offsetMs, target?.name ?? 'another board'),
          tone: 'success',
          icon: AudioLines,
          key: 'moment-opened',
          // Stays while the student is on that board, so the way back is
          // there whenever they reach it (keyboard included).
          durationMs: null,
          board: workspaceId,
          action: {
            label: from?.name ? `Back to ${from.name}` : 'Back to your board',
            icon: ChevronLeft,
            onClick: () => setActiveWorkspaceId(backTo),
          },
        })
      }
      await focusRecording(workspaceId, moment.recordingId)
      return 'shown'
    },
    [activeWorkspaceId, activeLensTypes, manifests, utils, focusMoment, setActiveWorkspaceId, focusRecording, pushToast],
  )
}
