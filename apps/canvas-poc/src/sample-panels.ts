import type { PanelItem } from './canvas-store'

/**
 * Sample panels for demonstrating the canvas engine.
 * Uses warm-toned colours that complement the design tokens.
 * Panels overlap intentionally to demonstrate z-ordering.
 */
export const SAMPLE_PANELS: PanelItem[] = [
  {
    id: 'terracotta',
    pos_x: 40,
    pos_y: 40,
    width: 260,
    height: 180,
    z_index: 1,
    meta: { colour: 'oklch(0.65 0.14 35)' },   // warm terracotta
  },
  {
    id: 'amber',
    pos_x: 180,
    pos_y: 100,
    width: 220,
    height: 200,
    z_index: 2,
    meta: { colour: 'oklch(0.75 0.15 75)' },   // golden amber
  },
  {
    id: 'sage',
    pos_x: 340,
    pos_y: 60,
    width: 240,
    height: 160,
    z_index: 3,
    meta: { colour: 'oklch(0.68 0.08 150)' },  // muted sage
  },
  {
    id: 'clay',
    pos_x: 100,
    pos_y: 260,
    width: 280,
    height: 150,
    z_index: 4,
    meta: { colour: 'oklch(0.58 0.10 50)' },   // warm clay
  },
  {
    id: 'copper',
    pos_x: 460,
    pos_y: 200,
    width: 200,
    height: 220,
    z_index: 5,
    meta: { colour: 'oklch(0.60 0.12 55)' },   // burnished copper
  },
  {
    id: 'sand',
    pos_x: 300,
    pos_y: 300,
    width: 250,
    height: 170,
    z_index: 6,
    meta: { colour: 'oklch(0.80 0.06 80)' },   // warm sand
  },
]
