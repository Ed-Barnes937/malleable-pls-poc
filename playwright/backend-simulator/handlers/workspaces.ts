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
    const { workspaceId, lensType, slotName, config } = input as {
      workspaceId: string; lensType: string; slotName: string; config?: string
    }
    const panel = {
      id: `wp-${crypto.randomUUID().slice(0, 8)}`,
      workspace_id: workspaceId,
      lens_type: lensType,
      slot_name: slotName,
      config: config ?? '{}',
      grid_x: 0,
      grid_y: 0,
      grid_w: 1,
      grid_h: 2,
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
    const { layouts } = input as {
      workspaceId: string
      layouts: Array<{ id: string; x: number; y: number; w: number; h: number }>
    }
    for (const item of layouts) {
      const panel = db.workspacePanels.find((p) => p.id === item.id)
      if (panel) {
        panel.grid_x = item.x
        panel.grid_y = item.y
        panel.grid_w = item.w
        panel.grid_h = item.h
      }
    }
  })

  router.register('workspaces.scopes', (input) => {
    const workspaceId = input as string
    return db.workspaceScopes.filter((s) => s.workspace_id === workspaceId)
  })

  router.register('workspaces.setScope', (input) => {
    const { workspaceId, scopeType, scopeValue } = input as {
      workspaceId: string; scopeType: string; scopeValue: string | null
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
