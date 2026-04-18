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
      onClick={toggle}
      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  )
}
