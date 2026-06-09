import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerWorkspacesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('workspaces.list', () => {
    return db.workspaces
  })

  router.register('workspaces.panels', (input) => {
    const workspaceId = input as string
    return db.workspacePanels.filter((p) => p.workspace_id === workspaceId)
  })

  router.register('workspaces.create', (input) => {
    const { name } = input as { name: string }
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
    const ws = db.workspaces.find((w) => w.id === workspaceId)
    if (ws) {
      ws.background_type = backgroundType
      ws.background_value = backgroundValue
    }
    return ws
  })

  router.register('workspaces.scopes', (input) => {
    const workspaceId = input as string
    return db.workspaceScopes.filter((s) => s.workspace_id === workspaceId)
  })

  router.register('workspaces.setScope', (input) => {
    const { workspaceId, scopeType, scopeValue } = input as {
      workspaceId: string; scopeType: string; scopeValue: string | null
    }
    // Mirror server invariant: changing the course clears any focused recording.
    if (scopeType === 'tag') {
      db.workspaceScopes = db.workspaceScopes.filter(
        (s) => !(s.workspace_id === workspaceId && s.scope_type === 'recording'),
      )
    }
    const idx = db.workspaceScopes.findIndex(
      (s) => s.workspace_id === workspaceId && s.scope_type === scopeType,
    )
    if (scopeValue === null) {
      if (idx >= 0) db.workspaceScopes.splice(idx, 1)
      return
    }
    if (idx >= 0) {
      db.workspaceScopes[idx].scope_value = scopeValue
    } else {
      db.workspaceScopes.push({
        id: `ws-scope-${crypto.randomUUID().slice(0, 8)}`,
        workspace_id: workspaceId,
        scope_type: scopeType,
        scope_value: scopeValue,
      })
    }
  })
}
