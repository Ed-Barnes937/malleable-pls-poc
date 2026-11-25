import type { ComponentProps } from 'react'
import {
  Tabs as SdkTabs,
  TabsList as SdkTabsList,
  TabsPanel as SdkTabsPanel,
  TabsTab as SdkTabsTab,
} from '@ui-sdk/react/tabs'
import { cn } from './utils'

/** Switch between related panels, on UI SDK Tabs. Compose Tabs > TabsList > TabsTab, then a TabsPanel per tab. */
export function Tabs({ className, ...rest }: ComponentProps<typeof SdkTabs>) {
  return <SdkTabs className={cn('flex flex-col gap-3', className)} {...rest} />
}

export interface TabsListProps extends Omit<ComponentProps<typeof SdkTabsList>, 'aria-label'> {
  /** Accessible name for the tab list. */
  label: string
}

export function TabsList({ label, className, ...rest }: TabsListProps) {
  return (
    <SdkTabsList
      aria-label={label}
      className={cn('flex gap-1 border-b border-border-subtle', className)}
      {...rest}
    />
  )
}

export function TabsTab({ className, ...rest }: ComponentProps<typeof SdkTabsTab>) {
  return (
    <SdkTabsTab
      className={cn(
        '-mb-px inline-flex h-9 cursor-pointer items-center border-b-2 border-transparent px-3 text-body text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent data-selected:border-accent data-selected:text-text-primary data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}

export function TabsPanel({ className, ...rest }: ComponentProps<typeof SdkTabsPanel>) {
  return <SdkTabsPanel className={cn('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', className)} {...rest} />
}
