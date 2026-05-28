import { Moon, Sun } from 'lucide-react'
import type { Theme } from './useTheme'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:border-border hover:text-text-primary"
      style={{ transition: 'var(--transition-panel)' }}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}
