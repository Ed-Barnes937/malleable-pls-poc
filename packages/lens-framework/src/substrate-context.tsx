import { createContext, useContext } from 'react'
import type { SubstrateReader, SubstrateWriter } from './substrate-contract'

const SubstrateCtx = createContext<SubstrateReader | null>(null)
const MutationCtx = createContext<SubstrateWriter | null>(null)
const BoardCtx = createContext<string | null>(null)

export function SubstrateProvider({
  reader,
  writer,
  boardId,
  children,
}: {
  reader: SubstrateReader
  writer?: SubstrateWriter
  /** The board (workspace) the panel sits on; writes made here run that board's automations. */
  boardId?: string | null
  children: React.ReactNode
}) {
  return (
    <SubstrateCtx.Provider value={reader}>
      <MutationCtx.Provider value={writer ?? null}>
        <BoardCtx.Provider value={boardId ?? null}>
          {children}
        </BoardCtx.Provider>
      </MutationCtx.Provider>
    </SubstrateCtx.Provider>
  )
}

/**
 * The board the calling panel sits on, or null outside a board (e.g. a
 * component test). Writers pass it with mutations so board-specific
 * automation copies (e.g. one switched off on this board) take effect.
 */
export function useBoardId(): string | null {
  return useContext(BoardCtx)
}

export function useSubstrate(): SubstrateReader {
  const ctx = useContext(SubstrateCtx)
  if (!ctx) {
    throw new Error('useSubstrate must be used within a SubstrateProvider')
  }
  return ctx
}

export function useSubstrateMutations(): SubstrateWriter {
  const ctx = useContext(MutationCtx)
  if (!ctx) {
    throw new Error(
      'useSubstrateMutations is only available in tool panels. ' +
      'View lenses cannot perform mutations.',
    )
  }
  return ctx
}
