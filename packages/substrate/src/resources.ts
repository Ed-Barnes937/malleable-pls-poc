/**
 * Resources: links and markdown notes (files later) a student keeps for a
 * course or a lecture. Shared by the server router, the CT backend simulator
 * and the Resources widget, so all three accept, reject and label the same
 * things.
 */
import { z } from 'zod'

export type ResourceKind = 'link' | 'note' | 'file'

/** What a link points at, recognised from its URL alone (no network). */
export type ResourceProvider =
  | 'google_doc'
  | 'google_sheet'
  | 'google_slides'
  | 'google_form'
  | 'google_drive'
  | 'web'

/** Longest URL a link may have. */
export const MAX_RESOURCE_URL_LENGTH = 2048
/** Longest note body, in characters. */
export const MAX_NOTE_LENGTH = 200_000
/** Longest title. */
export const MAX_RESOURCE_TITLE_LENGTH = 500
/** Title a note gets when the student doesn't give one. */
export const UNTITLED_NOTE = 'Untitled note'

export interface ParsedResourceUrl {
  /** The URL, normalised by the URL parser (e.g. a lower-case host). */
  url: string
  provider: ResourceProvider
  /** What it is, e.g. "Google Sheet", "Drive folder", or the host for a web page. */
  label: string
  /** Host without a leading "www.". */
  hostname: string
}

const GOOGLE_DOCS: { path: RegExp; provider: ResourceProvider; label: string }[] = [
  { path: /^\/document\/d\/[\w-]+/, provider: 'google_doc', label: 'Google Doc' },
  { path: /^\/spreadsheets\/d\/[\w-]+/, provider: 'google_sheet', label: 'Google Sheet' },
  { path: /^\/presentation\/d\/[\w-]+/, provider: 'google_slides', label: 'Google Slides' },
  { path: /^\/forms\/d\/(?:e\/)?[\w-]+/, provider: 'google_form', label: 'Google Form' },
]

/**
 * Recognises a link a student pasted. Returns null for anything that isn't
 * an absolute http(s) URL of at most MAX_RESOURCE_URL_LENGTH characters
 * (`javascript:`, `data:`, relative, malformed). Google Docs, Sheets, Slides,
 * Forms and Drive files and folders are recognised by host and path,
 * including account-switched paths (`/u/0/`), query strings and fragments;
 * anything else is a `web` link labelled by its host.
 */
export function parseResourceUrl(raw: string): ParsedResourceUrl | null {
  const text = raw.trim()
  if (!text || text.length > MAX_RESOURCE_URL_LENGTH) return null
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  const url = parsed.toString()
  if (url.length > MAX_RESOURCE_URL_LENGTH) return null
  const host = parsed.hostname.toLowerCase()
  const hostname = host.replace(/^www\./, '')
  // "/u/1/" picks one of several signed-in Google accounts; it doesn't change the file.
  const path = parsed.pathname.replace(/\/u\/\d+(?=\/)/g, '')

  if (host === 'docs.google.com') {
    for (const doc of GOOGLE_DOCS) {
      if (doc.path.test(path)) return { url, provider: doc.provider, label: doc.label, hostname }
    }
  }
  if (host === 'drive.google.com') {
    if (/^\/file\/d\/[\w-]+/.test(path) || (path === '/open' && parsed.searchParams.has('id'))) {
      return { url, provider: 'google_drive', label: 'Drive file', hostname }
    }
    if (/^\/drive\/folders\/[\w-]+/.test(path)) {
      return { url, provider: 'google_drive', label: 'Drive folder', hostname }
    }
  }
  return { url, provider: 'web', label: hostname, hostname }
}

/** What a link is, for its row: "Google Sheet", "Drive folder", or the host. */
export function resourceLinkLabel(url: string | null): string {
  return (url && parseResourceUrl(url)?.label) || 'Link'
}

/**
 * A short plain-text preview of a markdown note for a list row: markup
 * removed, whitespace collapsed, cut at `max` characters on a word break.
 */
