import { query, exec, persistDb } from '../db'
import type { Workspace, WorkspacePanel, WorkspaceScope } from '../types'

export function getWorkspaces(): Workspace[] {
  return query<Workspace>('SELECT * FROM workspaces ORDER BY sort_order ASC, created_at ASC, id ASC')
}

export function reorderWorkspaces(ids: string[]): void {
  for (let i = 0; i < ids.length; i++) {
    exec('UPDATE workspaces SET sort_order = ? WHERE id = ?', [i, ids[i]])
  }
  persistDb()
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
  config: string = '{}',
  pos_x: number = 0,
  pos_y: number = 0,
  width: number = 280,
  height: number = 220,
  z_index: number = 0,
): void {
  const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  exec(
    'INSERT INTO workspace_panels (id, workspace_id, lens_type, slot_name, config, pos_x, pos_y, width, height, z_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, workspaceId, lensType, slotName, config, pos_x, pos_y, width, height, z_index, new Date().toISOString()]
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
  layouts: { id: string; pos_x: number; pos_y: number; width: number; height: number; z_index: number }[]
): void {
  for (const l of layouts) {
    exec(
      'UPDATE workspace_panels SET pos_x = ?, pos_y = ?, width = ?, height = ?, z_index = ? WHERE id = ?',
      [l.pos_x, l.pos_y, l.width, l.height, l.z_index, l.id]
    )
  }
  persistDb()
}

export function updateWorkspaceBackground(
  workspaceId: string,
  backgroundType: string,
  backgroundValue: string
): void {
  exec(
    'UPDATE workspaces SET background_type = ?, background_value = ? WHERE id = ?',
    [backgroundType, backgroundValue, workspaceId]
  )
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
