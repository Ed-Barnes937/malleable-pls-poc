import { createRoot } from 'react-dom/client'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@ui-sdk/react/popover'

/**
 * Smoke fixture for the UI SDK foundation (ticket K0a). It proves a UI SDK
 * popup renders and opens in the Vite app, vitest and Playwright CT. It is not
 * product UI and nothing imports it outside tests.
 */
export function UiSdkSmoke() {
  return (
    <Popover>
      <PopoverTrigger>Smoke trigger</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Smoke popover</PopoverTitle>
        <p>Smoke body</p>
      </PopoverContent>
    </Popover>
  )
}

/** Mounts the fixture into `el`; the e2e check uses it inside the real Vite app. */
export function mountUiSdkSmoke(el: HTMLElement) {
  const root = createRoot(el)
  root.render(<UiSdkSmoke />)
  return () => root.unmount()
}
