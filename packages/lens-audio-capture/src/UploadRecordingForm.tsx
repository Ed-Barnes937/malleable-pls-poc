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
      className="flex w-full max-w-xs flex-col gap-1.5 @tall:gap-2"
    >
      <p className="flex items-center gap-1.5 truncate text-[10px] text-neutral-500">
        <FileAudio className="h-3 w-3 shrink-0" />
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
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25 disabled:opacity-40"
        >
          Upload
        </button>
      </div>
    </form>
  )
}
