import { query, exec, persistDb } from '../db'
import type { Workspace, WorkspacePanel, WorkspaceScope } from '../types'

export function getWorkspaces(): Workspace[] {
  return query<Workspace>('SELECT * FROM workspaces ORDER BY created_at ASC')
}

export function getWorkspacePanels(workspaceId: string): WorkspacePanel[] {
  return query<WorkspacePanel>(
    'SELECT * FROM workspace_panels WHERE workspace_id = ? ORDER BY created_at ASC',
    [workspaceId]
  )
}

export function getWorkspaceScopes(workspaceId: string): WorkspaceScope[] {
  return query<WorkspaceScope>(
    'SELECT * FROM workspace_scopes WHERE workspace_id = ?',
    [workspaceId]
  )
}

export function addWorkspacePanel(
  workspaceId: string,
  lensType: string,
  slotName: string,
  config: string = '{}'
): void {
  const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const existing = query<{ grid_x: number; grid_y: number; grid_h: number }>(
    'SELECT grid_x, grid_y, grid_h FROM workspace_panels WHERE workspace_id = ?',
    [workspaceId]
  )
  const maxY = existing.reduce((max, p) => Math.max(max, p.grid_y + p.grid_h), 0)
  exec(
    'INSERT INTO workspace_panels (id, workspace_id, lens_type, slot_name, config, grid_x, grid_y, grid_w, grid_h, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 2, ?)',
    [id, workspaceId, lensType, slotName, config, maxY, new Date().toISOString()]
  )
  persistDb()
}

export function removeWorkspacePanel(panelId: string): void {
  exec('DELETE FROM workspace_panels WHERE id = ?', [panelId])
  persistDb()
}

export function replacePanelLens(panelId: string, newLensType: string): void {
  exec('UPDATE workspace_panels SET lens_type = ?, config = ? WHERE id = ?', [newLensType, '{}', panelId])
  persistDb()
}

export function updatePanelLayouts(
  layouts: { id: string; x: number; y: number; w: number; h: number }[]
): void {
  for (const l of layouts) {
    exec(
      'UPDATE workspace_panels SET grid_x = ?, grid_y = ?, grid_w = ?, grid_h = ? WHERE id = ?',
      [l.x, l.y, l.w, l.h, l.id]
    )
  }
  persistDb()
}

export function setWorkspaceScope(
  workspaceId: string,
  scopeType: string,
  scopeValue: string | null
): void {
  exec('DELETE FROM workspace_scopes WHERE workspace_id = ? AND scope_type = ?', [workspaceId, scopeType])
  if (scopeValue) {
    const id = `ws-scope-${Date.now()}-${scopeType}`
    exec(
      'INSERT INTO workspace_scopes (id, workspace_id, scope_type, scope_value) VALUES (?, ?, ?, ?)',
      [id, workspaceId, scopeType, scopeValue]
    )
  }
  persistDb()
}
