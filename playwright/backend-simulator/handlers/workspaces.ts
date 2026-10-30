import { SimulatorError, type ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import type { BoardScope } from '@pls/substrate'
import { readBoardScope, writeBoardScope } from './lectures'

/** Mirrors `COURSE_LABELS` on the server. */
const COURSE_LABELS = new Set(['biology', 'chemistry', 'physics'])

export function registerWorkspacesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('workspaces.list', () => {
    return db.workspaces
  })

  // As the server: tab order, each board's widget types oldest first.
  router.register('workspaces.summary', () => {
    return [...db.workspaces]
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((w) => ({
        id: w.id,
        name: w.name,
        sort_order: w.sort_order,
        lens_types: db.workspacePanels
          .filter((p) => p.workspace_id === w.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          .map((p) => p.lens_type),
      }))
  })

  router.register('workspaces.panels', (input) => {
    const workspaceId = input as string
    return db.workspacePanels.filter((p) => p.workspace_id === workspaceId)
  })

  router.register('workspaces.create', (input) => {
    const { name, courseTag } = input as { name: string; courseTag?: string }
    if (courseTag && !COURSE_LABELS.has(courseTag)) throw new SimulatorError('BAD_REQUEST', 'Unknown course')
    const ws = {
      id: `ws-${crypto.randomUUID().slice(0, 8)}`,
      name,
      owner_id: 'dev-user-1',
      created_at: new Date().toISOString(),
      background_type: 'none',
      background_value: '',
      sort_order: db.workspaces.length,
    }
    db.workspaces.push(ws)
    if (courseTag) {
      db.workspaceScopes.push({
        id: `ws-scope-${crypto.randomUUID().slice(0, 8)}`,
        workspace_id: ws.id,
        scope_type: 'tag',
        scope_value: courseTag,
      })
    }
    return ws
  })

  router.register('workspaces.delete', (input) => {
    const id = input as string
    const idx = db.workspaces.findIndex((w) => w.id === id)
    if (idx >= 0) db.workspaces.splice(idx, 1)
    db.workspacePanels = db.workspacePanels.filter((p) => p.workspace_id !== id)
    db.workspaceScopes = db.workspaceScopes.filter((s) => s.workspace_id !== id)
  })

  router.register('workspaces.addPanel', (input) => {
    const { workspaceId, lensType, slotName, config, pos_x, pos_y, width, height, z_index } = input as {
      workspaceId: string; lensType: string; slotName: string; config?: Record<string, unknown>
      pos_x?: number; pos_y?: number; width?: number; height?: number; z_index?: number
    }
    requireBoard(db, workspaceId)
    const panel = {
      id: `wp-${crypto.randomUUID().slice(0, 8)}`,
      workspace_id: workspaceId,
      lens_type: lensType,
      slot_name: slotName,
      config: config ?? {},
      pos_x: pos_x ?? 0,
      pos_y: pos_y ?? 0,
      width: width ?? 280,
      height: height ?? 220,
      z_index: z_index ?? 0,
      created_at: new Date().toISOString(),
    }
    db.workspacePanels.push(panel)
    return panel
  })

  router.register('workspaces.removePanel', (input) => {
    const id = input as string
    const idx = db.workspacePanels.findIndex((p) => p.id === id)
    if (idx >= 0) db.workspacePanels.splice(idx, 1)
  })

  router.register('workspaces.updateLayouts', (input) => {
    const layouts = input as Array<{
      id: string; pos_x: number; pos_y: number; width: number; height: number; z_index: number
    }>
    for (const item of layouts) {
      const panel = db.workspacePanels.find((p) => p.id === item.id)
      if (panel) {
        panel.pos_x = item.pos_x
        panel.pos_y = item.pos_y
        panel.width = item.width
        panel.height = item.height
        panel.z_index = item.z_index
      }
    }
  })

  router.register('workspaces.updateBackground', (input) => {
    const { workspaceId, backgroundType, backgroundValue } = input as {
      workspaceId: string; backgroundType: string; backgroundValue: string
    }
    const ws = requireBoard(db, workspaceId)
    ws.background_type = backgroundType
    ws.background_value = backgroundValue
    return ws
  })

  router.register('workspaces.scopes', (input) => {
    const workspaceId = input as string
    // Ordered by type, as on the server.
    return db.workspaceScopes
      .filter((s) => s.workspace_id === workspaceId)
      .sort((a, b) => (a.scope_type < b.scope_type ? -1 : a.scope_type > b.scope_type ? 1 : 0))
  })

  // The one scope write, as on the server (see `writeBoardScope`).
  router.register('workspaces.setBoardScope', (input) => {
    const { workspaceId, ...patch } = input as { workspaceId: string; courseTag?: string | null; lectureId?: string | null }
    if (patch.courseTag != null && !COURSE_LABELS.has(patch.courseTag)) throw new SimulatorError('BAD_REQUEST', 'Unknown course')
    return writeBoardScope(db, workspaceId, patch)
  })

  /** Twin of the server's `restoreBoardScope`: Undo, only while the board shows what the change left. */
  router.register('workspaces.restoreBoardScope', (input) => {
    const { workspaceId, to, ifBoardShows } = input as { workspaceId: string; to: BoardScope; ifBoardShows: BoardScope }
    requireBoard(db, workspaceId)
    const current = readBoardScope(db, workspaceId)
    if (current.courseTag !== ifBoardShows.courseTag || current.lectureId !== ifBoardShows.lectureId) {
      return { restored: false, scope: current }
    }
    const lectureThere = !!to.lectureId && db.lectures.some((l) => l.id === to.lectureId)
    const patch = lectureThere ? { lectureId: to.lectureId } : { courseTag: to.courseTag, lectureId: null }
    return { restored: true, scope: writeBoardScope(db, workspaceId, patch) }
  })
}

/** Mirrors the server's requireOwnBoard: a write naming a board that is gone is NOT_FOUND. */
export function requireBoard(db: InMemoryDb, workspaceId: string) {
  const ws = db.workspaces.find((w) => w.id === workspaceId)
  if (!ws) throw new SimulatorError('NOT_FOUND', 'Board not found')
  return ws
}
