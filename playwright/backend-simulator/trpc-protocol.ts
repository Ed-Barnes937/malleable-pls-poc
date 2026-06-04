import superjson from 'superjson'

export interface TrpcProcedureCall {
  path: string
  input: unknown
  index: number
}

export interface TrpcResult {
  data?: unknown
  error?: { message: string; code: string }
}

type ProcedureHandler = (input: unknown) => unknown | Promise<unknown>

export class ProcedureRouter {
  private handlers = new Map<string, ProcedureHandler>()

  register(path: string, handler: ProcedureHandler): void {
    this.handlers.set(path, handler)
  }

  async resolve(path: string, input: unknown): Promise<TrpcResult> {
    const handler = this.handlers.get(path)
    if (!handler) {
      return { error: { message: `No handler for procedure: ${path}`, code: 'NOT_FOUND' } }
    }
    try {
      const data = await handler(input)
      return { data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: { message, code: 'INTERNAL_SERVER_ERROR' } }
    }
  }
}

export function parseTrpcRequest(
  url: string,
  method: string,
  postBody?: string,
): { calls: TrpcProcedureCall[]; isBatch: boolean } {
  const parsed = new URL(url)
  const pathname = parsed.pathname.replace(/^.*\/trpc\//, '').replace(/^\/+/, '')
  const paths = pathname.split(',')
  const isBatch = parsed.searchParams.get('batch') === '1'

  if (method === 'GET') {
    const rawInput = parsed.searchParams.get('input')
    if (!rawInput) {
      return {
        isBatch,
        calls: paths.map((path, i) => ({ path, input: undefined, index: i })),
      }
    }
    const inputObj = JSON.parse(rawInput)
    if (isBatch) {
      return {
        isBatch: true,
        calls: paths.map((path, i) => ({
          path,
          input: deserializeInput(inputObj[String(i)]),
          index: i,
        })),
      }
    }
    return {
      isBatch: false,
      calls: [{ path: paths[0], input: deserializeInput(inputObj), index: 0 }],
    }
  }

  // POST (mutations)
  const body = postBody ? JSON.parse(postBody) : {}
  if (isBatch) {
    return {
      isBatch: true,
      calls: paths.map((path, i) => ({
        path,
        input: deserializeInput(body[String(i)]),
        index: i,
      })),
    }
  }
  return {
    isBatch: false,
    calls: [{ path: paths[0], input: deserializeInput(body), index: 0 }],
  }
}

function deserializeInput(raw: unknown): unknown {
  if (raw == null) return undefined
  if (typeof raw === 'object' && raw !== null && 'json' in raw) {
    const obj = raw as { json: unknown; meta?: { values: Record<string, string[]> } }
    if (obj.meta) {
      return superjson.deserialize({ json: obj.json, meta: obj.meta as any })
    }
    return obj.json
  }
  return raw
}

function serializeResult(result: TrpcResult): object {
  if (result.error) {
    return {
      error: {
        message: result.error.message,
        code: -32603,
        data: { code: result.error.code, httpStatus: 500 },
      },
    }
  }
  const serialized = superjson.serialize(result.data)
  return { result: { data: serialized } }
}

export function buildTrpcResponse(results: TrpcResult[], isBatch: boolean): string {
  const serialized = results.map(serializeResult)
  return JSON.stringify(isBatch ? serialized : serialized[0])
}

export interface RouteHandlerResult {
  status: number
  body: string
  contentType: string
  abort?: boolean
  stall?: boolean
}

export async function handleTrpcRequest(
  url: string,
  method: string,
  postBody: string | undefined,
  router: ProcedureRouter,
): Promise<RouteHandlerResult> {
  const { calls, isBatch } = parseTrpcRequest(url, method, postBody)

  const results: TrpcResult[] = []
  for (const call of calls) {
    results.push(await router.resolve(call.path, call.input))
  }

  return {
    status: 200,
    body: buildTrpcResponse(results, isBatch),
    contentType: 'application/json',
  }
}
