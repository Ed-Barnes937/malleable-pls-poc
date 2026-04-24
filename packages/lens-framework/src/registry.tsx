import React, {
  createContext,
  lazy,
  useContext,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import type { LensMeta, LensProps } from './types'

export type LensLoader = () => Promise<{
  default: ComponentType<LensProps>
  meta?: LensMeta
}>

export type LensRegistry = Record<string, LensLoader>

const LensRegistryContext = createContext<LensRegistry>({})

export function LensRegistryProvider({
  registry,
  children,
}: {
  registry: LensRegistry
  children: ReactNode
}) {
  return <LensRegistryContext.Provider value={registry}>{children}</LensRegistryContext.Provider>
}

export function useLensRegistry(): LensRegistry {
  return useContext(LensRegistryContext)
}

export function PlaceholderLens({ config }: LensProps) {
  const lensType = (config.lensType as string | undefined) ?? 'unknown'
  return (
    <div className="flex h-full items-center justify-center text-neutral-500">
      <span className="text-sm">Lens: {lensType}</span>
    </div>
  )
}

const lensCache = new Map<string, LazyExoticComponent<ComponentType<LensProps>>>()
const PLACEHOLDER_CACHE_KEY = '__placeholder__'

export function getLensComponent(
  lensType: string,
  registry: LensRegistry,
): LazyExoticComponent<ComponentType<LensProps>> {
  const loader = registry[lensType]

  if (!loader) {
    if (!lensCache.has(PLACEHOLDER_CACHE_KEY)) {
      lensCache.set(
        PLACEHOLDER_CACHE_KEY,
        lazy(async () => ({ default: PlaceholderLens })),
      )
    }
    return lensCache.get(PLACEHOLDER_CACHE_KEY)!
  }

  if (!lensCache.has(lensType)) {
    lensCache.set(
      lensType,
      lazy(async () => {
        const mod = await loader()
        return { default: mod.default }
      }),
    )
  }
  return lensCache.get(lensType)!
}
