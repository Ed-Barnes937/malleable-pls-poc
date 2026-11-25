import { useSyncExternalStore } from 'react'
import { createColorScheme, createLocalStorage, type ColorSchemeValue } from '@ui-sdk/core'

/** The scheme the app is drawn in. */
export type Theme = 'light' | 'dark'
export type ThemeChoice = ColorSchemeValue

/**
 * The student's colour scheme: "light", "dark" or "system" (follow the OS).
 * Kept under the existing `pls-theme` key (a plain string, so choices made
 * before UI SDK still read back) and synced across tabs. System until the
 * student picks otherwise.
 */
export const colorScheme = createColorScheme({
  storage: createLocalStorage('pls-theme'),
  defaultValue: 'system',
})

/** The scheme to draw: the choice, or the OS's for "system" (light until the OS answers). */
export function resolvedTheme(state: { resolved: 'light' | 'dark' | 'unknown' }): Theme {
  return state.resolved === 'dark' ? 'dark' : 'light'
}

/** The current scheme, re-rendering when it changes here, in another tab or in the OS. */
export function useColorScheme() {
  const state = useSyncExternalStore(colorScheme.subscribe, colorScheme.get, colorScheme.get)
  return { choice: state.value, theme: resolvedTheme(state), set: colorScheme.set }
}

/**
 * Keeps `<html data-theme>` on the drawn scheme, which is what the CSS tokens
 * switch on. Returns the function that stops it.
 */
export function followTheme(root: HTMLElement = document.documentElement): () => void {
  const apply = (state: { resolved: 'light' | 'dark' | 'unknown' }) => root.setAttribute('data-theme', resolvedTheme(state))
  apply(colorScheme.get())
  return colorScheme.subscribe(apply)
}
