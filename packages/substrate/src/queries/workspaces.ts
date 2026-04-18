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
  exec(
    'INSERT INTO workspace_panels (id, workspace_id, lens_type, slot_name, config, col_span, row_span, created_at) VALUES (?, ?, ?, ?, ?, 1, 2, ?)',
    [id, workspaceId, lensType, slotName, config, new Date().toISOString()]
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

export function updatePanelSpan(panelId: string, colSpan: number, rowSpan: number): void {
  exec('UPDATE workspace_panels SET col_span = ?, row_span = ? WHERE id = ?', [colSpan, rowSpan, panelId])
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
