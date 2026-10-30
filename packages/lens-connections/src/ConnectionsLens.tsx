import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { cn, EmptyState, HiddenElsewhere } from '@pls/shared-ui'
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
  const substrate = useSubstrate()

  const conceptLabel = config.conceptLabel as string | undefined
  const conceptSegmentId = conceptLabel ? CONCEPT_SEGMENTS[conceptLabel] : undefined
  const lectureId = scope.lectureId

  const { data: conceptConnections } = substrate.useConnections(conceptSegmentId ?? '', scope)
  // Unfiltered concept links, only to say what the course filter leaves out.
  const { data: allConceptConnections } = substrate.useConnections(conceptSegmentId ?? '', {})
  // Links out of the board's lecture (always in the board course).
  const { data: lectureConnections } = substrate.useLectureConnections(lectureId)

  const allConnections = [
    ...(conceptConnections ?? []),
    ...(lectureConnections ?? []),
  ]

  const seen = new Set<string>()
  const connections = allConnections.filter((c) => {
    const key = `${c.sourceId}-${c.relationship}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const allConceptKeys = new Set((allConceptConnections ?? []).map((c) => `${c.sourceId}-${c.relationship}`))
  const shownConceptKeys = [...allConceptKeys].filter((key) => seen.has(key)).length
  const hidden = <HiddenElsewhere scopedCount={shownConceptKeys} unscopedCount={allConceptKeys.size} />

  // Nothing to connect from: neither a selected lecture nor a configured concept.
  if (!lectureId && !conceptSegmentId) {
    return <EmptyState icon={Link2} message="Focus a lecture to see its connections" />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-accent" />
        <h3 className="text-title font-semibold text-text-primary">
          {conceptLabel ?? 'All in scope'}
        </h3>
        {connections.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2 py-px text-meta font-semibold tabular-nums text-accent">
            {connections.length}
          </span>
        )}
        {connections.length > 0 && <span className="ml-auto">{hidden}</span>}
      </div>

      {!connections.length ? (
        <EmptyState message="No connections found" action={hidden} />
      ) : (
        <div className="-mx-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
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
                className="flex items-start gap-3 rounded-item px-2.5 py-2 transition-colors hover:bg-surface-inset"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-item bg-accent-soft text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary">{title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-meta text-text-muted">
                    {relLabel && (
                      <span className="flex items-center gap-0.5">
                        <ArrowRight className="h-3 w-3" />
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
