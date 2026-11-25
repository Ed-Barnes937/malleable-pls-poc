import { useEffect } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  colorScheme,
  followTheme,
  useColorScheme,
  type ThemeChoice,
} from '@pls/shared-ui'

const CHOICES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

/** The colour scheme menu: Light, Dark or System (follow the OS). The button shows what is chosen. */
export function ThemeToggle() {
  const { choice } = useColorScheme()

  useEffect(() => followTheme(), [])

  const Current = CHOICES.find((c) => c.value === choice)?.Icon ?? Monitor

  return (
    <Menu>
      <MenuTrigger
        aria-label="Theme"
        title="Theme"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
      >
        <Current className="h-[18px] w-[18px]" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent side="bottom" align="end">
        <MenuRadioGroup value={choice} onValueChange={(value) => colorScheme.set(value as ThemeChoice)} aria-label="Theme">
          {CHOICES.map(({ value, label, Icon }) => (
            <MenuRadioItem key={value} value={value}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
