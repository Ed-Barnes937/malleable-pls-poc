import { useEffect, useRef } from 'react'

/**
 * Track whether the Shift key is currently held.
 * Returns a ref (not state) so reading it during pointer-move
 * handlers doesn't trigger re-renders. `onChange` hears each press and
 * release (and a release when the window loses focus).
 * Kept current by pointer events too, which carry the key's state.
 */
export function useShiftKey(onChange?: (held: boolean) => void): React.RefObject<boolean> {
  const shiftRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const update = (held: boolean) => {
      if (shiftRef.current === held) return
      shiftRef.current = held
      onChangeRef.current?.(held)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') update(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') update(false)
    }
    const handleBlur = () => update(false)
    // Every pointer event says whether Shift is down, so one pressed before
    // the page had focus (or before this mounted) still counts.
    const handlePointer = (e: PointerEvent) => update(e.shiftKey)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('pointerdown', handlePointer, true)
    window.addEventListener('pointermove', handlePointer, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pointerdown', handlePointer, true)
      window.removeEventListener('pointermove', handlePointer, true)
    }
  }, [])

  return shiftRef
}
