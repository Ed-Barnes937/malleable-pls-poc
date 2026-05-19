/**
 * Test wrapper components for Playwright CT tests.
 *
 * Playwright CT serialises props across a worker boundary, so raw function-
 * component references (e.g. `icon={TestIcon}`) cannot be passed as props.
 * These thin wrappers embed the icon internally so the tests only need to
 * supply primitive/serialisable props.
 */

import { IconButton, type IconButtonProps } from './IconButton'
import { Badge, type BadgeProps } from './Badge'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import type { ReactNode } from 'react'

/* Shared test icon */
function StarIcon(props: { className?: string }) {
  return <span {...props}>★</span>
}

/* ---- IconButton with built-in icon ---- */
export function IconButtonWithIcon(
  props: Omit<IconButtonProps, 'icon'> & { label: string },
) {
  return <IconButton icon={StarIcon} {...props} />
}

/* ---- Badge with built-in icon ---- */
export function BadgeWithIcon(
  props: Omit<BadgeProps, 'icon'> & { children: ReactNode },
) {
  return <Badge icon={StarIcon} {...props} />
}

/* ---- EmptyState with built-in icon ---- */
export function EmptyStateWithIcon(
  props: Omit<EmptyStateProps, 'icon'>,
) {
  return <EmptyState icon={StarIcon} {...props} />
}

/* ---- EmptyState with action ---- */
export function EmptyStateWithAction(
  props: Omit<EmptyStateProps, 'action'> & { actionLabel: string },
) {
  return (
    <EmptyState
      {...props}
      action={<button type="button" data-testid="action-btn">{props.actionLabel}</button>}
    />
  )
}
