import {
  MAX_RESOURCE_FILE_BYTES,
  UNTITLED_NOTE,
  matchesFileContent,
  newResourceLinkInput,
  newResourceNoteInput,
  noteExcerpt,
  parseResourceUrl,
  resourceFileTypeByMime,
  resourceIdInput,
  resourceListInput,
  resourceUpdateInput,
  titleFromFileName,
  type ResourceFileUrl,
  type ResourceWithBody,
} from '@pls/substrate'
import { SimulatorError, type ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredResource } from '../in-memory-db'
import { requireLecture } from './lectures'
import { requireBoard } from './workspaces'

/** Mirrors `COURSE_LABELS` on the server. */
const COURSE_LABELS = new Set(['biology', 'chemistry', 'physics'])

/** Parses with the server's schema; a refusal is BAD_REQUEST, as tRPC makes it. */
function parse<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
  input: unknown,
): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new SimulatorError('BAD_REQUEST', result.error.issues.map((i) => i.message).join('; '))
  return result.data
}

/** A stored resource as the server returns it: with its lecture's title and course, and an excerpt. */
function resourceRow(db: InMemoryDb, resource: StoredResource): ResourceWithBody {
  const lecture = resource.lecture_id ? db.lectures.find((l) => l.id === resource.lecture_id) : undefined
  return {
    ...resource,
    lecture_title: lecture?.title ?? null,
    lecture_course: lecture?.course ?? null,
    excerpt: resource.kind === 'note' ? noteExcerpt(resource.body_md ?? '') : null,
  }
}

function requireResource(db: InMemoryDb, id: string): StoredResource {
  const resource = db.resources.find((r) => r.id === id)
  if (!resource) throw new SimulatorError('NOT_FOUND', 'Resource not found')
  return resource
}

/** Twin of the server's `attachment`: a lecture or a course, never both. */
function attachment(db: InMemoryDb, lectureId: string | null | undefined, courseTag: string | null | undefined) {
  if (lectureId && courseTag) throw new SimulatorError('BAD_REQUEST', 'A resource goes under a lecture or a course, not both')
  if (lectureId) {
    requireLecture(db, lectureId)
    return { lecture_id: lectureId, course: null }
  }
  if (courseTag) {
    if (!COURSE_LABELS.has(courseTag)) throw new SimulatorError('BAD_REQUEST', 'Unknown course')
    return { lecture_id: null, course: courseTag }
  }
  return { lecture_id: null, course: null }
}

/** A timestamp after `previous`, so every save moves `updated_at` on. */
function nextTimestamp(previous?: string): string {
  const now = Date.now()
  return new Date(previous ? Math.max(now, new Date(previous).getTime() + 1) : now).toISOString()
}

function insert(db: InMemoryDb, fields: Partial<StoredResource> & Pick<StoredResource, 'kind' | 'title'>): ResourceWithBody {
  const at = nextTimestamp()
  const resource: StoredResource = {
    id: `res-${crypto.randomUUID().slice(0, 8)}`,
    url: null,
    provider: null,
    body_md: null,
    file_name: null,
    mime_type: null,
    size_bytes: null,
    lecture_id: null,
    course: null,
    created_at: at,
    updated_at: at,
    ...fields,
  }
  db.resources.push(resource)
  return resourceRow(db, resource)
}

/**
 * Twin of `POST /resource-upload` (the server's `handleResourceUpload`):
 * the same refusals, answered as `{ status, body }`. `headers` are the
 * request's, lower-cased.
 */
export function uploadResourceFile(
  db: InMemoryDb,
  headers: Record<string, string>,
  body: Uint8Array,
): { status: number; body: unknown } {
  const type = resourceFileTypeByMime(headers['content-type'])
  if (!type) return { status: 415, body: { error: "That file type isn't supported" } }
  if (body.length > MAX_RESOURCE_FILE_BYTES) return { status: 413, body: { error: 'That file is over 20 MB' } }
  if (body.length === 0) return { status: 400, body: { error: 'That file is empty' } }
  if (!matchesFileContent(type, body)) return { status: 415, body: { error: `That file isn't a valid ${type.label} file` } }
  let name = 'File'
  try {
    name = decodeURIComponent(headers['x-file-name'] ?? '').split(/[\\/]/).pop()?.trim() || 'File'
  } catch {}
  try {
    const lectureId = headers['x-lecture-id'] || null
    const course = headers['x-resource-course'] || null
    if (headers['x-workspace-id']) requireBoard(db, headers['x-workspace-id'])
    return {
      status: 200,
      body: insert(db, {
        kind: 'file',
        title: titleFromFileName(name),
        file_name: name,
        mime_type: type.mime,
        size_bytes: body.length,
        ...attachment(db, lectureId, course),
      }),
    }
  } catch (err) {
    if (err instanceof SimulatorError) return { status: err.code === 'NOT_FOUND' ? 404 : 400, body: { error: err.message } }
    throw err
  }
}

