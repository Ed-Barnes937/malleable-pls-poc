import { cn } from './utils'
import { Flag, Star, HelpCircle, type LucideIcon } from 'lucide-react'

export const TAG_STYLES: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
  confused: { bg: 'bg-confused-soft border-confused-line', text: 'text-confused', icon: Flag },
  'key-point': { bg: 'bg-attn-soft border-attn-line', text: 'text-attn', icon: Star },
  question: { bg: 'bg-accent-soft border-accent-line', text: 'text-accent', icon: HelpCircle },
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
