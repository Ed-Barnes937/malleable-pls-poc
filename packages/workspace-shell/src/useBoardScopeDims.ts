import { useMemo } from 'react'
import { useWorkspacePanels } from '@pls/substrate-client'
import { useManifests, activeScopeDims, type PanelManifest, type ScopeDim } from '@pls/lens-framework'

/**
 * Scope dimensions used by at least one widget on the board, per each
 * manifest's `scope` declaration. Drives which scope pickers the drawer
 * offers and which parts of the TopBar chip are shown.
 */
export function useBoardScopeDims(workspaceId: string | null): Set<ScopeDim> {
  const { data: panels } = useWorkspacePanels(workspaceId)
  const manifests = useManifests()
  return useMemo(() => {
    const onBoard = (panels ?? [])
      .map((p) => manifests.find((m) => m.id === p.lens_type))
      .filter((m): m is PanelManifest => m !== undefined)
    return activeScopeDims(onBoard)
  }, [panels, manifests])
}
