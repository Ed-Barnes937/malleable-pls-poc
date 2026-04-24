import { describe, it, expect } from 'vitest'
import React, { Suspense, type ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import {
  LensRegistryProvider,
  useLensRegistry,
  getLensComponent,
  PlaceholderLens,
} from './registry'
import type { LensProps } from './types'

function TestLens({ panelId }: LensProps) {
  return <div data-testid="test-lens">lens:{panelId}</div>
}

function makeRegistry() {
  return {
    'test-lens': async () => ({ default: TestLens as ComponentType<LensProps> }),
  }
}

describe('LensRegistryProvider', () => {
  it('renders children', () => {
    render(
      <LensRegistryProvider registry={{}}>
        <div>hello</div>
      </LensRegistryProvider>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})

describe('useLensRegistry', () => {
  it('returns the provided registry', () => {
    const registry = makeRegistry()
    let captured: ReturnType<typeof useLensRegistry> | undefined
    function Probe() {
      captured = useLensRegistry()
      return null
    }
    render(
      <LensRegistryProvider registry={registry}>
        <Probe />
      </LensRegistryProvider>,
    )
    expect(captured).toBe(registry)
  })

  it('returns an empty registry when no provider is present', () => {
    let captured: ReturnType<typeof useLensRegistry> | undefined
    function Probe() {
      captured = useLensRegistry()
      return null
    }
    render(<Probe />)
    expect(captured).toEqual({})
  })
})

describe('getLensComponent', () => {
  it('returns a lazy component for a valid lens type', async () => {
    const registry = makeRegistry()
    const Comp = getLensComponent('test-lens', registry)
    render(
      <Suspense fallback={<div>loading</div>}>
        <Comp panelId="p1" scope={{}} config={{}} />
      </Suspense>,
    )
    expect(await screen.findByTestId('test-lens')).toHaveTextContent('lens:p1')
  })

  it('caches components — same type returns same reference', () => {
    const registry = makeRegistry()
    const a = getLensComponent('test-lens', registry)
    const b = getLensComponent('test-lens', registry)
    expect(a).toBe(b)
  })

  it('returns PlaceholderLens for unknown lens types', async () => {
    const Comp = getLensComponent('does-not-exist', {})
    render(
      <Suspense fallback={<div>loading</div>}>
        <Comp panelId="p1" scope={{}} config={{ lensType: 'does-not-exist' }} />
      </Suspense>,
    )
    expect(await screen.findByText(/does-not-exist/)).toBeInTheDocument()
  })
})

describe('PlaceholderLens', () => {
  it('renders without crashing', () => {
    render(<PlaceholderLens panelId="p1" scope={{}} config={{ lensType: 'mystery' }} />)
    expect(screen.getByText(/mystery/)).toBeInTheDocument()
  })

  it('renders a fallback label when lensType is missing from config', () => {
    render(<PlaceholderLens panelId="p1" scope={{}} config={{}} />)
    expect(screen.getByText(/unknown/i)).toBeInTheDocument()
  })
})
