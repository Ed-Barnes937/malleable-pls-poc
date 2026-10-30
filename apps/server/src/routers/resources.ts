import { TRPCError } from '@trpc/server'
import { withUser, type TxSql } from '@pls/db'
import {
  UNTITLED_NOTE,
  newResourceLinkInput,
  newResourceNoteInput,
  noteExcerpt,
  parseResourceUrl,
  resourceIdInput,
  resourceListInput,
  resourceUpdateInput,
  type ResourceWithBody,
  type Resource,
} from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { dispatchWorkflows } from '../workflows/dispatch'
import { andInCourse, isCourse, requireOwnBoard, requireOwnLecture } from './_shared'

type Fragment = ReturnType<TxSql['unsafe']>

/** How much of a note body lists read, enough for an excerpt. */
const EXCERPT_SOURCE_CHARS = 2000

/**
 * Resources with their lecture's title and course. `where` is the rest of
 * the WHERE clause after the user check. Lists read only the start of a
 * note (for its excerpt); `withBody` reads it all.
 */
async function selectResources(
  tx: TxSql,
  userId: string,
  where: Fragment,
  withBody = false,
): Promise<ResourceWithBody[]> {
  const rows = await tx`
    SELECT
      r.id, r.kind, r.title, r.url, r.provider, r.file_name, r.mime_type, r.size_bytes,
      r.lecture_id, r.course, l.title AS lecture_title, l.course AS lecture_course,
      ${withBody ? tx`r.body_md` : tx`left(r.body_md, ${EXCERPT_SOURCE_CHARS})`} AS body_md,
      r.created_at, r.updated_at
    FROM resources r
    LEFT JOIN lectures l ON l.id = r.lecture_id AND l.user_id = ${userId}
    WHERE r.user_id = ${userId} ${where}
    ORDER BY r.sort_order NULLS LAST, r.created_at DESC, r.id
  `
  return rows.map((row) => ({
    ...(row as unknown as ResourceWithBody),
    excerpt: row.kind === 'note' ? noteExcerpt((row.body_md as string | null) ?? '') : null,
  }))
}

function withoutBody({ body_md: _body, ...resource }: ResourceWithBody): Resource {
  return resource
}

async function resourceById(tx: TxSql, userId: string, id: string): Promise<ResourceWithBody | null> {
  const [resource] = await selectResources(tx, userId, tx`AND r.id = ${id}`, true)
  return resource ?? null
}

function badRequest(message: string): TRPCError {
  return new TRPCError({ code: 'BAD_REQUEST', message })
}

/**
 * Where a new or moved resource goes: `{ lecture_id, course }` with at most
 * one set. A lecture must be the student's (foreign keys skip row-level
 * security) and a course a known key; naming both is refused.
 */
async function attachment(
  tx: TxSql,
  userId: string,
  lectureId: string | null | undefined,
  courseTag: string | null | undefined,
): Promise<{ lecture_id: string | null; course: string | null }> {
  if (lectureId && courseTag) throw badRequest('A resource goes under a lecture or a course, not both')
  if (lectureId) {
    await requireOwnLecture(tx, userId, lectureId)
    return { lecture_id: lectureId, course: null }
  }
  if (courseTag) {
    if (!isCourse(courseTag)) throw badRequest('Unknown course')
    return { lecture_id: null, course: courseTag }
  }
  return { lecture_id: null, course: null }
}

async function resourceAdded(tx: TxSql, userId: string, resource: Resource, workspaceId: string | null | undefined) {
  if (!workspaceId) return
  await dispatchWorkflows(
    tx,
    userId,
    'resource:added',
    { resourceId: resource.id, kind: resource.kind, lectureId: resource.lecture_id, course: resource.course ?? resource.lecture_course },
    workspaceId,
  )
}

