/**
 * Test wrapper components for Playwright CT tests.
 *
 * Playwright CT serialises props across a worker boundary, so raw function-
 * component references (e.g. `icon={StarIcon}`) cannot be passed as props.
 * These thin wrappers embed the icon internally so the tests only need to
 * supply primitive/serialisable props.
 */

import { useLayoutEffect } from 'react'
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
 * A canvas of `width` x `height` showing `panels`, for the gesture tests.
 * `onSave` hears each save (`onLayoutChange`): the panels that moved.
 */
export function CanvasHarness({
  panels,
  width = 1200,
  height = 800,
  onSave,
}: {
  panels: PanelItem[]
  width?: number
  height?: number
  onSave?: (saved: PanelItem[]) => void
}) {
  useLayoutEffect(() => {
    useCanvasStore.getState().setPanels(panels)
  }, [panels])
  return (
    <div style={{ width, height, position: 'relative' }}>
      <CanvasEngine onLayoutChange={onSave} renderPanel={(id) => <p>{id}</p>} />
    </div>
  )
}
