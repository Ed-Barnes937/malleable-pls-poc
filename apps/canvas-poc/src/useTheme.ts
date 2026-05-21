import { useState, useCallback, useEffect } from 'react'

export type Theme = 'dark' | 'light'

export function useTheme(initial: Theme = 'dark') {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle } as const
}
