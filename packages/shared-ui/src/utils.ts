import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge taught the design tokens in apps/web/src/index.css, so it
 * knows `text-meta` is a size (not a colour that would knock out
 * `text-text-muted`) and `rounded-item` / `shadow-pop` are a radius and a
 * shadow.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['meta', 'body', 'title', 'heading'],
      radius: ['widget', 'control', 'item', 'panel'],
      shadow: ['panel', 'panel-focused', 'pop'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a millisecond duration as `m:ss`. */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Where a to-do came from: "From Mitochondrial DNA · 1:18" (the lecture and the moment). */
export function fromMomentLabel(title: string, offsetMs: number | null | undefined): string {
  return offsetMs == null ? `From ${title}` : `From ${title} · ${formatTime(offsetMs)}`
}
