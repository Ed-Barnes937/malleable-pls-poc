import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', 'summary',
].join(',')

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0)
}

/**
 * Keeps keyboard focus inside `ref` while `active`, as a modal needs: Tab and
 * Shift+Tab wrap at the ends, and focus that lands outside (a click on the
 * page behind, script) is brought back. Moving focus in on open, and back to
 * the opener on close, stays with the caller.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      const container = ref.current
      if (e.key !== 'Tab' || !container) return
      const items = focusables(container)
      if (items.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const outside = !container.contains(current)
      // Another modal stacked on top (e.g. Activity over the board menu) traps Tab itself.
      if (outside && current?.closest('[aria-modal="true"]')) return
      if (e.shiftKey && (current === first || current === container || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      const container = ref.current
      if (!container || container.contains(e.target as Node)) return
      // Another modal stacked on top (e.g. Activity over the board menu) keeps its own focus.
      if ((e.target as Element).closest?.('[aria-modal="true"]')) return
      ;(focusables(container)[0] ?? container).focus()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [ref, active])
}
