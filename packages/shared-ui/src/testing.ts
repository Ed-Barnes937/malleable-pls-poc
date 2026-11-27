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
import { act } from '@testing-library/react'
import { checkPattern as checkPatternOutsideReact, type Pattern } from '@ui-sdk/core/testing'

export { settle, type Pattern } from '@ui-sdk/core/testing'

/**
 * UI SDK's `checkPattern`, run inside React's `act`. The check presses keys
 * and clicks on the rendered component, and the state updates those cause
 * must land inside `act` (React logs a warning otherwise, which the console
 * guard in `vitest.setup.ts` turns into a failure).
 */
export async function checkPattern(root: Element, pattern: Pattern): Promise<void> {
  await act(() => checkPatternOutsideReact(root, pattern))
}
