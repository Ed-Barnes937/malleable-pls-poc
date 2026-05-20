import { useState, useCallback } from 'react'
import { Panel, PanelGrid, type PanelGridItem } from '@pls/panel-system'
import {
  BarChart3,
  FileText,
  Image,
  ListChecks,
  MessageSquare,
  Settings,
} from 'lucide-react'

const PALETTE = [
  { type: 'chart', label: 'Chart', icon: BarChart3 },
  { type: 'notes', label: 'Notes', icon: FileText },
  { type: 'media', label: 'Media', icon: Image },
  { type: 'tasks', label: 'Tasks', icon: ListChecks },
  { type: 'chat', label: 'Chat', icon: MessageSquare },
  { type: 'settings', label: 'Settings', icon: Settings },
] as const

type PanelType = (typeof PALETTE)[number]['type']

interface DemoPanel {
  id: string
  type: PanelType
}

const MIME = 'application/x-panel-demo'

let nextId = 1

function panelContent(type: PanelType) {
  switch (type) {
    case 'chart':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
          <div className="flex items-end gap-1.5">
            {[40, 65, 45, 80, 55, 70].map((h, i) => (
              <div
                key={i}
                className="w-5 rounded-sm bg-accent/30"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <p className="text-xs">Sample chart data</p>
        </div>
      )
    case 'notes':
      return (
        <div className="space-y-2 text-xs text-neutral-400">
          <p>Panel System demonstrates a draggable, resizable grid layout.</p>
          <p>
            Each panel has a drag handle, optional remove button, error boundary,
            and suspense fallback built in.
          </p>
          <p className="text-neutral-600">
            Try dragging panels by the grip icon, resizing from the bottom-right
            corner, or removing them with the X button.
          </p>
        </div>
      )
    case 'media':
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex h-24 w-32 items-center justify-center rounded-lg border border-border-subtle bg-surface-overlay text-xs text-neutral-600">
            Placeholder
          </div>
        </div>
      )
    case 'tasks':
      return (
        <ul className="space-y-1.5 text-xs">
          {['Drag panels around', 'Resize from corner', 'Remove a panel', 'Drop from palette'].map(
            (task, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded border border-border-subtle" />
                <span className="text-neutral-400">{task}</span>
              </li>
            )
          )}
        </ul>
      )
    case 'chat':
      return (
        <div className="flex h-full flex-col justify-end gap-2">
          {[
            { align: 'self-start', text: 'How does the grid work?' },
            { align: 'self-end', text: 'Drag, drop, and resize!' },
          ].map((msg, i) => (
            <div
              key={i}
              className={`${msg.align} max-w-[80%] rounded-lg bg-surface-overlay px-3 py-1.5 text-xs text-neutral-400`}
            >
              {msg.text}
            </div>
          ))}
        </div>
      )
    case 'settings':
      return (
        <div className="space-y-3">
          {['Grid columns', 'Row height', 'Margin'].map((setting) => (
            <div key={setting} className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">{setting}</span>
              <div className="h-5 w-16 rounded bg-surface-overlay" />
            </div>
          ))}
        </div>
      )
  }
}

function getMeta(type: PanelType) {
  return PALETTE.find((p) => p.type === type)!
}

const INITIAL_PANELS: DemoPanel[] = [
  { id: 'p-1', type: 'notes' },
  { id: 'p-2', type: 'chart' },
  { id: 'p-3', type: 'tasks' },
  { id: 'p-4', type: 'chat' },
]

const INITIAL_LAYOUT: PanelGridItem[] = [
  { id: 'p-1', x: 0, y: 0, w: 1, h: 2 },
  { id: 'p-2', x: 1, y: 0, w: 1, h: 2 },
  { id: 'p-3', x: 2, y: 0, w: 1, h: 2 },
  { id: 'p-4', x: 0, y: 2, w: 2, h: 2 },
]

export function App() {
  const [panels, setPanels] = useState<DemoPanel[]>(INITIAL_PANELS)
  const [layout, setLayout] = useState<PanelGridItem[]>(INITIAL_LAYOUT)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  nextId = 5

  const handleRemove = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id))
    setLayout((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const handleLayoutChange = useCallback((newLayout: PanelGridItem[]) => {
    setLayout(newLayout)
  }, [])

  const handleDrop = useCallback(
    (data: string, position: { x: number; y: number; w: number; h: number }) => {
      const type = data as PanelType
      if (!PALETTE.some((p) => p.type === type)) return
      const id = `p-${nextId++}`
      setPanels((prev) => [...prev, { id, type }])
      setLayout((prev) => [...prev, { id, ...position }])
    },
    []
  )

  const renderItem = useCallback(
    (id: string) => {
      const panel = panels.find((p) => p.id === id)
      if (!panel) return null
      const meta = getMeta(panel.type)
      return (
        <Panel
          label={meta.label}
          icon={meta.icon}
          onRemove={() => handleRemove(id)}
          focused={focusedId === id}
          onFocus={() => setFocusedId(id)}
        >
          {panelContent(panel.type)}
        </Panel>
      )
    },
    [panels, focusedId, handleRemove]
  )

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h1 className="text-sm font-semibold text-neutral-200">Panel System Demo</h1>
        <div className="flex items-center gap-2">
          {PALETTE.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MIME, item.type)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="flex cursor-grab items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-border hover:text-neutral-200 active:cursor-grabbing"
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
          ))}
        </div>
      </header>
      <PanelGrid
        items={layout}
        cols={3}
        gridRows={6}
        onLayoutChange={handleLayoutChange}
        onItemDrop={handleDrop}
        dropMimeType={MIME}
        renderItem={renderItem}
        showGridBackground
      />
    </div>
  )
}
