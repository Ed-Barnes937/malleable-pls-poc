/**
 * Shared test helpers for UI SDK components. Import from tests only, never
 * from product code (`@ui-sdk/core/testing` is not meant for the app bundle):
 *
 *   import { checkPattern } from './testing'                 // inside shared-ui
 *   import { checkPattern } from '@pls/shared-ui/src/testing' // other packages
 *
 *   await checkPattern(screen.getByRole('dialog'), 'dialog')
 *
 * The jsdom stubs a popup needs (showPopover, hidePopover, getAnimations and
 * the `[popover]` style) live in the root `vitest.setup.ts`.
 */
export { checkPattern, settle, type Pattern } from '@ui-sdk/core/testing'
