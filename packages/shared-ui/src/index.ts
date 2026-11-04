export { cn, formatTime, fromMomentLabel } from './utils'
export { useArrivals } from './useArrivals'
export { BOARD_VIEW_GAP, boardScrollFor, prefersReducedMotion, showOnBoard, userScrolledSince, watchUserScroll, type Span } from './board-view'
export { useNarrowScreen } from './useNarrowScreen'
export { useFocusTrap } from './useFocusTrap'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { ProgressBar, type ProgressBarProps } from './ProgressBar'
export { TagPill, TAG_STYLES, leadingTag } from './TagPill'
export { Badge, type BadgeProps } from './Badge'
export { Spinner, type SpinnerProps } from './Spinner'
export { StatusDot, type StatusDotProps, type StatusDotStatus } from './StatusDot'
export { IconButton, type IconButtonProps } from './IconButton'
export { SectionLabel, type SectionLabelProps } from './SectionLabel'
export { Switch, type SwitchProps } from './Switch'
export { Dialog, type DialogProps } from './Dialog'
export { Select, type SelectProps } from './Select'
export { TextField, type TextFieldProps } from './TextField'
export { COURSES, COURSE_COLORS, COURSE_PILL_COLORS, COURSE_TONES, NEUTRAL_TONE, courseTone, type CourseTone } from './constants'
export { HiddenElsewhere, hiddenElsewhereCount, hiddenElsewhereParts, type HiddenElsewhereProps } from './HiddenElsewhere'
export {
  startOfLocalDay,
  daysFromToday,
  localDayKey,
  dayLabel,
  doByLabel,
  clockTime,
  dayAndTime,
  dayMonthAndTime,
  stillToDoLabel,
  formatDuration,
  isAllDay,
  dueEnd,
} from './plan-dates'
// PROTOTYPE p3 (flow audit feedback and motion): throwaway, never merged.
export { p3, p3Wants, p3Confirm, onP3Confirm, p3Batcher, p3MotionProps, p3Flash, useP3RegisterCalendar, useP3CalendarOnBoard, P3Switcher, P3_NAMES, type P3Variant, type P3Kind, type P3Confirmation } from './PROTOTYPE_p3'
