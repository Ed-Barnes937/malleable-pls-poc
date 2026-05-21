import { useEffect, useRef } from 'react'

/**
 * Track whether the Shift key is currently held.
 * Returns a ref (not state) so reading it during pointer-move
 * handlers doesn't trigger re-renders.
 */
export function useShiftKey(): React.RefObject<boolean> {
  const shiftRef = useRef(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  return shiftRef
}
