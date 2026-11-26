import type { ComponentProps } from 'react'
import TodoLens from '@pls/lens-todo'
import { notifyToast, useToastStore } from '@pls/workspace-shell'
import { TestProviders } from './mount-wrapper'

/**
 * The To-do widget with the shell's toast bar under it, its notices (Undo
 * toasts) shown there and taken down by key, as on a board. Other props go
 * to the widget.
 */
export function TodoHarness(props: Partial<ComponentProps<typeof TodoLens>>) {
  return (
    <TestProviders toasts>
      <TodoLens
        panelId="test-panel"
        scope={{}}
        config={{}}
        {...props}
        onNotify={notifyToast}
        onDismissNotice={(key) => useToastStore.getState().dismissKey(key)}
      />
    </TestProviders>
  )
}
