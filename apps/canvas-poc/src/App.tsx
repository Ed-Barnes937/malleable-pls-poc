import { useTheme } from './useTheme'
import { ThemeToggle } from './ThemeToggle'

export function App() {
  const { theme, toggle } = useTheme('dark')

  return (
    <div className="flex h-dvh flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h1 className="text-sm font-semibold text-text-primary">Canvas POC</h1>
        <ThemeToggle theme={theme} onToggle={toggle} />
      </header>

      {/* Canvas area — full viewport minus header, with padding for breathing room */}
      <main
        className="flex-1 p-6"
        style={{
          background: 'var(--color-surface)',
          transition: 'var(--transition-panel)',
        }}
      >
        {/* Empty canvas — panels will go here in future tasks */}
        <div
          className="h-full w-full rounded-[var(--radius-panel)] border border-border-subtle bg-surface-raised"
          style={{
            boxShadow: 'var(--shadow-panel)',
            transition: 'var(--transition-panel)',
          }}
        />
      </main>
    </div>
  )
}
