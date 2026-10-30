import { useCallback } from 'react'
import { AudioLines, ChevronLeft } from 'lucide-react'
import type { Moment, PanelManifest, ShowMomentResult } from '@pls/lens-framework'
import { COURSES, formatTime } from '@pls/shared-ui'
import { trpc, decodeScope, useSetBoardScope } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { useToastStore } from './toast'

/** What `chooseMomentBoard` needs to know about each board. */
export interface MomentBoardCandidate {
  id: string
  name?: string
  lensTypes: string[]
  /** The board's selected lecture. */
  lectureId?: string
  /** It has a moment viewer set up for reviewing (not a Transcript in capture mode). */
  reviewViewer?: boolean
}

type ManifestFlags = Pick<PanelManifest, 'id' | 'showsMoments'>

/** Whether any of `lensTypes` is a widget that can show a scheduled block (e.g. the Calendar). */
export function hasPlanItemViewer(lensTypes: string[], manifests: Pick<PanelManifest, 'id' | 'showsPlanItems'>[]): boolean {
  return lensTypes.some((type) => manifests.find((m) => m.id === type)?.showsPlanItems === true)
}

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
 * up for reviewing first, then any; within each, one already showing the
 * moment's lecture first, then board (tab) order.
 */
export function chooseMomentBoard(
  boards: MomentBoardCandidate[],
  manifests: ManifestFlags[],
  lectureId: string | undefined,
): string | undefined {
  const viewers = boards.filter((b) => hasMomentViewer(b.lensTypes, manifests))
  const rank = (b: MomentBoardCandidate) =>
    (b.reviewViewer ? 0 : 2) + (lectureId !== undefined && b.lectureId === lectureId ? 0 : 1)
  // Stable: ties keep board order.
  return [...viewers].sort((a, b) => rank(a) - rank(b))[0]?.id
}

/**
 * "Opened 1:18 in In Lecture": the toast after a moment opened on another
 * board, or, by the lecture's title, in another lecture on this board.
 */
export function openedElsewhereMessage(offsetMs: number, boardName: string): string {
  return `Opened ${formatTime(offsetMs)} in ${boardName}`
}

/** "Biology", or "All courses" for none: the course a board goes back to. */
function courseName(course: string | null): string {
  return course ? (COURSES.find((c) => c.value === course)?.label ?? course) : 'All courses'
}

/**
 * The shell side of `LensProps.onShowMoment`: select the moment's lecture on
 * a board (in one `setBoardScope`, so the board course becomes the lecture's
 * course) and publish the moment to widgets that declare `showsMoments`
 * (they read it as `LensProps.focusedMoment`, scroll to it and highlight it).
 *
 * Shown on the active board when it has a moment viewer. Otherwise it
 * switches to the best board that has one (see `chooseMomentBoard`) and says
 * so in a toast that offers the way back. Showing a moment from another
 * lecture than the board showed changes the board's lecture, and with it
 * maybe its course (a Chemistry moment on a Biology board makes it a
 * Chemistry board), so that says so too, with a way back to what it showed.
 */
