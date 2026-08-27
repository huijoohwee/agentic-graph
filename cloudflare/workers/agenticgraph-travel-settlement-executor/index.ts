import {
  EFFECT_CONTRACT,
  ISSUANCE_COMPONENT,
  LIVE_PATH,
  MAX_REQUEST_BYTES,
  READY_PATH,
  SETTLEMENT_PATH,
  isCanonicalJsonBytes,
  parseJsonBytes,
  parseSettlementRequest,
  readBoundedBytes,
} from './contract'
import {
  executeSettlement,
  probeProviderReadiness,
  resolveUpstreamConfig,
  type SettlementExecutorRuntimeEnv,
  type UpstreamFetch,
} from './upstream'

const SERVICE = 'agenticgraph-travel-settlement-executor'

const json = (status: number, body: unknown, headers: HeadersInit = {}): Response => {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('cache-control', 'no-store')
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  responseHeaders.set('x-content-type-options', 'nosniff')
  return Response.json(body, { status, headers: responseHeaders })
}

const unavailable = (idempotencyKey: string): Response => json(503, {
  ok: false,
  code: 'settlement-effect-unavailable',
  idempotencyKey,
})

const headFrom = (response: Response): Response => new Response(null, {
  status: response.status,
  headers: response.headers,
})

const readiness = async (
  env: SettlementExecutorRuntimeEnv,
  fetchUpstream: UpstreamFetch,
): Promise<Response> => {
  const config = resolveUpstreamConfig(env)
  if (!config) return json(503, {
    ok: false,
    service: SERVICE,
    code: 'configuration-invalid',
  })
  const ready = await probeProviderReadiness(config, fetchUpstream)
  return ready
    ? json(200, {
        ok: true,
        service: SERVICE,
        contract: EFFECT_CONTRACT,
        providerBacked: true,
        capability: 'settleNet',
      })
    : json(503, {
        ok: false,
        service: SERVICE,
        code: 'provider-unavailable',
      })
}

const settle = async (
  request: Request,
  env: SettlementExecutorRuntimeEnv,
  fetchUpstream: UpstreamFetch,
): Promise<Response> => {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return json(415, { ok: false, code: 'content-type-unsupported' })
  }
  if (request.headers.get('x-agenticgraph-component') !== ISSUANCE_COMPONENT) {
    return json(403, { ok: false, code: 'unauthorized-settlement-caller' })
  }
  const bytes = await readBoundedBytes(
    request.body,
    request.headers.get('content-length'),
    MAX_REQUEST_BYTES,
  )
  const value = bytes ? parseJsonBytes(bytes) : null
  const settlement = parseSettlementRequest(value)
  if (!bytes || !settlement || !isCanonicalJsonBytes(bytes, value)) {
    return json(400, { ok: false, code: 'net-settlement-invalid' })
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? ''
  if (idempotencyKey !== settlement.cascadeId) {
    return json(400, { ok: false, code: 'idempotency-key-mismatch' })
  }
  const config = resolveUpstreamConfig(env)
  if (!config) return unavailable(idempotencyKey)
  const result = await executeSettlement(config, settlement, bytes, idempotencyKey, fetchUpstream)
  if (result.kind === 'succeeded') return json(200, result.receipt)
  if (result.kind === 'conflict') return json(409, {
    ok: false,
    code: result.conflict.code,
    idempotencyKey: result.conflict.idempotencyKey,
  })
  if (result.kind === 'rejected') return json(422, {
    ok: false,
    code: result.rejection.code,
    idempotencyKey: result.rejection.idempotencyKey,
    definitive: true,
    effectApplied: false,
  })
  return unavailable(idempotencyKey)
}

export const createSettlementExecutor = (fetchUpstream: UpstreamFetch) => ({
  async fetch(request: Request, env: SettlementExecutorRuntimeEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
    if (pathname === LIVE_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'GET, HEAD' })
      }
      const response = json(200, { ok: true, service: SERVICE, status: 'live' })
      return request.method === 'HEAD' ? headFrom(response) : response
    }
    if (pathname === READY_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'GET, HEAD' })
      }
      const response = await readiness(env, fetchUpstream)
      return request.method === 'HEAD' ? headFrom(response) : response
    }
    if (pathname !== SETTLEMENT_PATH) return json(404, { ok: false, code: 'route-not-found' })
    if (request.method !== 'POST') {
      return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'POST' })
    }
    return settle(request, env, fetchUpstream)
  },
})

const worker = createSettlementExecutor((request) => fetch(request))

export default worker satisfies ExportedHandler<SettlementExecutorRuntimeEnv>
