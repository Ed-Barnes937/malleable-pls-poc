import type { PanelItem } from './canvas-store'

/**
 * Sample panels for demonstrating the canvas engine.
 * Each panel has a title, type, and overlapping positions
 * to demonstrate z-ordering and panel chrome.
 */
export const SAMPLE_PANELS: PanelItem[] = [
  {
    id: 'transcript',
    pos_x: 40,
    pos_y: 40,
    width: 420,
    height: 500,
    z_index: 1,
    title: 'ML Lecture Transcript',
    type: 'transcript',
  },
  {
    id: 'audio-capture',
    pos_x: 500,
    pos_y: 40,
    width: 350,
    height: 380,
    z_index: 2,
    title: 'Audio Capture',
    type: 'audio',
  },
  {
    id: 'project-tags',
    pos_x: 500,
    pos_y: 460,
    width: 260,
    height: 220,
    z_index: 3,
    title: 'Project Tags',
    type: 'tags',
  },
  {
    id: 'analytics',
    pos_x: 890,
    pos_y: 40,
    width: 320,
    height: 280,
    z_index: 4,
    title: 'Analytics',
    type: 'chart',
  },
  {
    id: 'quick-note',
    pos_x: 890,
    pos_y: 360,
    width: 280,
    height: 200,
    z_index: 5,
    title: 'Quick Note',
    type: 'note',
  },
]
