export const STORAGE_RELAY_API_VERSION = 'knowgrph-storage-relay/v1'
export const STORAGE_RELAY_MAX_BYTES = 10 * 1024 * 1024
export const STORAGE_RELAY_TIMEOUT_MS = 30_000
export const STORAGE_RELAY_MAX_SUBREQUESTS = 40

export type StorageRelayErrorCode =
  | 'auth_required'
  | 'membership_forbidden'
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'timeout'
  | 'limit_exceeded'
  | 'upstream_unavailable'
  | 'invalid_request'
  | 'invalid_response'

export class StorageRelayError extends Error {
  readonly code: StorageRelayErrorCode
  readonly retryable: boolean
  readonly status: number
  readonly fileKey?: string

  constructor(args: {
    code: StorageRelayErrorCode
    status: number
    retryable?: boolean
    fileKey?: string
  }) {
    super(args.code)
    this.name = 'StorageRelayError'
    this.code = args.code
    this.status = args.status
    this.retryable = Boolean(args.retryable)
    this.fileKey = args.fileKey
  }
}

export type StorageRelayMembership = {
  role: string
  status: string
}

export type StorageRelayAuthHooks<AuthContext> = {
  authenticate(args: {
    request: Request
    bearerToken: string
    signal: AbortSignal
  }): Promise<AuthContext | null>
  authorizeMembership(args: {
    authContext: AuthContext
    workspaceId: string
    signal: AbortSignal
  }): Promise<StorageRelayMembership | null>
}

export type StorageRelayAccess = 'read' | 'write'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])
const WRITE_ROLES = new Set(['editor', 'owner', 'provider-admin'])
const READ_ROLES = new Set(['viewer', 'editor', 'owner', 'provider-admin'])
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/

