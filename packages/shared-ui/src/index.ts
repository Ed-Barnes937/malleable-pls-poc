export { cn, formatTime, fromMomentLabel } from './utils'
export { useArrivals } from './useArrivals'
export { BOARD_VIEW_GAP, boardScrollFor, prefersReducedMotion, showOnBoard, userScrolledSince, watchUserScroll, type Span } from './board-view'
export { useNarrowScreen } from './useNarrowScreen'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { ProgressBar, type ProgressBarProps } from './ProgressBar'
export { TagPill, TAG_STYLES, leadingTag } from './TagPill'
export { Badge, type BadgeProps } from './Badge'
export { Spinner, type SpinnerProps } from './Spinner'
export { StatusDot, type StatusDotProps, type StatusDotStatus } from './StatusDot'
export { IconButton, type IconButtonProps } from './IconButton'
export { SectionLabel, type SectionLabelProps } from './SectionLabel'
export { Switch, type SwitchProps } from './Switch'
// K1c form controls
export { Checkbox, type CheckboxProps } from './Checkbox'
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl'
export { Tabs, TabsList, TabsTab, TabsPanel, type TabsListProps } from './Tabs'
export { TimeInput, type TimeInputProps } from './TimeInput'
export { DatePicker, type DatePickerProps } from './DatePicker'
// end K1c form controls
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

// Colour scheme (K1b)
export { colorScheme, followTheme, resolvedTheme, useColorScheme, type Theme, type ThemeChoice } from './theme'

// Toast (K1b)
export { ToastBar, createToaster, type ToastBarProps, type Toaster, type ToastData } from './Toast'

// Overlays on UI SDK (K1a). Lenses import these, never @ui-sdk/react.
export { AlertDialog, useConfirm, type AlertDialogProps, type ConfirmRequest } from './AlertDialog'
export { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger, createPopoverController, type PopoverContentProps, type PopoverController, type PopoverProps } from './Popover'
export { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger, createMenuController, type MenuController, type MenuProps } from './Menu'
export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger, createDrawerController, type DrawerController, type DrawerProps } from './Drawer'
export { Tooltip, TooltipContent, TooltipTrigger, type TooltipProps } from './Tooltip'
