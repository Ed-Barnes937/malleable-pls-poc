import { Switch as SdkSwitch, SwitchThumb } from '@ui-sdk/react/switch'
import { cn } from './utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

/** On/off setting on UI SDK Switch: Space toggles, focus ring on keyboard focus. */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className,
}: SwitchProps) {
  return (
    <SdkSwitch
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      <SwitchThumb className="inline-block h-4 w-4 translate-x-0.5 transform rounded-full bg-surface-raised shadow-sm transition-transform data-checked:translate-x-4 motion-reduce:transition-none" />
    </SdkSwitch>
  )
}
