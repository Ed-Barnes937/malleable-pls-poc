// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { trpcErrorLine } from './trpc-error-log'

describe('trpcErrorLine', () => {
  it('logs the procedure, the code and the message of a thrown TRPCError', () => {
    const error = new TRPCError({ code: 'NOT_FOUND', message: 'Board not found' })
    expect(trpcErrorLine('mutation', 'workspaces.addPanel', error))
      .toBe('tRPC mutation workspaces.addPanel failed: NOT_FOUND Board not found')
  })

  it("logs a database error's code and message on one line, never its detail", () => {
    const pgError = Object.assign(new Error('insert or update on table "workspace_panels"\n  violates foreign key constraint'), {
      code: '23503',
      detail: 'Key (note)=(something the student typed) is not present',
      where: 'SQL statement with student text',
    })
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: pgError })
    const line = trpcErrorLine('mutation', 'workspaces.addPanel', error)
    expect(line).toBe(
      'tRPC mutation workspaces.addPanel failed: INTERNAL_SERVER_ERROR [23503] insert or update on table "workspace_panels" violates foreign key constraint',
    )
    expect(line).not.toContain('student')
  })
})
