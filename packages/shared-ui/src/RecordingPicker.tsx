import { ChevronDown } from 'lucide-react'

export interface RecordingPickerOption {
  id: string
  title: string
}

export interface RecordingPickerProps {
  value: string | undefined
  recordings: RecordingPickerOption[] | undefined
  onChange: (id: string | undefined) => void
  /** Label for the empty option, e.g. "(none)" or "Start new". */
  emptyLabel?: string
  className?: string
  'data-testid'?: string
}

export function RecordingPicker({
  value,
  recordings,
  onChange,
  emptyLabel = '(none)',
  className,
  ...rest
}: RecordingPickerProps) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        data-testid={rest['data-testid'] ?? 'recording-picker'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full appearance-none cursor-pointer rounded-md border border-border-subtle bg-surface px-2.5 py-1 pr-7 text-xs text-neutral-300 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
      >
        <option value="">{emptyLabel}</option>
        {recordings?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
    </div>
  )
}
