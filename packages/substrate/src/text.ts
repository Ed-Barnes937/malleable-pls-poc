// Small, deterministic text heuristics. The mock-mode LLM fakes use them to
// derive plausible output from whatever transcript they are given, so mock
// screenshots read like the lecture on screen (and keep doing so when the
// transcript changes). `keyPhrase` + `topicLabel` also name weak topics on
// the live path (no LLM call; see aggregates.weakestTopics).

const STOPWORDS = new Set(`
a about above after again against all almost also always am an and any are as at be because been before being
below between both but by can could did do does doing down during each even ever every few for from further get
gets getting go goes going gone got had has have having he her here hers him his how i if in into is it its
itself just let lets like make makes many may me might more most much must my no nor not now of off on once only
or other our out over own quite rather really right same she should so some such than that the their them then
there these they this those through to too under until up us very was way we well were what when where which
while who whom why will with would yet you your yours okay ok um uh actually basically remember see look looking
today next last week call called calls means mean meaning known refer referred term part point thing things kind
sort lot bit something someone people find found tricky important critical key now new one two three first
second welcome hello morning lecture talk talking continue continuing discussion focus unusual
`.trim().split(/\s+/))

/** Phrases a lecturer uses right before naming a concept: "this is called X". */
const DEFINITION_CUES = [
  /\b(?:is|are) called\s+([^.,;:!?]+)/i,
  /\bwe call (?:this|that|it)?\s*([^.,;:!?]+)/i,
  /\bwhat we call\s+([^.,;:!?]+)/i,
  /\bknown as\s+([^.,;:!?]+)/i,
  /\breferred to as\s+([^.,;:!?]+)/i,
  /\bthe term\s+([^.,;:!?]+)/i,
]

const MAX_TOPIC_WORDS = 3

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []
}

function isContent(word: string): boolean {
  const base = word.replace(/'s$/, '')
  // Contractions ("can't", "it'll") are never the topic.
  return word.length > 2 && !base.includes("'") && !STOPWORDS.has(base)
}

/** Runs of consecutive content words, split at stopwords and punctuation. */
function candidatePhrases(text: string): string[][] {
  const phrases: string[][] = []
  for (const clause of text.split(/[.,;:!?()"\u2014-]+/)) {
    let run: string[] = []
    for (const word of words(clause)) {
      if (isContent(word)) {
        run.push(word.replace(/'s$/, ''))
      } else if (run.length) {
        phrases.push(run)
        run = []
      }
    }
    if (run.length) phrases.push(run)
  }
  return phrases
}

function cuePhrase(text: string): string | null {
  for (const cue of DEFINITION_CUES) {
    const match = cue.exec(text)
    if (!match) continue
    const phrase = words(match[1]).filter((w, i, all) => isContent(w) || (i > 0 && i < all.length - 1))
    const trimmed = phrase.slice(0, MAX_TOPIC_WORDS)
    while (trimmed.length && !isContent(trimmed[trimmed.length - 1])) trimmed.pop()
    if (trimmed.length) return trimmed.join(' ')
  }
  return null
}

/**
 * A short topic for a transcript moment, e.g. "maternal inheritance".
 * Prefers a concept the lecturer names in the moment ("this is called X"),
 * then one named right after it, then the moment's weightiest phrase
 * (longer words, and words the surrounding lecture repeats, weigh more).
 */
export function keyPhrase(moment: string, context: { before?: string; after?: string } = {}): string {
  const named = cuePhrase(moment)
  if (named) return named
  // A concept named just after counts only if the moment already touches it
  // ("...the maternal line." then "This is called maternal inheritance.").
  const namedNext = context.after ? cuePhrase(context.after) : null
  if (namedNext) {
    const momentWords = new Set(words(moment).filter(isContent))
    if (namedNext.split(' ').some((w) => momentWords.has(w))) return namedNext
  }

  const frequency = new Map<string, number>()
  for (const word of words([context.before, moment, context.after].filter(Boolean).join(' '))) {
    frequency.set(word, (frequency.get(word) ?? 0) + 1)
  }
  let best: { phrase: string[]; score: number } | null = null
  for (const run of candidatePhrases(moment)) {
    // Long runs are split into overlapping windows so a topic stays short.
    const windows = run.length <= MAX_TOPIC_WORDS
      ? [run]
      : run.slice(0, run.length - 1).map((_, i) => run.slice(i, i + 2))
    for (const phrase of windows) {
      const score = phrase.reduce((sum, w) => sum + w.length + 2 * ((frequency.get(w) ?? 1) - 1), 0)
      if (!best || score > best.score) best = { phrase, score }
    }
  }
  return best ? best.phrase.join(' ') : 'this moment'
}

/** Sentences of `text`, trimmed, without empty ones. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 0)
}

const MAX_LINE_CHARS = 140

function clip(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line
  const cut = line.slice(0, MAX_LINE_CHARS)
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`
}

/**
 * An extractive summary: the `count` sentences whose words the whole text
 * repeats most (Luhn-style), in their original order. Greetings, questions and
 * very short sentences are skipped.
 */
export function extractiveSummary(text: string, count = 3): string[] {
  const frequency = new Map<string, number>()
  for (const word of words(text)) {
    if (isContent(word)) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  }
  const scored = sentences(text)
    .map((sentence, index) => {
      const content = words(sentence).filter(isContent)
      const score = content.reduce((sum, w) => sum + (frequency.get(w) ?? 0), 0) / Math.sqrt(content.length || 1)
      return { sentence, index, score, size: words(sentence).length }
    })
    .filter((s) => s.size >= 6 && !s.sentence.endsWith('?') && !/^(welcome|hello|hi|good (morning|afternoon))\b/i.test(s.sentence))
  const chosen = [...scored].sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count)
  return chosen.sort((a, b) => a.index - b.index).map((s) => clip(s.sentence))
}

/**
 * A key phrase as a label for display: each word in the casing the lecture
 * used for it ("atp" -> "ATP") and a capital first letter, e.g.
 * "Maternal inheritance".
 */
export function topicLabel(phrase: string, source: string): string {
  const cased = new Map<string, string>()
  for (const word of source.match(/[A-Za-z][A-Za-z'-]*/g) ?? []) {
    const lower = word.toLowerCase()
    // An acronym or a name ("ATP", "Krebs") everywhere, not just at a sentence start.
    if (word.slice(1) !== lower.slice(1) && !cased.has(lower)) cased.set(lower, word)
  }
  const label = phrase.split(' ').map((w) => cased.get(w) ?? w).join(' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}
