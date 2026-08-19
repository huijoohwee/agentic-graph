import {
  EFFECT_CONTRACT,
  ISSUANCE_COMPONENT,
  MAX_RESPONSE_BYTES,
  READY_PATH,
  SETTLEMENT_PATH,
  parseDefinitiveRejection,
  parseEffectReceipt,
  parseJsonBytes,
  parseProviderReadiness,
  parseSemanticConflict,
  readBoundedBytes,
  type DefinitiveRejection,
  type EffectReceipt,
  type NetSettlementRequest,
  type SemanticConflict,
} from './contract'

const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 8_000
const MIN_TOKEN_BYTES = 16
const MAX_TOKEN_BYTES = 4_096

export type SettlementExecutorRuntimeEnv = SettlementExecutorEnv & Readonly<{
  /** Configure out of band with `wrangler secret put`; never commit this value. */
  ISSUANCE_SERVICE_AUTH_TOKEN?: string
}>

export type UpstreamConfig = Readonly<{
  baseUrl: URL
  authToken: string
  timeoutMs: number
}>

export type SettlementExecution =
  | Readonly<{ kind: 'succeeded'; receipt: EffectReceipt }>
  | Readonly<{ kind: 'conflict'; conflict: SemanticConflict }>
  | Readonly<{ kind: 'rejected'; rejection: DefinitiveRejection }>
  | Readonly<{ kind: 'unavailable' }>

export type UpstreamFetch = (request: Request) => Promise<Response>

const hasSafeToken = (value: string): boolean => {
  const bytes = new TextEncoder().encode(value).byteLength
  return bytes >= MIN_TOKEN_BYTES && bytes <= MAX_TOKEN_BYTES && /^[\x21-\x7E]+$/.test(value)
}

export const resolveUpstreamConfig = (env: SettlementExecutorRuntimeEnv): UpstreamConfig | null => {
  let baseUrl: URL
  try {
    baseUrl = new URL(env.ISSUANCE_SERVICE_BASE_URL)
  } catch {
    return null
  }
  if (
    baseUrl.protocol !== 'https:'
    || baseUrl.username !== ''
    || baseUrl.password !== ''
    || baseUrl.pathname !== '/'
    || baseUrl.search !== ''
    || baseUrl.hash !== ''
  ) return null
  const timeoutText = env.ISSUANCE_SERVICE_TIMEOUT_MS
  if (!/^(?:0|[1-9][0-9]*)$/.test(timeoutText)) return null
  const timeoutMs = Number(timeoutText)
  const authToken = env.ISSUANCE_SERVICE_AUTH_TOKEN
  if (
    !Number.isSafeInteger(timeoutMs)
    || timeoutMs < MIN_TIMEOUT_MS
    || timeoutMs > MAX_TIMEOUT_MS
    || typeof authToken !== 'string'
    || !hasSafeToken(authToken)
  ) return null
  return Object.freeze({ baseUrl, authToken, timeoutMs })
}

const withDeadline = async <T>(
  request: Request,
  timeoutMs: number,
  fetchUpstream: UpstreamFetch,
  consume: (response: Response) => Promise<T>,
): Promise<T | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('issuance-service-deadline'), timeoutMs)
  try {
    const response = await fetchUpstream(new Request(request, { signal: controller.signal }))
    return await consume(response)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const responseJson = async (response: Response): Promise<unknown | null> => {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    if (response.body) {
      try {
        await response.body.cancel('unsupported-content-type')
      } catch {
        // A failed cancellation is still normalized to an unavailable effect.
      }
    }
    return null
  }
  const bytes = await readBoundedBytes(
    response.body,
    response.headers.get('content-length'),
    MAX_RESPONSE_BYTES,
  )
  return bytes ? parseJsonBytes(bytes) : null
}

const authorizationHeaders = (config: UpstreamConfig): HeadersInit => ({
  accept: 'application/json',
  authorization: `Bearer ${config.authToken}`,
  'cache-control': 'no-store',
  'x-knowgrph-component': ISSUANCE_COMPONENT,
})

export const probeProviderReadiness = async (
  config: UpstreamConfig,
  fetchUpstream: UpstreamFetch,
): Promise<boolean> => {
  const ready = await withDeadline(new Request(new URL(READY_PATH, config.baseUrl), {
    method: 'GET',
    headers: authorizationHeaders(config),
    redirect: 'error',
  }), config.timeoutMs, fetchUpstream, async (response) => {
    if (response.status !== 200) return false
    const value = await responseJson(response)
    return parseProviderReadiness(value) !== null
  })
  return ready === true
}

export const executeSettlement = async (
  config: UpstreamConfig,
  request: NetSettlementRequest,
  originalBody: Uint8Array,
  idempotencyKey: string,
  fetchUpstream: UpstreamFetch,
): Promise<SettlementExecution> => {
  const forwardedBody = new ArrayBuffer(originalBody.byteLength)
  new Uint8Array(forwardedBody).set(originalBody)
  const execution = await withDeadline(new Request(new URL(SETTLEMENT_PATH, config.baseUrl), {
    method: 'POST',
    headers: {
      ...authorizationHeaders(config),
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: forwardedBody,
    redirect: 'error',
  }), config.timeoutMs, fetchUpstream, async (response): Promise<SettlementExecution> => {
    const value = await responseJson(response)
    if (response.status === 200) {
      const receipt = parseEffectReceipt(value, request)
      return receipt
        ? Object.freeze({ kind: 'succeeded', receipt })
        : Object.freeze({ kind: 'unavailable' })
    }
    if (response.status === 409) {
      const conflict = parseSemanticConflict(value, request)
      return conflict
        ? Object.freeze({ kind: 'conflict', conflict })
        : Object.freeze({ kind: 'unavailable' })
    }
    if (response.status === 422) {
      const rejection = parseDefinitiveRejection(value, request)
      return rejection
        ? Object.freeze({ kind: 'rejected', rejection })
        : Object.freeze({ kind: 'unavailable' })
    }
    return Object.freeze({ kind: 'unavailable' })
  })
  return execution ?? Object.freeze({ kind: 'unavailable' })
}

export const executorContract = EFFECT_CONTRACT
