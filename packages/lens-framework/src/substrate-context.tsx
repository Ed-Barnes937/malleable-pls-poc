import { createContext, useContext } from 'react'
import type { SubstrateReader, SubstrateWriter } from './substrate-contract'

const SubstrateCtx = createContext<SubstrateReader | null>(null)
const MutationCtx = createContext<SubstrateWriter | null>(null)

export function SubstrateProvider({
  reader,
  writer,
  children,
}: {
  reader: SubstrateReader
  writer?: SubstrateWriter
  children: React.ReactNode
}) {
  return (
    <SubstrateCtx.Provider value={reader}>
      <MutationCtx.Provider value={writer ?? null}>
        {children}
      </MutationCtx.Provider>
    </SubstrateCtx.Provider>
  )
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