export function registerResourcesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('resources.list', (input) => {
    const filter = parse(resourceListInput, input) ?? {}
    return db.resources
      .map((r) => resourceRow(db, r))
      .filter((r) => !filter.courseTag || r.course === filter.courseTag || r.lecture_course === filter.courseTag)
      .filter((r) => !filter.lectureId || r.lecture_id === filter.lectureId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
      .map(({ body_md: _body, ...row }) => row)
  })

  router.register('resources.get', (input) => {
    const id = parse(resourceIdInput, input)
    const resource = db.resources.find((r) => r.id === id)
    return resource ? resourceRow(db, resource) : null
  })

  router.register('resources.createLink', (input) => {
    const parsed = parse(newResourceLinkInput, input)
    const url = parseResourceUrl(parsed.url)
    if (!url) throw new SimulatorError('BAD_REQUEST', 'Links must start with http:// or https://')
    if (parsed.workspaceId) requireBoard(db, parsed.workspaceId)
    return insert(db, {
      kind: 'link',
      title: parsed.title ?? url.label,
      url: url.url,
      provider: url.provider,
      ...attachment(db, parsed.lectureId, parsed.courseTag),
    })
  })

  router.register('resources.createNote', (input) => {
    const parsed = parse(newResourceNoteInput, input)
    if (parsed.workspaceId) requireBoard(db, parsed.workspaceId)
    return insert(db, {
      kind: 'note',
      title: parsed.title ?? UNTITLED_NOTE,
      body_md: parsed.body_md ?? '',
      ...attachment(db, parsed.lectureId, parsed.courseTag),
    })
  })

  router.register('resources.update', (input) => {
    const { id, patch, expectedUpdatedAt } = parse(resourceUpdateInput, input)
    const current = requireResource(db, id)
    if (expectedUpdatedAt && new Date(current.updated_at).getTime() !== expectedUpdatedAt.getTime()) {
      throw new SimulatorError('CONFLICT', 'This changed on another device since you opened it.')
    }
    const next: StoredResource = { ...current }
    if (patch.url !== undefined) {
      if (current.kind !== 'link') throw new SimulatorError('BAD_REQUEST', 'Only a link has a URL')
      const url = parseResourceUrl(patch.url)
      if (!url) throw new SimulatorError('BAD_REQUEST', 'Links must start with http:// or https://')
      next.url = url.url
      next.provider = url.provider
    }
    if (patch.body_md !== undefined) {
      if (current.kind !== 'note') throw new SimulatorError('BAD_REQUEST', 'Only a note has a body')
      next.body_md = patch.body_md
    }
    if (patch.title !== undefined) next.title = patch.title
    if (patch.lectureId || patch.courseTag) {
      Object.assign(next, attachment(db, patch.lectureId, patch.courseTag))
    } else {
      if (patch.lectureId === null) next.lecture_id = null
      if (patch.courseTag === null) next.course = null
    }
    next.updated_at = nextTimestamp(current.updated_at)
    Object.assign(current, next)
    return resourceRow(db, current)
  })

  router.register('resources.fileUrl', (input): ResourceFileUrl => {
    const id = parse(resourceIdInput, input)
    if (requireResource(db, id).kind !== 'file') throw new SimulatorError('BAD_REQUEST', 'That is not a file')
    return { url: `/resource-files/${id}?u=sim&exp=${Date.now() + 300_000}&sig=sim` }
  })

  router.register('resources.delete', (input) => {
    const id = parse(resourceIdInput, input)
    requireResource(db, id)
    db.resources = db.resources.filter((r) => r.id !== id)
    return { id }
  })
}
