import { useSyncExternalStore } from 'react'

/** Below Tailwind's `sm` (640px): a phone. Seven day columns don't fit there. */
const NARROW_SCREEN = '(max-width: 639.98px)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_SCREEN)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const isNarrow = () => window.matchMedia(NARROW_SCREEN).matches

/** True while the screen (not the panel) is phone-sized. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false)
}
