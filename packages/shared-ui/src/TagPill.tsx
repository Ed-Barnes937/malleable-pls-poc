import { cn } from './utils'
import { Flag, Star, HelpCircle, type LucideIcon } from 'lucide-react'

/**
 * How each moment tag looks: `bg` + `text` for a pill or button, `mark` for
 * a solid mark (Transcript gutter and scroll rail), `line` for a border in
 * the same colour.
 */
export const TAG_STYLES: Record<string, { bg: string; text: string; mark: string; line: string; icon: LucideIcon }> = {
  confused: { bg: 'bg-confused-soft border-confused-line', text: 'text-confused', mark: 'bg-confused', line: 'border-confused', icon: Flag },
  'key-point': { bg: 'bg-attn-soft border-attn-line', text: 'text-attn', mark: 'bg-attn', line: 'border-attn', icon: Star },
  question: { bg: 'bg-accent-soft border-accent-line', text: 'text-accent', mark: 'bg-accent', line: 'border-accent', icon: HelpCircle },
}

/** The tag a moment shows when it has several: confusion first, then questions, then key points. */
export function leadingTag(labels: Iterable<string>): string | undefined {
  const set = new Set(labels)
  return ['confused', 'question', 'key-point'].find((l) => set.has(l))
}

export function TagPill({ label }: { label: string }) {
  const style = TAG_STYLES[label]
  if (!style) return null
  const Icon = style.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold', style.bg, style.text)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
