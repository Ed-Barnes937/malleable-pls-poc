import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker as SdkDatePicker,
  DatePickerContent,
  DatePickerInput,
  DatePickerTrigger,
} from '@ui-sdk/react/date-picker'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './utils'

export interface DatePickerProps {
  /** An ISO date like "2026-11-25", or null while empty. */
  value: string | null
  onValueChange: (value: string | null) => void
  /** Accessible name for the date field. */
  label: string
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}

const NAV_BUTTON =
  'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-item text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-disabled:cursor-not-allowed data-disabled:opacity-40'

/**
 * Type a date in the page's language, or pick one from a calendar, on UI SDK
 * DatePicker. The value is an ISO date either way. The calendar opens on the
 * top layer and is fully keyboard driven (Alt+ArrowDown or Enter on the button
 * to open; arrows, PageUp/PageDown and Home/End to move; Enter to pick).
 */
export function DatePicker({
  value,
  onValueChange,
  label,
  min,
  max,
  disabled,
  className,
}: DatePickerProps) {
  return (
    <SdkDatePicker
      value={value}
      onValueChange={(next) => onValueChange(next as string | null)}
      min={min}
      max={max}
      disabled={disabled}
      className={cn('inline-flex items-center gap-1', className)}
    >
      <DatePickerInput
        aria-label={label}
        className="h-10 w-36 rounded-control border border-border bg-surface-raised px-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line data-invalid:border-confused data-disabled:cursor-not-allowed data-disabled:opacity-50"
      />
      <DatePickerTrigger
        aria-label={`Choose ${label.toLowerCase()} from calendar`}
        className={NAV_BUTTON}
      >
        <CalendarDays aria-hidden="true" className="h-4 w-4" />
      </DatePickerTrigger>
      <DatePickerContent
        aria-label={`${label} calendar`}
        className="m-0 rounded-widget border border-border-subtle bg-surface-raised p-3 text-text-primary shadow-pop"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <CalendarPrevious aria-label="Previous month" className={NAV_BUTTON}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </CalendarPrevious>
          <CalendarHeading className="text-title text-text-primary" />
          <CalendarNext aria-label="Next month" className={NAV_BUTTON}>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </CalendarNext>
        </div>
        <CalendarGrid className="border-separate border-spacing-0.5">
          <CalendarWeekdays>
            {(index) => <CalendarWeekday index={index} className="h-8 w-9 text-center text-meta font-normal text-text-muted" />}
          </CalendarWeekdays>
          <CalendarWeeks>
            {(cell) => (
              <CalendarDay
                value={cell.date}
                className="h-9 w-9 cursor-pointer rounded-item text-center text-body text-text-primary hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-disabled:cursor-not-allowed data-disabled:opacity-40 data-outside:text-text-muted data-today:border data-today:border-accent-line data-selected:bg-accent data-selected:text-accent-foreground data-selected:hover:bg-accent"
              />
            )}
          </CalendarWeeks>
        </CalendarGrid>
      </DatePickerContent>
    </SdkDatePicker>
  )
}
