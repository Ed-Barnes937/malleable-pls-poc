import { describe, it, expect } from 'vitest'
import { extractiveSummary, keyPhrase, sentences, topicLabel } from './text'

// A short lecture in the shape of the mock transcriber's.
const LECTURE = [
  'Welcome back. Today we\'re looking at mitochondrial DNA and why it behaves so differently from the DNA in the nucleus.',
  'Mitochondria carry their own small circular genome, about sixteen and a half thousand base pairs, coding for thirty-seven genes.',
  'Here\'s the part people find tricky. You inherit your mitochondria only from your mother. This is what we call maternal inheritance.',
  'Sperm mitochondria are tagged and destroyed after fertilisation, so the father\'s mitochondrial DNA almost never reaches the embryo.',
  'Because mitochondrial DNA skips recombination, it changes only by mutation, which makes it a useful clock for tracing ancestry.',
  'For Thursday\'s quiz, be ready to explain why mitochondrial diseases pass from a mother to all of her children.',
].join(' ')

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

  it('takes the concept named first when a moment names several', () => {
    // The demo lecture's confusing moment (demo/lecture-mitochondrial-dna.segments.json).
    const demo = 'Now, here is the part people find tricky, so let me try to explain maternal inheritance. You inherit your mitochondria from your mother. '
      + 'And if some of the egg\'s own mitochondria are different from each other, which we call heteroplasmy, then which ones you get is partly down to chance.'
    expect(keyPhrase(demo)).toBe('maternal inheritance')
    expect(keyPhrase('To explain it properly, first a structure that is called the matrix.')).toBe('matrix')
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

  it('never picks a contraction', () => {
    expect(keyPhrase("Harmful mutations can't be diluted.")).toBe('harmful mutations')
  })
})

describe('topicLabel', () => {
  it('capitalises the label and keeps the casing the lecture used', () => {
    expect(topicLabel('maternal inheritance', SEG_05)).toBe('Maternal inheritance')
    expect(topicLabel('drives atp synthase', 'This gradient drives ATP synthase.')).toBe('Drives ATP synthase')
    expect(topicLabel('krebs cycle', 'This is known as the Krebs cycle.')).toBe('Krebs cycle')
  })

  it('keeps a name capitalised anywhere in the label, once the lecture uses it mid-sentence', () => {
    expect(topicLabel('gradient mitchell', 'This gradient was shown by Mitchell.')).toBe('Gradient Mitchell')
    expect(topicLabel('chemiosmosis peter mitchell', 'Peter Mitchell won a Nobel Prize. This is chemiosmosis, as Peter Mitchell showed.'))
      .toBe('Chemiosmosis Peter Mitchell')
  })

  it('ignores capitals that only start a sentence', () => {
    expect(topicLabel('mitochondrial diseases', 'Mitochondrial diseases are rare. Mitochondrial DNA is small.')).toBe('Mitochondrial diseases')
    expect(topicLabel('cell membrane', 'The cell membrane. Cell walls too.')).toBe('Cell membrane')
  })
})

describe('extractiveSummary', () => {
  it('picks three content sentences in lecture order, skipping greetings', () => {
    const text = LECTURE
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
