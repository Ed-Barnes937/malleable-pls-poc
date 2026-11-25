import { useState, type KeyboardEvent } from 'react'
import {
  TimeInput as SdkTimeInput,
  createTimeInputController,
} from '@ui-sdk/react/time-input'
import { cn } from './utils'

export interface TimeInputProps {
  /** A 24-hour time like "14:30", or null while empty. */
  value: string | null
  onValueChange: (value: string | null) => void
  /** Accessible name for the group. */
  label: string
  /**
   * Minutes the minute segment moves by on ArrowUp / ArrowDown (default 1).
   * With 15, the minute lands on :00, :15, :30 or :45; typing and PageUp /
   * PageDown are unchanged.
   */
  step?: number
  /** `12` or `24`; defaults to the page language's clock. */
  hourCycle?: 12 | 24
  min?: string
  max?: string
  disabled?: boolean
  /** Shown and focusable, but takes no edits (not greyed out). */
  readOnly?: boolean
  /** Marks it wrong (`aria-invalid`), e.g. an end before its start. */
  invalid?: boolean
  /** Id of the message that says what is wrong (`aria-describedby`). */
  describedBy?: string
  className?: string
}

function stepMinute(time: string, step: number, direction: 1 | -1): string {
  const [hh, mm] = time.split(':')
  const minute = Number(mm)
  const next =
    direction === 1
      ? (Math.floor(minute / step) + 1) * step
      : (Math.ceil(minute / step) - 1) * step
  // Like the segment's own arrows: wrap inside the hour, leave the hour alone.
  const wrapped = ((next % 60) + 60) % 60
  return `${hh}:${String(wrapped).padStart(2, '0')}`
}

/** Type or step a time of day, on UI SDK TimeInput. */
export function TimeInput({
  value,
  onValueChange,
  label,
  step = 1,
  hourCycle,
  min,
  max,
  disabled,
  readOnly,
  invalid,
  describedBy,
  className,
}: TimeInputProps) {
  const [controller] = useState(() => createTimeInputController())
  const minuteStep = Number.isInteger(step) && step > 0 ? step : 1

  function onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
    if (minuteStep === 1 || readOnly || disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const segment = (event.target as HTMLElement).closest('[data-slot="time-input-segment"]')
    if (segment?.getAttribute('data-type') !== 'minute') return
    const current = controller.getValue()
    if (current === null) return
    event.preventDefault()
    event.stopPropagation()
    controller.setValue(stepMinute(current, minuteStep, event.key === 'ArrowUp' ? 1 : -1))
  }

  return (
    <span onKeyDownCapture={onKeyDownCapture} className={cn('inline-flex', className)}>
      <SdkTimeInput
        controller={controller}
        value={value}
        onValueChange={(next) => onValueChange(next)}
        aria-label={label}
        hourCycle={hourCycle}
        min={min}
        max={max}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'inline-flex h-10 w-full items-center rounded-control border border-border bg-surface-raised px-3 text-body text-text-primary focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-line data-invalid:border-confused aria-invalid:border-confused data-disabled:cursor-not-allowed data-disabled:opacity-50',
        )}
      />
    </span>
  )
}
