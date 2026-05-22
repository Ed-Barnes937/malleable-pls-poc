import { useState, useCallback, type ReactNode } from 'react'
import { SubstrateProvider } from '@pls/lens-framework'
import type { SubstrateWriter, QueryResult, MutationHandle } from '@pls/lens-framework'
import type {
  Recording,
  TranscriptSegment,
  Tag,
  Annotation,
  NewTag,
  NewAnnotation,
} from '@pls/substrate'

function ok<T>(data: T): QueryResult<T> {
  return { data, isLoading: false, error: null }
}

function empty<T>(): QueryResult<T[]> {
  return { data: [], isLoading: false, error: null }
}

const MOCK_RECORDING: Recording = {
  id: 'rec-1',
  title: 'Intro to Machine Learning — Lecture 3',
  created_at: '2026-05-20T10:00:00Z',
  duration: 3600000,
  audio_url: null,
  status: 'complete',
}

const MOCK_SEGMENTS: TranscriptSegment[] = [
  { id: 'seg-1', recording_id: 'rec-1', start_ms: 0, end_ms: 15000, text: 'Welcome back everyone. Today we\'re continuing our exploration of supervised learning, specifically focusing on gradient descent and how it underpins most modern optimization.', speaker: 'Dr. Chen' },
  { id: 'seg-2', recording_id: 'rec-1', start_ms: 15000, end_ms: 32000, text: 'Recall from last lecture that we defined the cost function J of theta. The key idea is that we want to find the parameters theta that minimize this function.', speaker: 'Dr. Chen' },
  { id: 'seg-3', recording_id: 'rec-1', start_ms: 32000, end_ms: 48000, text: 'The gradient tells us the direction of steepest ascent. So to minimize, we move in the opposite direction — the negative gradient.', speaker: 'Dr. Chen' },
  { id: 'seg-4', recording_id: 'rec-1', start_ms: 48000, end_ms: 65000, text: 'Quick question — how do we know the learning rate is right? If it\'s too large we might overshoot, and if it\'s too small we converge very slowly.', speaker: 'Student' },
  { id: 'seg-5', recording_id: 'rec-1', start_ms: 65000, end_ms: 90000, text: 'Great question. In practice, we often use adaptive learning rates. Methods like Adam or RMSProp adjust the rate per parameter based on the history of gradients.', speaker: 'Dr. Chen' },
  { id: 'seg-6', recording_id: 'rec-1', start_ms: 90000, end_ms: 110000, text: 'Let me show you what happens with a learning rate that\'s too large. See how the loss oscillates wildly and never converges?', speaker: 'Dr. Chen' },
  { id: 'seg-7', recording_id: 'rec-1', start_ms: 110000, end_ms: 130000, text: 'Now with a well-tuned rate, the loss smoothly decreases. This is what we want — steady convergence toward the minimum.', speaker: 'Dr. Chen' },
  { id: 'seg-8', recording_id: 'rec-1', start_ms: 130000, end_ms: 150000, text: 'What about local minima? Can gradient descent get stuck in a suboptimal solution?', speaker: 'Student' },
  { id: 'seg-9', recording_id: 'rec-1', start_ms: 150000, end_ms: 180000, text: 'In low dimensions, yes, local minima are a real concern. But in high-dimensional spaces, most critical points are saddle points, not local minima. Stochastic gradient descent handles these surprisingly well.', speaker: 'Dr. Chen' },
  { id: 'seg-10', recording_id: 'rec-1', start_ms: 180000, end_ms: 200000, text: 'For your homework, implement batch gradient descent on the provided dataset. Compare convergence rates with mini-batch and stochastic variants.', speaker: 'Dr. Chen' },
  { id: 'seg-11', recording_id: 'rec-1', start_ms: 200000, end_ms: 220000, text: 'I\'m confused about the difference between batch and mini-batch. Aren\'t they the same thing with different sizes?', speaker: 'Student' },
  { id: 'seg-12', recording_id: 'rec-1', start_ms: 220000, end_ms: 250000, text: 'Essentially, yes. Batch uses the entire dataset per update. Mini-batch uses a subset. The tradeoff is between gradient accuracy and computational cost per step. In practice, mini-batch tends to generalize better due to the noise in gradient estimates.', speaker: 'Dr. Chen' },
]

