import { createContext, useContext, type ComponentType, lazy } from 'react'
import type { LensProps } from './types'

export type LazyLensComponent = ComponentType<LensProps>
type LensLoader = () => Promise<{ default: LazyLensComponent }>

function PlaceholderLens({ config }: LensProps) {
  return (
    <div className="flex h-full items-center justify-center text-neutral-500">
      <span className="text-sm">Lens: {(config as Record<string, unknown>).lensType as string ?? 'unknown'}</span>
    </div>
  )
}

const LensRegistryContext = createContext<Record<string, LensLoader>>({})

export function LensRegistryProvider({ registry, children }: { registry: Record<string, LensLoader>; children: React.ReactNode }) {
  return <LensRegistryContext.Provider value={registry}>{children}</LensRegistryContext.Provider>
}

const lensCache = new Map<string, React.LazyExoticComponent<LazyLensComponent>>()

export function getLensComponent(lensType: string, registry: Record<string, LensLoader>): React.LazyExoticComponent<LazyLensComponent> | typeof PlaceholderLens {
  const loader = registry[lensType]
  if (!loader) return PlaceholderLens

  if (!lensCache.has(lensType)) {
    lensCache.set(lensType, lazy(loader))
  }
  return lensCache.get(lensType)!
}

export function useLensRegistry() {
  return useContext(LensRegistryContext)
}
