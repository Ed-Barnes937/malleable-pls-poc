/**
 * Test wrapper components for Playwright CT tests.
 *
 * Playwright CT serialises props across a worker boundary, so raw function-
 * component references (e.g. `icon={StarIcon}`) cannot be passed as props.
 * These thin wrappers embed the icon internally so the tests only need to
 * supply primitive/serialisable props.
 */

import { useState } from 'react'
import { PanelChrome, type PanelChromeProps } from './PanelChrome'
import { CanvasEngine } from './CanvasEngine'
import { useCanvasStore, type PanelItem } from './canvas-store'

function StarIcon(props: { className?: string }) {
  return <span {...props}>★</span>
}

/** PanelChrome with a custom icon baked in */
export function PanelChromeWithIcon(
  props: Omit<PanelChromeProps, 'icon'>,
) {
  return <PanelChrome icon={StarIcon} {...props} />
}

/**
 * A CanvasEngine on a fixed-size board, loaded with `panels`, for the
 * Playwright CT. `onLayoutChange` reaches the test (CT passes callbacks back).
 */
export function BoardHarness({ panels, width = 1000, height = 700, onLayoutChange }: {
  panels: PanelItem[]
  width?: number
  height?: number
  onLayoutChange?: (panels: PanelItem[]) => void
}) {
  // Load the panels before the first render, as the shell's panel sync does.
  useState(() => useCanvasStore.getState().setPanels(panels))
  return (
    <div style={{ width, height }}>
      <CanvasEngine onLayoutChange={onLayoutChange} />
    </div>
  )
}
