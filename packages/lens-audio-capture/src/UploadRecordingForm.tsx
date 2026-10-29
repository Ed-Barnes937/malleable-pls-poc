import { useState, type FormEvent } from 'react'
import { COURSES, Select, TextField } from '@pls/shared-ui'
import { FileAudio } from 'lucide-react'
import { titleFromFilename } from './uploadRecording'

export interface UploadRecordingDetails {
  title: string
  course: string | null
}

interface UploadRecordingFormProps {
  file: File
  /** Pre-selected course, typically the workspace's course filter. */
  defaultCourse?: string
  onSubmit: (details: UploadRecordingDetails) => void
  onCancel: () => void
}

/** Title + course details for a picked audio file before it is uploaded. */
export function UploadRecordingForm({ file, defaultCourse, onSubmit, onCancel }: UploadRecordingFormProps) {
  const [title, setTitle] = useState(() => titleFromFilename(file.name))
  const [course, setCourse] = useState(defaultCourse ?? '')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), course: course || null })
  }

  return (
    <form
      aria-label="Upload a recording"
      onSubmit={handleSubmit}
      className="flex w-full max-w-xs flex-col gap-2"
    >
      <p className="flex items-center gap-1.5 truncate text-meta text-text-muted">
        <FileAudio className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{file.name}</span>
      </p>
      <TextField
        aria-label="Recording title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoFocus
      />
      <Select aria-label="Recording course" value={course} onChange={(e) => setCourse(e.target.value)}>
        <option value="">No course</option>
        {COURSES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-control px-3.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-9 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-40"
        >
          Upload
        </button>
      </div>
    </form>
  )
}
