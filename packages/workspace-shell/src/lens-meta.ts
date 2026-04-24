import { Mic, FileText, Brain, BarChart3, Link2, PieChart, AlertTriangle } from 'lucide-react'
import type { LensCategory } from '@pls/lens-framework'

export const LENS_META: Record<string, { label: string; icon: typeof FileText; description: string; category: LensCategory }> = {
  'audio-capture': { label: 'Audio Capture', icon: Mic, description: 'Record & playback', category: 'tool' },
  'transcript': { label: 'Transcript', icon: FileText, description: 'Segments & tags', category: 'both' },
  'test-me': { label: 'Test Me', icon: Brain, description: 'Quiz & confidence', category: 'both' },
  'weekly-overview': { label: 'This Week', icon: BarChart3, description: 'Progress by course', category: 'view' },
  'connections': { label: 'Connections', icon: Link2, description: 'Cross-lecture links', category: 'view' },
  'gap-analysis': { label: 'All Courses', icon: PieChart, description: 'Coverage overview', category: 'view' },
  'weakest-topics': { label: 'Weakest Topics', icon: AlertTriangle, description: 'Lowest confidence', category: 'view' },
}
