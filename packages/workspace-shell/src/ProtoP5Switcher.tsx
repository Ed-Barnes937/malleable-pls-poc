/**
 * PROTOTYPE p5 switcher (proto/p5-canvas only, never merged). Bottom-right,
 * so it can sit beside the p2, p3 and p4 switchers on one branch. Switches
 * `?p5=` and shows what the canvas just did and what overlaps what.
 */
import { useState } from 'react'
import { useCanvasStore, useP5Store, overlapReport, P5_VARIANTS } from '@pls/panel-system'
import { useManifests } from '@pls/lens-framework'

export function ProtoP5Switcher() {
  const variant = useP5Store((s) => s.variant)
  const setVariant = useP5Store((s) => s.setVariant)
  const lastEvent = useP5Store((s) => s.lastEvent)
  const panels = useCanvasStore((s) => s.panels)
  const manifests = useManifests()
  const [open, setOpen] = useState(true)
  const current = P5_VARIANTS.find((v) => v.key === variant)!
  const label = (lensType?: string) => manifests.find((m) => m.id === lensType)?.label ?? lensType ?? 'Widget'
  const overlaps = overlapReport(panels, (p) => label(p.lensType))

  return (
    <div
      data-testid="p5-switcher"
      className="fixed right-3 bottom-[4.75rem] z-[10000] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border-2 border-dashed border-amber-500 bg-neutral-900 p-2.5 text-xs text-white shadow-2xl"
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="font-bold tracking-wide text-amber-300" aria-expanded={open}>
          PROTOTYPE p5 canvas
        </button>
        <div className="ml-auto flex gap-1" role="group" aria-label="p5 variant">
          {P5_VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={v.key === variant}
              onClick={() => setVariant(v.key)}
              className={`h-7 min-w-7 rounded-md px-1.5 font-semibold ${v.key === variant ? 'bg-amber-400 text-neutral-900' : 'bg-neutral-700 text-white hover:bg-neutral-600'}`}
              title={`${v.name}: ${v.blurb}`}
            >
              {v.key === 'off' ? 'Now' : v.key.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="mt-1.5 space-y-1 leading-snug">
          <p><b>{variant === 'off' ? 'Now' : variant.toUpperCase()} {current.name}:</b> {current.blurb}</p>
          <p data-testid="p5-overlaps" className={overlaps === 'No overlaps' ? 'text-emerald-300' : 'text-rose-300'}>{overlaps}</p>
          {lastEvent && <p data-testid="p5-last-event" className="text-neutral-300">Last: {lastEvent}</p>}
        </div>
      )}
    </div>
  )
}
