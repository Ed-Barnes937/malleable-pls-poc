import { TestProviders } from './mount-wrapper'

export function AudioCaptureHarness({ children }: { children: React.ReactNode }) {
  return (
    <TestProviders>
      <div style={{ width: 400, height: 300, containerType: 'size' }}>
        {children}
      </div>
    </TestProviders>
  )
}
