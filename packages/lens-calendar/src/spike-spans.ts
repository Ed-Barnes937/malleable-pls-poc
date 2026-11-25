// SPIKE (K0 spike 2, throwaway): TimeGrid on @ui-sdk/core createSpans.
// createSpans only needs `store` and `onDestroy` from a primitive context, so
// this runs it on a minimal store instead of a full definePrimitive.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createSpans, type Span, type SpansDraft } from '@ui-sdk/core'
import type { DaySegment } from './layout'

export type GridSpan = Span & { seg?: DaySegment }
export type GridState = { spans: GridSpan[]; draft: SpansDraft<GridSpan> | null }
type Listener = (liveOnly: boolean, delivered: boolean, changed: readonly string[]) => void

function miniStore<S extends object>(initial: S) {
  let state = initial
  const listeners = new Set<Listener>()
  return {
    get: () => state,
    set(patch: Partial<S>) {
      const changed = Object.keys(patch).filter((k) => (state as any)[k] !== (patch as any)[k])
      if (!changed.length) return
      state = { ...state, ...patch }
      for (const l of [...listeners]) l(false, false, changed)
    },
    subscribe(l: Listener) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
    view: <T,>(_next: S, read: () => T) => read(),
  }
}

/** A span's id: the occurrence, plus the day only when it is split across days (so a cross-day move keeps focus). */
export function spanId(seg: DaySegment) {
  return seg.continuesBefore || seg.continuesAfter ? `${seg.item.occurrence_key}:${seg.dayIndex}` : seg.item.occurrence_key
}

export interface GridSpansOptions {
  days: () => number
  /** Persists a change; returns the item as saved (kept on the span so the next key press builds on it), or false. */
  commit: (next: GridSpan, before: GridSpan | undefined, action: 'draw' | 'move' | 'resize' | 'delete', event?: Event) => DaySegment['item'] | false
  disabled: (span: GridSpan) => boolean
  label: (span: GridSpan) => string
}

export function useGridSpans(segments: DaySegment[][], opts: GridSpansOptions) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const ref = useRef<{ store: ReturnType<typeof miniStore<GridState>>; spans: ReturnType<typeof createSpans<GridState, GridSpan>>; destroy: () => void } | null>(null)
  if (!ref.current) {
    const store = miniStore<GridState>({ spans: [], draft: null })
    const destroyers: Array<() => void> = []
    const spans = createSpans<GridState, GridSpan>({ store: store as any, onDestroy: (fn: () => void) => { destroyers.push(fn) } } as any, {
      key: 'spans',
      draft: 'draft',
      set: (value, details) => {
        const next = value.find((s) => s.id === details.id)
        const before = store.get().spans.find((s) => s.id === details.id)
        const saved = optsRef.current.commit(next ?? before!, before, details.action, details.event)
        if (!saved) return false
        // Optimistic: show the committed spans (with the saved item) until the server's rows replace them.
        // Every segment of that item (both sides of midnight) gets the saved times.
        store.set({ spans: value.filter((s) => s.seg).map((s) => (s.seg!.item.occurrence_key === saved.occurrence_key ? { ...s, seg: { ...s.seg!, item: saved } } : s)) })
        return true
      },
      min: () => 0,
      max: () => 24 * 60,
      step: () => 15,
      minSize: () => 15,
      size: () => 60,
      axis: 'y',
      tracks: () => Array.from({ length: optsRef.current.days() }, (_, i) => String(i)),
      create: (span) => ({ ...span, id: 'spike-new' }),
      disabled: (s) => optsRef.current.disabled(s),
      label: (s) => optsRef.current.label(s),
      createAutoScroll: { edge: 32 },
    })
    ref.current = { store, spans, destroy: () => destroyers.forEach((d) => d()) }
  }
  const { store, spans } = ref.current
  // Server rows are the value: re-sync whenever they change (a drag's draft is kept by createSpans).
  useEffect(() => {
    store.set({
      spans: segments.flat().map((seg) => ({ id: spanId(seg), track: String(seg.dayIndex), start: seg.startMin, end: seg.endMin, seg })),
    })
  }, [segments, store])
  useEffect(() => () => ref.current?.destroy(), [])
  const state = useSyncExternalStore(store.subscribe, store.get)
  return { spans, state }
}
