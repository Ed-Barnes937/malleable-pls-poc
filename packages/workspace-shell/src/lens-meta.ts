import { Mic, FileText, Brain, BarChart3, Link2, PieChart, AlertTriangle } from 'lucide-react'

export const LENS_META: Record<string, { label: string; icon: typeof FileText; description: string }> = {
  'audio-capture': { label: 'Audio Capture', icon: Mic, description: 'Record & playback' },
  'transcript': { label: 'Transcript', icon: FileText, description: 'Segments & tags' },
  'test-me': { label: 'Test Me', icon: Brain, description: 'Quiz & confidence' },
  'weekly-overview': { label: 'This Week', icon: BarChart3, description: 'Progress by course' },
  'connections': { label: 'Connections', icon: Link2, description: 'Cross-lecture links' },
  'gap-analysis': { label: 'All Courses', icon: PieChart, description: 'Coverage overview' },
  'weakest-topics': { label: 'Weakest Topics', icon: AlertTriangle, description: 'Lowest confidence' },
}
