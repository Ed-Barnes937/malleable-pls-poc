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