export function noteExcerpt(markdown: string, max = 140): string {
  const text = markdown
    // Fenced code: keep the code, drop the fences.
    .replace(/^\s*(```|~~~).*$/gm, ' ')
    // Images and links keep their text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Raw HTML tags.
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    // Line-start markers: headings, quotes, list bullets, task boxes, rules, table rules.
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?)/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
    .replace(/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    // Emphasis, strikethrough and inline code markers.
    .replace(/(\*\*|__|~~|\*|_|`)/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * A resource as lists show it: no note body (`excerpt` instead). It is filed
 * under a lecture (`lecture_id`, its course is `lecture_course`), a course
 * (`course`), or neither (unfiled); never both.
 */
export interface Resource {
  id: string
  kind: ResourceKind
  title: string
  url: string | null
  provider: ResourceProvider | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  lecture_id: string | null
  /** The course it is filed under directly; null for a lecture's resource. */
  course: string | null
  /** The lecture's title and course, for a lecture's resource. */
  lecture_title: string | null
  lecture_course: string | null
  /** Plain-text start of a note, for its row; null for other kinds. */
  excerpt: string | null
  created_at: string
  updated_at: string
}

/** One resource with its note body, as `resources.get` returns it. */
export interface ResourceWithBody extends Resource {
  body_md: string | null
}

/** The course a resource is in: its own, or its lecture's. */
export function resourceCourse(resource: Pick<Resource, 'course' | 'lecture_course' | 'lecture_id'>): string | null {
  return resource.lecture_id ? resource.lecture_course : resource.course
}

// ---------------------------------------------------------------------------
// Input schemas (server router and CT simulator)
// ---------------------------------------------------------------------------

export const resourceIdInput = z.string().max(255)
const courseInput = z.string().max(100)
const lectureIdInput = z.string().max(255)
const titleInput = z.string().trim().min(1).max(MAX_RESOURCE_TITLE_LENGTH)
const urlInput = z.string().trim().min(1).max(MAX_RESOURCE_URL_LENGTH)
const workspaceIdInput = z.string().max(255).nullable().optional()

/** `resources.list`: the board course and selected lecture, both optional. */
export const resourceListInput = z
  .object({ courseTag: courseInput.optional(), lectureId: lectureIdInput.optional() })
  .optional()

/**
 * Where a new resource goes: a lecture, else a course, else unfiled. Giving
 * both is refused (a lecture's resources take its course).
 */
const attachInput = {
  courseTag: courseInput.nullable().optional(),
  lectureId: lectureIdInput.nullable().optional(),
  workspaceId: workspaceIdInput,
}

export const newResourceLinkInput = z.object({ url: urlInput, title: titleInput.optional(), ...attachInput })
export const newResourceNoteInput = z.object({
  title: titleInput.optional(),
  body_md: z.string().max(MAX_NOTE_LENGTH).optional(),
  ...attachInput,
})

/**
 * A change to one resource. Setting `lectureId` files it under that lecture
 * (clearing its course), setting `courseTag` files it under the course
 * (clearing its lecture); null for both unfiles it. `expectedUpdatedAt` is
 * the `updated_at` the client last read: the server refuses with CONFLICT if
 * the resource changed since.
 */
export const resourceUpdateInput = z.object({
  id: resourceIdInput,
  patch: z.object({
    title: titleInput.optional(),
    url: urlInput.optional(),
    body_md: z.string().max(MAX_NOTE_LENGTH).optional(),
    courseTag: courseInput.nullable().optional(),
    lectureId: lectureIdInput.nullable().optional(),
  }),
  // A Date over the wire (superjson), or an ISO string.
  expectedUpdatedAt: z.union([z.date(), z.iso.datetime({ offset: true })]).transform((v) => new Date(v)).optional(),
})

export type ResourceListQuery = NonNullable<z.input<typeof resourceListInput>>
export type NewResourceLink = z.input<typeof newResourceLinkInput>
export type NewResourceNote = z.input<typeof newResourceNoteInput>
export type ResourceUpdate = z.input<typeof resourceUpdateInput>

// ---------------------------------------------------------------------------
// Files (04 PR B)
// ---------------------------------------------------------------------------

/** Biggest file a student can upload as a resource. */
export const MAX_RESOURCE_FILE_BYTES = 20 * 1024 * 1024

/** A kind of file a resource can be: its MIME type, extensions, short name, and whether the browser may show it in the tab. */
export interface ResourceFileType {
  mime: string
  extensions: string[]
  /** What a row calls it: "PDF", "Word". */
  label: string
  /** Served `inline` (PDF, images); the rest are downloaded. */
  inline: boolean
}

/**
 * What can be uploaded. No HTML, SVG, audio or video: nothing a browser would
 * run, and recordings have their own route.
 */
export const RESOURCE_FILE_TYPES: readonly ResourceFileType[] = [
  { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF', inline: true },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'], label: 'Word', inline: false },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['pptx'], label: 'PowerPoint', inline: false },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'], label: 'Excel', inline: false },
  { mime: 'image/png', extensions: ['png'], label: 'PNG', inline: true },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG', inline: true },
  { mime: 'text/plain', extensions: ['txt'], label: 'Text', inline: false },
  { mime: 'text/markdown', extensions: ['md'], label: 'Markdown', inline: false },
]

