import { useState, useMemo } from 'react'
import { useTranscript, useTags, useCreateTag, useRecording, useAnnotations, useCreateAnnotation, type Tag } from '@pls/substrate'
import { type LensProps } from '@pls/workspace-shell'
import { cn } from '@pls/shared-ui'
import { Flag, Star, HelpCircle, MessageSquare } from 'lucide-react'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const TAG_STYLES: Record<string, { bg: string; text: string; icon: typeof Flag }> = {
  confused: { bg: 'bg-tag-confused/15 border-tag-confused/30', text: 'text-tag-confused', icon: Flag },
  'key-point': { bg: 'bg-tag-key-point/15 border-tag-key-point/30', text: 'text-tag-key-point', icon: Star },
  question: { bg: 'bg-tag-question/15 border-tag-question/30', text: 'text-tag-question', icon: HelpCircle },
}

function TagPill({ tag }: { tag: Tag }) {
  const style = TAG_STYLES[tag.label]
  if (!style) return null
  const Icon = style.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', style.bg, style.text)}>
      <Icon className="h-2.5 w-2.5" />
      {tag.label}
    </span>
  )
}

export default function TranscriptLens({ scope, config }: LensProps) {
  const recordingId = (config.recordingId as string) ?? scope.recordingId ?? ''
  const mode = (config.mode as string) ?? 'review'
  const isCapture = mode === 'capture'

  const { data: recording } = useRecording(recordingId)
  const { data: segments } = useTranscript(recordingId)
  const { data: tags } = useTags({ ...scope, recordingId })
  const { data: annotations } = useAnnotations({ ...scope, recordingId })
  const createTag = useCreateTag()
  const createAnnotation = useCreateAnnotation()

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState('')

  const tagsBySegment = useMemo(() => {
    const map = new Map<string, Tag[]>()
    for (const tag of tags ?? []) {
      if (tag.target_type === 'transcript_segment') {
        const list = map.get(tag.target_id) ?? []
        list.push(tag)
        map.set(tag.target_id, list)
      }
    }
    return map
  }, [tags])

  const annotationsBySegment = useMemo(() => {
    const map = new Map<string, { id: string; body: string }[]>()
    for (const ann of annotations ?? []) {
      if (ann.anchor_type === 'transcript_segment') {
        const list = map.get(ann.anchor_id) ?? []
        list.push(ann)
        map.set(ann.anchor_id, list)
      }
    }
    return map
  }, [annotations])

  const handleTag = (label: string) => {
    if (!selectedSegmentId) return
    createTag.mutate({ target_type: 'transcript_segment', target_id: selectedSegmentId, label })
  }

  const handleAnnotation = () => {
    if (!selectedSegmentId || !annotationDraft.trim()) return
    createAnnotation.mutate({
      anchor_type: 'transcript_segment',
      anchor_id: selectedSegmentId,
      body: annotationDraft.trim(),
    })
    setAnnotationDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-[11px] font-medium text-neutral-400">
          {recording?.title ?? 'Loading...'}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-600">
          {segments?.length ?? 0} segments
        </span>
      </div>

      <div className="-mx-3 min-h-0 flex-1 space-y-px overflow-y-auto px-3">
        {segments?.map((seg) => {
          const segTags = tagsBySegment.get(seg.id) ?? []
          const segAnnotations = annotationsBySegment.get(seg.id) ?? []
          const isSelected = selectedSegmentId === seg.id

          return (
            <div key={seg.id}>
              <button
                onClick={() => setSelectedSegmentId(isSelected ? null : seg.id)}
                className={cn(
                  'group flex w-full gap-3 rounded-lg px-2.5 py-2 text-left transition-all',
                  isSelected ? 'bg-accent/8 ring-1 ring-accent/20' : 'hover:bg-surface-overlay/50'
                )}
              >
                <span className={cn(
                  'shrink-0 pt-0.5 font-mono text-[11px] tabular-nums',
                  isSelected ? 'text-accent' : 'text-neutral-600 group-hover:text-neutral-500'
                )}>
                  {formatTime(seg.start_ms)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[13px] leading-relaxed', isSelected ? 'text-neutral-200' : 'text-neutral-400')}>
                    {seg.text}
                  </p>
                  {segTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {segTags.map((tag) => <TagPill key={tag.id} tag={tag} />)}
                    </div>
                  )}
                  {!isCapture && segAnnotations.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {segAnnotations.map((ann) => (
                        <div key={ann.id} className="flex items-start gap-1.5 rounded-md bg-surface-overlay/40 px-2 py-1 text-[11px] text-neutral-500">
                          <MessageSquare className="mt-0.5 h-2.5 w-2.5 shrink-0 text-neutral-600" />
                          {ann.body}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              {isSelected && isCapture && (
                <div className="ml-[3.25rem] flex items-center gap-1 py-1.5">
                  {(['confused', 'key-point', 'question'] as const).map((label) => {
                    const style = TAG_STYLES[label]
                    const Icon = style.icon
                    return (
                      <button
                        key={label}
                        onClick={() => handleTag(label)}
                        className={cn('inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedSegmentId && !isCapture && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-600">Tag:</span>
            {(['confused', 'key-point', 'question'] as const).map((label) => {
              const style = TAG_STYLES[label]
              const Icon = style.icon
              return (
                <button
                  key={label}
                  onClick={() => handleTag(label)}
                  className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            <input
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnnotation()}
              placeholder="Add a note..."
              className="flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-700 focus:border-accent/40 focus:outline-none"
            />
            <button
              onClick={handleAnnotation}
              disabled={!annotationDraft.trim()}
              className="rounded-md bg-surface-overlay px-2 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
