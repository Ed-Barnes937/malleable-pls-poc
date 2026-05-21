import { useEffect } from 'react'
import { useTheme } from './useTheme'
import { ThemeToggle } from './ThemeToggle'
import { CanvasEngine } from './CanvasEngine'
import { useCanvasStore } from './canvas-store'
import { SAMPLE_PANELS } from './sample-panels'

export function App() {
  const { theme, toggle } = useTheme('dark')
  const addPanel = useCanvasStore((s) => s.addPanel)
  const panelCount = useCanvasStore((s) => s.panels.length)

  // Seed sample panels on first mount
  useEffect(() => {
    if (panelCount === 0) {
      for (const panel of SAMPLE_PANELS) {
        addPanel(panel)
      }
    }
  }, [panelCount, addPanel])

  return (
    <div className="flex h-dvh flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h1 className="text-sm font-semibold text-text-primary">Canvas POC</h1>
        <ThemeToggle theme={theme} onToggle={toggle} />
      </header>

      {/* Canvas area — full viewport minus header */}
      <main
        className="relative flex-1 overflow-hidden p-6"
        style={{
          background: 'var(--color-surface)',
          transition: 'var(--transition-panel)',
        }}
      >
        <div
          className="h-full w-full rounded-[var(--radius-panel)] border border-border-subtle bg-surface-raised"
          style={{
            boxShadow: 'var(--shadow-panel)',
            transition: 'var(--transition-panel)',
          }}
        >
          <CanvasEngine />
        </div>
      </main>
    </div>
  )
}
