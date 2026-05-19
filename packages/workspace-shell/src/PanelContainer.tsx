import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Panel } from '@pls/panel-system'
import { cn } from '@pls/shared-ui'
import { SubstrateProvider, useManifest } from '@pls/lens-framework'
import { Zap } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'
import { substrateBridge } from './substrate-bridge'
import { useRecentJobs } from '@pls/substrate-client'

function usePanelPulse(lensType: string) {
  const [pulsing, setPulsing] = useState(false)
  const manifest = useManifest(lensType)
  const { data: jobs } = useRecentJobs(5)
  const prevCompletedRef = useRef(0)

  useEffect(() => {
    if (!jobs) return
    const completed = jobs.filter((j) => j.status === 'completed').length
    if (completed > prevCompletedRef.current && prevCompletedRef.current > 0) {
      const relevantKeys = manifest?.reads ?? []
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
  }, [jobs, lensType, manifest])

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
  const manifest = useManifest(lensType)

  const isWritable = manifest?.category === 'tool'

  const workflowAction = isWritable ? (
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
        label={manifest?.label ?? lensType}
        icon={manifest?.icon}
        onRemove={onRemove}
        headerActions={workflowAction}
        focused={focusedPanelId === panelId}
        onFocus={() => setFocusedPanelId(panelId)}
        pulsing={pulsing}
      >
        <SubstrateProvider
          reader={substrateBridge}
          writer={isWritable ? substrateBridge : undefined}
        >
          {children}
        </SubstrateProvider>
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