/** The type for a MIME type (parameters like `; charset` ignored), or null if it isn't allowed. */
export function resourceFileTypeByMime(mime: string | null | undefined): ResourceFileType | null {
  const bare = (mime ?? '').split(';')[0].trim().toLowerCase()
  return RESOURCE_FILE_TYPES.find((t) => t.mime === bare) ?? null
}

/** The type for a file name's extension, or null if it isn't allowed. */
export function resourceFileTypeByName(name: string): ResourceFileType | null {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return RESOURCE_FILE_TYPES.find((t) => t.extensions.includes(ext)) ?? null
}

/** For an `<input type="file" accept>`. */
export const RESOURCE_FILE_ACCEPT = RESOURCE_FILE_TYPES.flatMap((t) => t.extensions.map((e) => `.${e}`)).join(',')

/** "1.2 MB", "340 KB", "12 B". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A file row's meta: "PDF · 1.2 MB". */
export function resourceFileMeta(resource: Pick<Resource, 'mime_type' | 'size_bytes'>): string {
  const label = resourceFileTypeByMime(resource.mime_type)?.label ?? 'File'
  return resource.size_bytes == null ? label : `${label} · ${formatFileSize(resource.size_bytes)}`
}

/** Why a picked file can't be uploaded (worded for the student), or null if it can. Checked in the browser before sending; the server checks again. */
export function resourceFileProblem(file: { name: string; size: number }): string | null {
  if (!resourceFileTypeByName(file.name)) return "That file type isn't supported. Use PDF, Word, PowerPoint, Excel, PNG, JPEG, text or Markdown."
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_RESOURCE_FILE_BYTES) return `That file is over ${MAX_RESOURCE_FILE_BYTES / 1024 / 1024} MB.`
  return null
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b)
}

/**
 * True when the bytes look like the type they were uploaded as: the format's
 * signature, and for plain text and Markdown, valid UTF-8 without NUL bytes.
 * The signature only separates, say, an .exe renamed to .pdf from a PDF; it
 * is not a scan of the contents. Word, PowerPoint and Excel files are zip
 * archives, which hold a `[Content_Types].xml`.
 */
export function matchesFileContent(type: ResourceFileType, body: Uint8Array): boolean {
  switch (type.mime) {
    case 'application/pdf':
      return startsWith(body, [0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
    case 'image/png':
      return startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return startsWith(body, [0xff, 0xd8, 0xff])
    case 'text/plain':
    case 'text/markdown':
      if (body.includes(0)) return false
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(body)
        return true
      } catch {
        return false
      }
    default:
      // docx, pptx, xlsx
      return startsWith(body, [0x50, 0x4b, 0x03, 0x04]) && new TextDecoder('latin1').decode(body).includes('[Content_Types].xml')
  }
}

/** A title for an uploaded file: its name without the extension. */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).trim() || name.trim() || 'File'
  return base.slice(0, MAX_RESOURCE_TITLE_LENGTH)
}

/** What `resources.fileUrl` answers with: a path (with its signature) on the API, valid for a few minutes. */
export interface ResourceFileUrl {
  url: string
}
