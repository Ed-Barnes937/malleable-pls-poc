/**
 * Test wrapper components for Playwright CT tests.
 *
 * Playwright CT serialises props across a worker boundary, so raw function-
 * component references (e.g. `icon={StarIcon}`) cannot be passed as props.
 * These thin wrappers embed the icon internally so the tests only need to
 * supply primitive/serialisable props.
 */

import { PanelChrome, type PanelChromeProps } from './PanelChrome'

function StarIcon(props: { className?: string }) {
  return <span {...props}>★</span>
}

/** PanelChrome with a custom icon baked in */
export function PanelChromeWithIcon(
  props: Omit<PanelChromeProps, 'icon'>,
) {
  return <PanelChrome icon={StarIcon} {...props} />
}
