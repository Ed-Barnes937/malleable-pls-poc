import { cn } from './utils'
import { Flag, Star, HelpCircle, type LucideIcon } from 'lucide-react'

export const TAG_STYLES: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
  confused: { bg: 'bg-tag-confused/15 border-tag-confused/30', text: 'text-tag-confused', icon: Flag },
  'key-point': { bg: 'bg-tag-key-point/15 border-tag-key-point/30', text: 'text-tag-key-point', icon: Star },
  question: { bg: 'bg-tag-question/15 border-tag-question/30', text: 'text-tag-question', icon: HelpCircle },
}

export function TagPill({ label }: { label: string }) {
  const style = TAG_STYLES[label]
  if (!style) return null
  const Icon = style.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', style.bg, style.text)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}