export const resourcesRouter = router({
  /**
   * The student's resources, newest first, without note bodies (`excerpt`
   * instead). `courseTag` keeps those in the course, filed under it or under
   * one of its lectures; `lectureId` keeps the lecture's.
   */
  list: publicProcedure
    .input(resourceListInput)
    .query(async ({ ctx, input }): Promise<Resource[]> => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await selectResources(tx, ctx.userId, tx`
          ${andInCourse(tx, ctx.userId, input?.courseTag, 'resource', tx`r.id`)}
          ${input?.lectureId ? tx`AND r.lecture_id = ${input.lectureId}` : tx``}
        `)
        return rows.map(withoutBody)
      })
    }),

  /** One resource with its full note body, or null if it isn't the student's. */
  get: publicProcedure
    .input(resourceIdInput)
    .query(async ({ ctx, input }) => withUser(ctx.userId, (tx) => resourceById(tx, ctx.userId, input))),

  /**
   * A link. Only http(s) URLs; the provider (Google Doc, Sheet, ...) comes
   * from the URL, and a blank title becomes what it is ("Google Doc") or its
   * host.
   */
  createLink: publicProcedure
    .input(newResourceLinkInput)
    .mutation(async ({ ctx, input }): Promise<ResourceWithBody> => {
      const parsed = parseResourceUrl(input.url)
      if (!parsed) throw badRequest('Links must start with http:// or https://')
      return withUser(ctx.userId, async (tx) => {
        if (input.workspaceId) await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const where = await attachment(tx, ctx.userId, input.lectureId, input.courseTag)
        const [row] = await tx`
          INSERT INTO resources (user_id, kind, title, url, provider, lecture_id, course)
          VALUES (${ctx.userId}, 'link', ${input.title ?? parsed.label}, ${parsed.url}, ${parsed.provider},
                  ${where.lecture_id}, ${where.course})
          RETURNING id
        `
        const resource = (await resourceById(tx, ctx.userId, row.id as string))!
        await resourceAdded(tx, ctx.userId, resource, input.workspaceId)
        return resource
      })
    }),

  /** A markdown note, empty unless `body_md` is given. */
  createNote: publicProcedure
    .input(newResourceNoteInput)
    .mutation(async ({ ctx, input }): Promise<ResourceWithBody> => {
      return withUser(ctx.userId, async (tx) => {
        if (input.workspaceId) await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const where = await attachment(tx, ctx.userId, input.lectureId, input.courseTag)
        const [row] = await tx`
          INSERT INTO resources (user_id, kind, title, body_md, lecture_id, course)
          VALUES (${ctx.userId}, 'note', ${input.title ?? UNTITLED_NOTE}, ${input.body_md ?? ''},
                  ${where.lecture_id}, ${where.course})
          RETURNING id
        `
        const resource = (await resourceById(tx, ctx.userId, row.id as string))!
        await resourceAdded(tx, ctx.userId, resource, input.workspaceId)
        return resource
      })
    }),

  /**
   * Renames, edits or moves a resource. `url` only for a link, `body_md`
   * only for a note. Setting `lectureId` files it under that lecture and
   * setting `courseTag` under that course, clearing the other; null for
   * both unfiles it. With `expectedUpdatedAt` (the `updated_at` the client
   * last read) it is refused with CONFLICT if the resource changed since,
   * e.g. a note edited on another device.
   */
  update: publicProcedure
    .input(resourceUpdateInput)
    .mutation(async ({ ctx, input }): Promise<ResourceWithBody> => {
      const { patch } = input
      return withUser(ctx.userId, async (tx) => {
        const [current] = await tx`
          SELECT kind, lecture_id, course, updated_at FROM resources
          WHERE id = ${input.id} AND user_id = ${ctx.userId}
          FOR UPDATE
        `
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' })
        if (input.expectedUpdatedAt && (current.updated_at as Date).getTime() !== input.expectedUpdatedAt.getTime()) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This changed on another device since you opened it.' })
        }

        let url: string | null = null
        let provider: string | null = null
        if (patch.url !== undefined) {
          if (current.kind !== 'link') throw badRequest('Only a link has a URL')
          const parsed = parseResourceUrl(patch.url)
          if (!parsed) throw badRequest('Links must start with http:// or https://')
          url = parsed.url
          provider = parsed.provider
        }
        if (patch.body_md !== undefined && current.kind !== 'note') throw badRequest('Only a note has a body')

        let lectureId = current.lecture_id as string | null
        let course = current.course as string | null
        if (patch.lectureId !== undefined || patch.courseTag !== undefined) {
          if (patch.lectureId || patch.courseTag) {
            ;({ lecture_id: lectureId, course } = await attachment(tx, ctx.userId, patch.lectureId, patch.courseTag))
          } else {
            // Only nulls: drop what was named, keep the rest.
            if (patch.lectureId === null) lectureId = null
            if (patch.courseTag === null) course = null
          }
        }

        await tx`
          UPDATE resources SET
            title = COALESCE(${patch.title ?? null}, title),
            url = CASE WHEN ${url !== null} THEN ${url} ELSE url END,
            provider = CASE WHEN ${provider !== null} THEN ${provider} ELSE provider END,
            body_md = CASE WHEN ${patch.body_md !== undefined} THEN ${patch.body_md ?? null} ELSE body_md END,
            lecture_id = ${lectureId},
            course = ${course},
            updated_at = clock_timestamp()
          WHERE id = ${input.id} AND user_id = ${ctx.userId}
        `
        return (await resourceById(tx, ctx.userId, input.id))!
      })
    }),

  /** Deletes a resource. NOT_FOUND if it isn't the student's. */
  delete: publicProcedure
    .input(resourceIdInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [row] = await tx`DELETE FROM resources WHERE id = ${input} AND user_id = ${ctx.userId} RETURNING id`
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' })
        return { id: row.id as string }
      })
    }),
})
