import { useState, useEffect, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'dark' | 'light'

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('pls-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('pls-theme', theme)
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
