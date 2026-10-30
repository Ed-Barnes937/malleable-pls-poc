import { TestProviders } from './mount-wrapper'

export function AudioCaptureHarness({ children, boardId }: { children: React.ReactNode; boardId?: string }) {
  return (
    <TestProviders boardId={boardId}>
      <div style={{ width: 400, height: 300, containerType: 'size' }}>
        {children}
      </div>
    </TestProviders>
  )
}
