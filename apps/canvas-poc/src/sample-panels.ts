import type { PanelItem } from './canvas-store'

/**
 * Sample panels for demonstrating the canvas engine.
 * Each panel has a title, type, and overlapping positions
 * to demonstrate z-ordering and panel chrome.
 */
export const SAMPLE_PANELS: PanelItem[] = [
  {
    id: 'meeting-notes',
    pos_x: 40,
    pos_y: 40,
    width: 300,
    height: 260,
    z_index: 1,
    title: 'Meeting Notes',
    type: 'document',
  },
  {
    id: 'voice-memo',
    pos_x: 220,
    pos_y: 120,
    width: 260,
    height: 240,
    z_index: 2,
    title: 'Voice Memo',
    type: 'audio',
  },
  {
    id: 'project-tags',
    pos_x: 400,
    pos_y: 60,
    width: 260,
    height: 220,
    z_index: 3,
    title: 'Project Tags',
    type: 'tags',
  },
  {
    id: 'analytics',
    pos_x: 120,
    pos_y: 320,
    width: 320,
    height: 240,
    z_index: 4,
    title: 'Analytics',
    type: 'chart',
  },
  {
    id: 'gallery',
    pos_x: 520,
    pos_y: 240,
    width: 260,
    height: 280,
    z_index: 5,
    title: 'Photo Gallery',
    type: 'image',
  },
  {
    id: 'quick-note',
    pos_x: 340,
    pos_y: 360,
    width: 280,
    height: 200,
    z_index: 6,
    title: 'Quick Note',
    type: 'note',
  },
]
