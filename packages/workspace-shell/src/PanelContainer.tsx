import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Panel } from '@pls/panel-system'
import { cn } from '@pls/shared-ui'
import { Zap } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { LENS_META } from './lens-meta'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'
import { useRecentJobs } from '@pls/substrate'

const QUERY_KEYS_BY_LENS: Record<string, string[]> = {
  'weekly-overview': ['weekly_overview'],
  'connections': ['connections', 'links'],
  'gap-analysis': ['gap_analysis'],
  'weakest-topics': ['weakest_topics'],
  'transcript': ['transcript_segments', 'annotations', 'tags'],
  'test-me': ['confidence_signals'],
  'audio-capture': ['transcript_segments'],
}

function usePanelPulse(lensType: string) {
  const [pulsing, setPulsing] = useState(false)
  const { data: jobs } = useRecentJobs(5)
  const prevCompletedRef = useRef(0)

  useEffect(() => {
    if (!jobs) return
    const completed = jobs.filter((j) => j.status === 'completed').length
    if (completed > prevCompletedRef.current && prevCompletedRef.current > 0) {
      const relevantKeys = QUERY_KEYS_BY_LENS[lensType] ?? []
      const hasRelevantJob = jobs.some((j) => {
        if (j.status !== 'completed' || !j.output) return false
        try {
          const output = JSON.parse(j.output)
          return relevantKeys.some((key) =>
            j.job_type.includes(key) ||
            Object.keys(output).some((k) => k.toLowerCase().includes(key.replace('_', '')))
          )
        } catch {
          return true
        }
      })
      if (hasRelevantJob) {
        setPulsing(true)
        const timer = setTimeout(() => setPulsing(false), 1500)
        return () => clearTimeout(timer)
      }
    }
    prevCompletedRef.current = completed
  }, [jobs, lensType])

  return pulsing
}

interface PanelContainerProps {
  panelId: string
  lensType: string
  dbPanelId?: string
  onRemove?: () => void
  children: ReactNode
}

export function PanelContainer({
  panelId,
  lensType,
  onRemove,
  children,
}: PanelContainerProps) {
  const focusedPanelId = useWorkspaceStore((s) => s.focusedPanelId)
  const setFocusedPanelId = useWorkspaceStore((s) => s.setFocusedPanelId)
  const [showWorkflows, setShowWorkflows] = useState(false)
  const pulsing = usePanelPulse(lensType)

  const meta = LENS_META[lensType]
  const hasWorkflows = meta?.category === 'tool' || meta?.category === 'both'

  const workflowAction = hasWorkflows ? (
    <button
      onClick={(e) => { e.stopPropagation(); setShowWorkflows(true) }}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded transition-colors',
        'text-neutral-700 hover:bg-surface-overlay hover:text-accent'
      )}
      title="Workflow settings"
    >
      <Zap className="h-3 w-3" />
    </button>
  ) : undefined

  return (
    <>
      <Panel
        label={meta?.label ?? lensType}
        icon={meta?.icon}
        onRemove={onRemove}
        headerActions={workflowAction}
        focused={focusedPanelId === panelId}
        onFocus={() => setFocusedPanelId(panelId)}
        pulsing={pulsing}
      >
        {children}
      </Panel>
      {showWorkflows && (
        <WorkflowSettingsDialog
          lensType={lensType}
          onClose={() => setShowWorkflows(false)}
        />
      )}
    </>
  )
}