export const assertDevStorageRelayRequest = (
  request: Request,
  env: { KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED?: string },
): void => {
  if (env.KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED !== 'true') {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
  let requestUrl: URL
  try {
    requestUrl = new URL(request.url)
  } catch {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  if (!LOOPBACK_HOSTS.has(requestUrl.hostname.toLowerCase())) {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
  const originValue = request.headers.get('origin')
  if (originValue == null) return
  let origin: URL
  try {
    origin = new URL(originValue)
  } catch {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
  if (!LOOPBACK_HOSTS.has(origin.hostname.toLowerCase())) {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
}

export const readStorageRelayBearer = (request: Request): string => {
  const authorization = String(request.headers.get('authorization') || '').trim()
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization)
  if (!match?.[1]) {
    throw new StorageRelayError({ code: 'auth_required', status: 401 })
  }
  return match[1]
}

export const authorizeStorageRelayRequest = async <AuthContext>(args: {
  request: Request
  workspaceId: string
  access: StorageRelayAccess
  hooks: StorageRelayAuthHooks<AuthContext>
  signal: AbortSignal
}): Promise<{ authContext: AuthContext; membership: StorageRelayMembership }> => {
  const bearerToken = readStorageRelayBearer(args.request)
  const authContext = await awaitStorageRelaySignal(args.hooks.authenticate({
      request: args.request,
      bearerToken,
      signal: args.signal,
    }),
    args.signal,
  )
  if (!authContext) throw new StorageRelayError({ code: 'auth_required', status: 401 })
  const membership = await awaitStorageRelaySignal(args.hooks.authorizeMembership({
      authContext,
      workspaceId: args.workspaceId,
      signal: args.signal,
    }),
    args.signal,
  )
  if (!membership || membership.status !== 'active') {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
  const roles = args.access === 'write' ? WRITE_ROLES : READ_ROLES
  if (!roles.has(membership.role)) {
    throw new StorageRelayError({ code: 'membership_forbidden', status: 403 })
  }
  return { authContext, membership }
}

export const awaitStorageRelaySignal = async <Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) {
    throw new StorageRelayError({ code: 'timeout', status: 504, retryable: true })
  }
  let abortListener: (() => void) | null = null
  const abortPromise = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(
      new StorageRelayError({ code: 'timeout', status: 504, retryable: true }),
    )
    signal.addEventListener('abort', abortListener, { once: true })
  })
  try {
    return await Promise.race([promise, abortPromise])
  } finally {
    if (abortListener) signal.removeEventListener('abort', abortListener)
  }
}

export class StorageRelayByteBudget {
  private consumedBytes = 0
  readonly maxBytes: number

  constructor(maxBytes = STORAGE_RELAY_MAX_BYTES) {
    this.maxBytes = Math.max(1, Math.min(STORAGE_RELAY_MAX_BYTES, Math.floor(maxBytes)))
  }

  consume(byteLength: number): void {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    this.consumedBytes += byteLength
    if (this.consumedBytes > this.maxBytes) {
      throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
    }
  }

  get remainingBytes(): number {
    return Math.max(0, this.maxBytes - this.consumedBytes)
  }
}

export type StorageRelayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export class StorageRelayOperation {
  readonly signal: AbortSignal
  readonly budget: StorageRelayByteBudget
  private readonly controller = new AbortController()
  private readonly timeoutHandle: ReturnType<typeof setTimeout>
  private readonly fetcher: StorageRelayFetch
  private subrequestCount = 0

  constructor(args: {
    fetcher?: StorageRelayFetch
    timeoutMs?: number
    maxBytes?: number
  } = {}) {
    const timeoutMs = Math.max(1, Math.min(STORAGE_RELAY_TIMEOUT_MS, args.timeoutMs ?? STORAGE_RELAY_TIMEOUT_MS))
    this.signal = this.controller.signal
    this.budget = new StorageRelayByteBudget(args.maxBytes)
    this.fetcher = args.fetcher ?? fetch
    this.timeoutHandle = setTimeout(() => this.controller.abort(), timeoutMs)
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    if (this.signal.aborted) {
      throw new StorageRelayError({ code: 'timeout', status: 504, retryable: true })
    }
    this.subrequestCount += 1
    if (this.subrequestCount > STORAGE_RELAY_MAX_SUBREQUESTS) {
      throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
    }
    try {
      return await this.fetcher(input, { ...init, signal: this.signal })
    } catch (error) {
      if (this.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new StorageRelayError({ code: 'timeout', status: 504, retryable: true })
      }
      throw new StorageRelayError({ code: 'upstream_unavailable', status: 502, retryable: true })
    }
  }

  dispose(): void {
    clearTimeout(this.timeoutHandle)
  }
}

const readDeclaredLength = (headers: Headers): number | null => {
  const raw = headers.get('content-length')
  if (raw == null || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return value
}

export const readStorageRelayBytes = async (
  body: ReadableStream<Uint8Array> | null,
  headers: Headers,
  budget: StorageRelayByteBudget,
): Promise<Uint8Array> => {
  const declaredLength = readDeclaredLength(headers)
  if (declaredLength != null && declaredLength > budget.remainingBytes) {
    throw new StorageRelayError({ code: 'limit_exceeded', status: 413 })
  }
  if (!body) {
    if (declaredLength && declaredLength > 0) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return new Uint8Array()
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      const chunk = result.value
      budget.consume(chunk.byteLength)
      chunks.push(chunk)
      totalLength += chunk.byteLength
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const readStorageRelayRequestBytes = (
  request: Request,
  budget: StorageRelayByteBudget,
): Promise<Uint8Array> => readStorageRelayBytes(request.body, request.headers, budget)

export const readStorageRelayResponseBytes = (
  response: Response,
  budget: StorageRelayByteBudget,
): Promise<Uint8Array> => readStorageRelayBytes(response.body, response.headers, budget)

export const parseStorageRelayJsonBytes = <Value>(bytes: Uint8Array): Value => {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Value
  } catch {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
}

export const readStorageRelayJsonRequest = async <Value>(
  request: Request,
  budget: StorageRelayByteBudget,
): Promise<Value> => parseStorageRelayJsonBytes<Value>(await readStorageRelayRequestBytes(request, budget))

export const readStorageRelayJsonResponse = async <Value>(
  response: Response,
  budget: StorageRelayByteBudget,
): Promise<Value> => {
  const bytes = await readStorageRelayResponseBytes(response, budget)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Value
  } catch {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
}

export const discardStorageRelayResponse = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined)
}

export const mapStorageRelayUpstreamStatus = (status: number): StorageRelayError => {
  if (status === 401 || status === 403) {
    return new StorageRelayError({ code: 'provider_auth_failed', status: 502 })
  }
  if (status === 404) return new StorageRelayError({ code: 'not_found', status: 404 })
  if (status === 409 || status === 412) return new StorageRelayError({ code: 'conflict', status: 409 })
  if (status === 413) return new StorageRelayError({ code: 'limit_exceeded', status: 413 })
  if (status === 429) return new StorageRelayError({ code: 'rate_limited', status: 503, retryable: true })
  if (status >= 500) return new StorageRelayError({ code: 'upstream_unavailable', status: 502, retryable: true })
  return new StorageRelayError({ code: 'invalid_response', status: 502 })
}

export const createStorageRelayOperationId = (request: Request): string => {
  const requestedId = String(request.headers.get('x-client-request-id') || '').trim()
  if (OPERATION_ID_PATTERN.test(requestedId)) return requestedId
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `relay:${crypto.randomUUID()}`
  }
  return `relay:${Date.now().toString(36)}`
}

export const storageRelayJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

export const storageRelayErrorResponse = (
  error: unknown,
  operationId: string,
  fileKey?: string,
): Response => {
  const relayError = error instanceof StorageRelayError
    ? error
    : new StorageRelayError({ code: 'upstream_unavailable', status: 502, retryable: true })
  return storageRelayJsonResponse(relayError.status, {
    ok: false,
    apiVersion: STORAGE_RELAY_API_VERSION,
    code: relayError.code,
    retryable: relayError.retryable,
    operationId,
    ...(fileKey || relayError.fileKey ? { fileKey: fileKey || relayError.fileKey } : {}),
  })
}
