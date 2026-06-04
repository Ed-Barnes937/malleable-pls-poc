import React, {
  createContext,
  lazy,
  useContext,
  useMemo,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import type { LensProps } from './types'
import type { PanelManifest } from './substrate-contract'

export type LensLoader = () => Promise<{
  default: ComponentType<LensProps>
}>

export type LensRegistry = Record<string, LensLoader>

const LensRegistryContext = createContext<LensRegistry>({})
const ManifestContext = createContext<PanelManifest[]>([])

export function ManifestRegistryProvider({
  manifests,
  children,
}: {
  manifests: PanelManifest[]
  children: ReactNode
}) {
  const registry = useMemo(() => {
    const reg: LensRegistry = {}
    for (const m of manifests) {
      reg[m.id] = m.load
    }
    return reg
  }, [manifests])

  return (
    <ManifestContext.Provider value={manifests}>
      <LensRegistryContext.Provider value={registry}>
        {children}
      </LensRegistryContext.Provider>
    </ManifestContext.Provider>
  )
}

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

export function useManifests(): PanelManifest[] {
  return useContext(ManifestContext)
}

export function useManifest(id: string): PanelManifest | undefined {
  const manifests = useManifests()
  return useMemo(() => manifests.find((m) => m.id === id), [manifests, id])
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