export function useShowMoment(
  activeWorkspaceId: string | null,
  activeLensTypes: string[],
  manifests: PanelManifest[],
): (moment: Moment) => Promise<ShowMomentResult> {
  const utils = trpc.useUtils()
  const { mutateAsync: setBoardScope } = useSetBoardScope()
  const focusMoment = useWorkspaceStore((s) => s.focusMoment)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const pushToast = useToastStore((s) => s.push)

  const scopeShown = useCallback(
    async (workspaceId: string) => {
      const scopes = await utils.workspaces.scopes.fetch(workspaceId)
      return decodeScope(scopes as unknown as { scope_type: string; scope_value: string }[])
    },
    [utils],
  )
  /** A lecture's title, or undefined if it can't be read just now (the toast still says what happened). */
  const lectureTitle = useCallback(
    (lectureId: string) => utils.lectures.byId.fetch(lectureId).then((l) => l?.title, () => undefined),
    [utils],
  )

  return useCallback(
    async (moment: Moment): Promise<ShowMomentResult> => {
      // Moments are shown from a widget, so there is always a board; this is for the types.
      if (!activeWorkspaceId) return 'no-viewer'
      // The lecture the moment's recording belongs to: what the board selects.
      const recording = await utils.recordings.byId.fetch(moment.recordingId).catch(() => null)
      const lectureId = (recording?.lecture_id as string | undefined) ?? undefined
      const lectureCourse = (recording?.course as string | null | undefined) ?? null
      const selectLecture = async (workspaceId: string) => {
        if (lectureId) await setBoardScope({ workspaceId, lectureId })
      }

      let target: MomentBoardCandidate | undefined
      let from: MomentBoardCandidate | undefined
      if (!hasMomentViewer(activeLensTypes, manifests)) {
        const workspaces = (await utils.workspaces.list.fetch()) as unknown as { id: string; name: string }[]
        const boards = await Promise.all(
          workspaces.map(async (ws): Promise<MomentBoardCandidate> => {
            const [rawPanels, scope] = await Promise.all([
              utils.workspaces.panels.fetch(ws.id),
              scopeShown(ws.id),
            ])
            const panels = rawPanels as unknown as { lens_type: string; config?: Record<string, unknown> | null }[]
            return {
              id: ws.id,
              name: ws.name,
              lensTypes: panels.map((p) => p.lens_type),
              reviewViewer: hasReviewViewer(panels, manifests),
              lectureId: scope.lectureId,
            }
          }),
        )
        const targetId = chooseMomentBoard(boards, manifests, lectureId)
        if (!targetId) {
          await selectLecture(activeWorkspaceId)
          return 'no-viewer'
        }
        target = boards.find((b) => b.id === targetId)
        from = boards.find((b) => b.id === activeWorkspaceId)
      }

      const workspaceId = target?.id ?? activeWorkspaceId
      const switching = workspaceId !== activeWorkspaceId
      // On this board, what it was showing, for the way back.
      const previous = switching ? undefined : await scopeShown(workspaceId)
      // Publish first: a viewer acts once its lecture holds the moment's
      // recording. On another board, focus goes to the moment too (the
      // widget that asked is no longer on screen).
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
      await selectLecture(workspaceId)
      if (!previous || !lectureId || previous.lectureId === lectureId) return 'shown'

      const leaving = previous.lectureId
      const course = previous.courseTag ?? null
      // Nothing to say when the board showed no lecture and keeps its course.
      if (!leaving && course === lectureCourse) return 'shown'
      // The board's lecture (and maybe its course) changed under the student,
      // e.g. a weak topic from another lecture: say so, and offer what it
      // showed. Going back to a lecture brings its course back with it.
      const [toTitle, fromTitle] = await Promise.all([
        lectureTitle(lectureId),
        leaving ? lectureTitle(leaving) : Promise.resolve(undefined),
      ])
      pushToast({
        message: openedElsewhereMessage(moment.offsetMs, toTitle ?? 'another lecture'),
        tone: 'success',
        icon: AudioLines,
        key: 'moment-opened',
        board: workspaceId,
        action: leaving
          ? {
              label: fromTitle ? `Back to ${fromTitle}` : 'Back to the last lecture',
              icon: ChevronLeft,
              onClick: () => void setBoardScope({ workspaceId, lectureId: leaving }),
            }
          : {
              label: `Back to ${courseName(course)}`,
              icon: ChevronLeft,
              onClick: () => void setBoardScope({ workspaceId, courseTag: course, lectureId: null }),
            },
      })
      return 'shown'
    },
    [activeWorkspaceId, activeLensTypes, manifests, utils, focusMoment, setActiveWorkspaceId, setBoardScope, pushToast, scopeShown, lectureTitle],
  )
}
