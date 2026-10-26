import { describe, it, expect } from 'vitest'
import { createTranscriber } from './transcriber'

describe('createTranscriber', () => {
  it('falls back to the mock when no provider key is configured', () => {
    expect(createTranscriber({}).name).toBe('mock')
  })

  it('uses AssemblyAI when its key is configured', () => {
    expect(createTranscriber({ ASSEMBLYAI_API_KEY: 'test-key' }).name).toBe('assemblyai')
  })
})
