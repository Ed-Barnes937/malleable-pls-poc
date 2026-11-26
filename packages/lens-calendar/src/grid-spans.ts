import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createSpans, type PrimitiveContext, type SpanAction, type Span, type SpansDraft, type SpansMessage } from '@ui-sdk/core'
import type { DaySegment } from './layout'

/** One day's piece of a block on the grid, as a UI SDK span: the day is its track, minutes from midnight its range. */
export type GridSpan = Span & { seg?: DaySegment }
export type GridState = { spans: GridSpan[]; draft: SpansDraft<GridSpan> | null }

/** What a span is drawn as while a press draws on empty time. */
export const DRAWN_SPAN_ID = 'new'

/**
 * A segment's span id: its occurrence, so a move to another day keeps the
 * same span (and focus on it); a block across midnight has one span per day,
 * keyed by the day too.
 */
export function spanIdOf(seg: DaySegment): string {
  return seg.continuesBefore || seg.continuesAfter ? `${seg.item.occurrence_key}:${seg.dayIndex}` : seg.item.occurrence_key
}

/**
 * The smallest store `createSpans` runs on (it reads and writes the state,
 * nothing else), read by React through `useSyncExternalStore`.
 */
function gridStore(initial: GridState) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<GridState>) {
      if ((Object.keys(patch) as (keyof GridState)[]).every((k) => state[k] === patch[k])) return
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export interface GridSpansOptions {
  /** How many days (tracks) the grid shows. */
  days: () => number
  /** Takes a drawn, moved or resized span; returns whether it went through. */
  commit: (next: GridSpan, before: GridSpan | undefined, action: SpanAction, event?: Event) => boolean
  disabled: (span: GridSpan) => boolean
  label: (span: GridSpan) => string
  message: (message: SpansMessage<GridSpan>) => string
}

/**
 * The time grid's blocks on UI SDK `createSpans`: one track per day, minutes
 * 0-1440 in 15-minute steps. The segments are the value; a drag's draft is
 * kept by `createSpans` until it commits.
 */
export function useGridSpans(segments: DaySegment[][], options: GridSpansOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const [{ store, spans, destroy }] = useStateOnce(() => {
    const store = gridStore({ spans: [], draft: null })
    const cleanups: Array<() => void> = []
    const context = { store, onDestroy: (cleanup: () => void) => { cleanups.push(cleanup) } } as unknown as Pick<PrimitiveContext<unknown, GridState, string>, 'store' | 'onDestroy'>
    const spans = createSpans<GridState, GridSpan>(context, {
      key: 'spans',
      draft: 'draft',
      set: (value, details) => {
        const current = store.get().spans
        const next = value.find((s) => s.id === details.id)
        const before = current.find((s) => s.id === details.id)
        if (!next || !optionsRef.current.commit(next, before, details.action, details.event)) return false
        // Shown where it was put until the saved rows replace it.
        store.set({ spans: value.filter((s) => s.seg) })
        return true
      },
      min: () => 0,
      max: () => 24 * 60,
      step: () => 15,
      minSize: () => 15,
      axis: 'y',
      tracks: () => Array.from({ length: optionsRef.current.days() }, (_, i) => String(i)),
      create: (span) => ({ ...span, id: DRAWN_SPAN_ID }),
      disabled: (s) => !s.seg || optionsRef.current.disabled(s),
      label: (s) => optionsRef.current.label(s),
      message: (m) => optionsRef.current.message(m),
    })
    return { store, spans, destroy: () => cleanups.forEach((c) => c()) }
  })
  useLayoutEffect(() => {
    store.set({
      spans: segments.flat().map((seg) => ({ id: spanIdOf(seg), track: String(seg.dayIndex), start: seg.startMin, end: seg.endMin, seg })),
    })
  }, [segments, store])
  // Destroyed once unmounted for good: StrictMode's unmount and remount keeps it.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => { if (!mounted.current) destroy() })
    }
  }, [destroy])
  const state = useSyncExternalStore(store.subscribe, store.get)
  // A span's element joins once per id (not on every render).
  const refs = useMemo(() => new Map<string, (el: HTMLElement | null) => (() => void) | undefined>(), [])
  const bindSpan = (id: string) => {
    let ref = refs.get(id)
    if (!ref) {
      ref = (el) => (el ? spans.bindSpan(el, id) : undefined)
      refs.set(id, ref)
    }
    return ref
  }
  return { spans, state, store, bindSpan }
}

function useStateOnce<T>(make: () => T): [T] {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = make()
  return [ref.current]
}
