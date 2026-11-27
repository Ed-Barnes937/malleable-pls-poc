import { beforeMount } from '@playwright/experimental-ct-react/hooks'
import '../apps/web/src/index.css'

// Every component mounts in the app's own fonts (apps/web/src/fonts), already
// loaded: a face that arrived mid-test would redraw text a fraction of a
// pixel wider or narrower between two measurements.
beforeMount(async () => {
  await Promise.all(['16px "DM Sans"', 'italic 16px "DM Sans"', '16px "JetBrains Mono"'].map((font) => document.fonts.load(font)))
})
