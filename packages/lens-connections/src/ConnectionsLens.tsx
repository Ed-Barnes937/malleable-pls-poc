import { useConnections, useRecordingConnections } from '@pls/substrate'
import { type LensProps } from '@pls/lens-framework'
import { cn, EmptyState } from '@pls/shared-ui'
import { FileText, Mic, ArrowRight, Link2 } from 'lucide-react'

const SOURCE_ICONS: Record<string, typeof FileText> = {
  recording: Mic,
  transcript_segment: FileText,
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  'same-concept': 'Same concept',
  'builds-on': 'Builds on',
  'related': 'Related',
  'references': 'References',
  'example-of': 'Example of',
}

const CONCEPT_SEGMENTS: Record<string, string> = {
  'mitochondrial DNA': 'seg-bio4-04',
  'endosymbiosis': 'seg-bio4-02',
  'cell respiration': 'seg-bio3-05',
  'SN1 vs SN2': 'seg-chem1-04',
}

export default function ConnectionsLens({ scope, config }: LensProps) {
  const conceptLabel = config.conceptLabel as string | undefined
  const conceptSegmentId = conceptLabel ? CONCEPT_SEGMENTS[conceptLabel] : undefined
  const recordingId = (config.recordingId as string) ?? scope.recordingId

  const { data: conceptConnections } = useConnections(conceptSegmentId ?? '')
  const { data: recordingConnections } = useRecordingConnections(recordingId)

  const allConnections = [
    ...(conceptConnections ?? []),
    ...(recordingConnections ?? []),
  ]

  const seen = new Set<string>()
  const connections = allConnections.filter((c) => {
    const key = `${c.sourceId}-${c.relationship}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Connections</span>
        <div className="mt-1 flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-sm font-semibold text-neutral-200">
            {conceptLabel ?? 'All in scope'}
          </h3>
          {connections.length > 0 && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {connections.length}
            </span>
          )}
        </div>
      </div>

      {!connections.length ? (
        <EmptyState message="No connections found" />
      ) : (
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 space-y-1">
          {connections.map((conn, i) => {
            const Icon = SOURCE_ICONS[conn.sourceType] ?? FileText
            const relLabel = RELATIONSHIP_LABELS[conn.relationship ?? ''] ?? conn.relationship
            const title = conn.sourceTitle.length > 80
              ? conn.sourceTitle.slice(0, 80) + '...'
              : conn.sourceTitle
            const date = conn.sourceDate ? new Date(conn.sourceDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : ''

            return (
              <div
                key={`${conn.sourceId}-${i}`}
                className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-overlay/50"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent/70">
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-neutral-300 group-hover:text-neutral-200">{title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-600">
                    {relLabel && (
                      <span className="flex items-center gap-0.5">
                        <ArrowRight className="h-2 w-2" />
                        {relLabel}
                      </span>
                    )}
                    {date && <span>{date}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
