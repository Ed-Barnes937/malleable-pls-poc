import { useEffect, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'
import { colorScheme, followTheme, useColorScheme } from '@pls/shared-ui'

export function ThemeToggle() {
  const { theme } = useColorScheme()

  useEffect(() => followTheme(), [])

  // Picks the opposite of what is showing, so it also works from "system".
  const toggle = useCallback(() => {
    colorScheme.set(colorScheme.get().resolved === 'dark' ? 'light' : 'dark')
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
