import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from './useTheme'
import { ThemeToggle } from './ThemeToggle'
import { CanvasEngine } from './CanvasEngine'
import { useCanvasStore, type PanelType } from './canvas-store'
import { SAMPLE_PANELS } from './sample-panels'
import { TopBar } from './TopBar'
import { DrawerSidebar, LENS_PALETTE } from './DrawerSidebar'
import { WorkspaceBackground } from './WorkspaceBackground'

/** Default dimensions for newly created panels */
const NEW_PANEL_WIDTH = 280
const NEW_PANEL_HEIGHT = 220

export function App() {
  const { theme, toggle } = useTheme('dark')
  const addPanel = useCanvasStore((s) => s.addPanel)
  const organizePanels = useCanvasStore((s) => s.organizePanels)
  const panelCount = useCanvasStore((s) => s.panels.length)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Seed sample panels on first mount
  useEffect(() => {
    if (panelCount === 0) {
      for (const panel of SAMPLE_PANELS) {
        addPanel(panel)
      }
    }
  }, [panelCount, addPanel])

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  /** Add button opens the drawer so the user can pick a panel type */
  const handleAddPanel = useCallback(() => {
    setDrawerOpen(true)
  }, [])

  const handleOrganize = useCallback(() => {
    const scrollEl = canvasRef.current?.querySelector('[data-canvas-scroll]')
    const width = scrollEl?.clientWidth ?? canvasRef.current?.clientWidth ?? 1200
    organizePanels(width)
  }, [organizePanels])

  /** Handle drop from lens palette onto canvas */
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-lens-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const lensType = e.dataTransfer.getData('application/x-lens-type') as PanelType
      const lensLabel = e.dataTransfer.getData('application/x-lens-label')
      if (!lensType) return

      e.preventDefault()

      // The drop target is the CanvasEngine scroll container itself
      const scrollEl = e.currentTarget as HTMLElement
      const rect = scrollEl.getBoundingClientRect()

      const rawDropX = e.clientX - rect.left + scrollEl.scrollLeft - NEW_PANEL_WIDTH / 2
      const rawDropY = e.clientY - rect.top + scrollEl.scrollTop - NEW_PANEL_HEIGHT / 2
      const dropX = Number.isFinite(rawDropX) ? Math.max(0, rawDropX) : 0
      const dropY = Number.isFinite(rawDropY) ? Math.max(0, rawDropY) : 0

      const panels = useCanvasStore.getState().panels
      const maxZ = panels.length > 0
        ? Math.max(...panels.map((p) => p.z_index))
        : 0

      addPanel({
        id: crypto.randomUUID(),
        pos_x: dropX,
        pos_y: dropY,
        width: NEW_PANEL_WIDTH,
        height: NEW_PANEL_HEIGHT,
        z_index: maxZ + 1,
        title: lensLabel || 'Untitled',
        type: lensType,
      })

      setDrawerOpen(true)
    },
    [addPanel],
  )

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <TopBar
        onMenuClick={handleToggleDrawer}
        onAddPanel={handleAddPanel}
        onOrganize={handleOrganize}
        trailing={<ThemeToggle theme={theme} onToggle={toggle} />}
      />

      {/* Drawer sidebar */}
      <DrawerSidebar open={drawerOpen} onClose={handleCloseDrawer} />

      {/* Canvas area — full viewport minus top bar */}
      <main
        className="relative flex-1 overflow-hidden p-6"
        style={{
          background: 'var(--color-surface)',
          transition: 'var(--transition-panel)',
        }}
      >
        <div
          ref={canvasRef}
          className="relative h-full w-full rounded-[var(--radius-panel)]"
          style={{
            background: 'var(--color-surface-raised)',
            boxShadow: 'var(--shadow-panel)',
            transition: 'var(--transition-panel)',
          }}
          data-testid="canvas-drop-zone"
        >
          <WorkspaceBackground />
          <CanvasEngine
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
          />
        </div>
      </main>
    </div>
  )
}
