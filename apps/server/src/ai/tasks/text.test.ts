import { describe, it, expect } from 'vitest'
import { extractiveSummary, keyPhrase, sentences } from './text'
import { mockTranscriptSegments } from '../transcriber'

// Lines from the seeded Mitochondrial DNA lecture (002_seed.sql, rec-bio-4).
const SEG_04 = 'Here\'s the critical point: mitochondrial DNA is inherited exclusively from the maternal line. The egg cell contributes all the mitochondria.'
const SEG_05 = 'The sperm cell\'s mitochondria are tagged for destruction after fertilization. This is called maternal inheritance.'
const SEG_08 = 'Let\'s talk about mitochondrial diseases. Because there\'s no recombination, harmful mutations can\'t be \'diluted out\' by mixing with healthy copies.'

describe('keyPhrase', () => {
  it('takes the concept a lecturer names in the moment', () => {
    expect(keyPhrase(SEG_05)).toBe('maternal inheritance')
    expect(keyPhrase('Cells make energy through what we call oxidative phosphorylation.')).toBe('oxidative phosphorylation')
    expect(keyPhrase('This process is known as the Krebs cycle, and it runs in the matrix.')).toBe('krebs cycle')
  })

  it('takes a concept named right after the moment when the moment names none', () => {
    expect(keyPhrase(SEG_04, { after: SEG_05 })).toBe('maternal inheritance')
  })

  it('ignores a concept named after the moment when the moment does not touch it', () => {
    expect(keyPhrase('Mitochondria carry their own small circular genome.', { after: SEG_05 })).not.toBe('maternal inheritance')
  })

  it('otherwise picks the weightiest short phrase of the moment', () => {
    expect(keyPhrase(SEG_08)).toBe('mitochondrial diseases')
  })

  it('never returns an empty topic', () => {
    expect(keyPhrase('Okay, so, um, right.')).toBe('this moment')
  })
})

describe('extractiveSummary', () => {
  it('picks three content sentences in lecture order, skipping greetings', () => {
    const text = mockTranscriptSegments.map((s) => s.text).join(' ')
    const lines = extractiveSummary(text, 3)
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => /^welcome/i.test(l))).toBe(false)
    const all = sentences(text)
    const positions = lines.map((l) => all.indexOf(l))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('is deterministic and follows the input', () => {
    const text = 'Enzymes speed up reactions by lowering activation energy. Enzymes bind substrates at the active site. Temperature changes how enzymes fold and work.'
    expect(extractiveSummary(text)).toEqual(extractiveSummary(text))
    expect(extractiveSummary(text).join(' ')).toMatch(/enzymes/i)
  })

  it('clips long sentences at a word boundary', () => {
    const long = `${'Mitochondrial genomes '.repeat(12)}are small.`
    const [line] = extractiveSummary(long, 1)
    expect(line.length).toBeLessThanOrEqual(143)
    expect(line.endsWith('...')).toBe(true)
  })
})