const INITIAL_TAGS: Tag[] = [
  { id: 'tag-1', target_type: 'transcript_segment', target_id: 'seg-3', label: 'key-point', created_at: '2026-05-20T10:05:00Z' },
  { id: 'tag-2', target_type: 'transcript_segment', target_id: 'seg-5', label: 'key-point', created_at: '2026-05-20T10:08:00Z' },
  { id: 'tag-3', target_type: 'transcript_segment', target_id: 'seg-4', label: 'question', created_at: '2026-05-20T10:06:00Z' },
  { id: 'tag-4', target_type: 'transcript_segment', target_id: 'seg-11', label: 'confused', created_at: '2026-05-20T10:20:00Z' },
]

const INITIAL_ANNOTATIONS: Annotation[] = [
  { id: 'ann-1', anchor_type: 'transcript_segment', anchor_id: 'seg-2', anchor_start_ms: null, anchor_end_ms: null, body: 'Review the cost function definition from lecture 2', created_at: '2026-05-20T10:03:00Z', author_id: 'dev-user-1' },
  { id: 'ann-2', anchor_type: 'transcript_segment', anchor_id: 'seg-9', anchor_start_ms: null, anchor_end_ms: null, body: 'This is key — saddle points vs local minima in high dimensions', created_at: '2026-05-20T10:15:00Z', author_id: 'dev-user-1' },
  { id: 'ann-3', anchor_type: 'transcript_segment', anchor_id: 'seg-10', anchor_start_ms: null, anchor_end_ms: null, body: 'TODO: implement all three variants for comparison', created_at: '2026-05-20T10:18:00Z', author_id: 'dev-user-1' },
]

let nextTagId = 100
let nextAnnId = 100

export function MockSubstrateProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Tag[]>(INITIAL_TAGS)
  const [annotations, setAnnotations] = useState<Annotation[]>(INITIAL_ANNOTATIONS)

  const createTag = useCallback((input: NewTag) => {
    const tag: Tag = {
      id: `tag-${++nextTagId}`,
      ...input,
      created_at: new Date().toISOString(),
    }
    setTags((prev) => [...prev, tag])
  }, [])

  const createAnnotation = useCallback((input: NewAnnotation) => {
    const ann: Annotation = {
      id: `ann-${++nextAnnId}`,
      anchor_type: input.anchor_type,
      anchor_id: input.anchor_id,
      anchor_start_ms: input.anchor_start_ms ?? null,
      anchor_end_ms: input.anchor_end_ms ?? null,
      body: input.body,
      created_at: new Date().toISOString(),
      author_id: 'dev-user-1',
    }
    setAnnotations((prev) => [...prev, ann])
  }, [])

  const writer: SubstrateWriter = {
    useRecordings: () => ok([MOCK_RECORDING]),
    useRecording: () => ok(MOCK_RECORDING),
    useTranscript: () => ok(MOCK_SEGMENTS),
    useTags: () => ok(tags),
    useTagsForTarget: () => empty(),
    useAnnotations: () => ok(annotations),
    useConfidence: () => empty(),
    useConnections: () => empty(),
    useRecordingConnections: () => empty(),
    useWeeklyOverview: () => empty(),
    useGapAnalysis: () => empty(),
    useWeakestTopics: () => empty(),
    useCreateTag: () => ({
      mutate: createTag,
      mutateAsync: async (input) => { createTag(input); return input as any },
      isPending: false,
    }),
    useDeleteTag: () => ({
      mutate: () => {},
      mutateAsync: async () => {},
      isPending: false,
    }),
    useCreateAnnotation: () => ({
      mutate: createAnnotation,
      mutateAsync: async (input) => { createAnnotation(input); return input as any },
      isPending: false,
    }),
    useRecordConfidence: () => ({
      mutate: () => {},
      mutateAsync: async () => ({} as any),
      isPending: false,
    }),
  }

  return (
    <SubstrateProvider reader={writer} writer={writer}>
      {children}
    </SubstrateProvider>
  )
}
