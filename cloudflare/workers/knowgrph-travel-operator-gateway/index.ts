import {
  probeAccessJwks,
  readAccessJwtConfiguration,
  verifyAccessJwt,
  type AccessJwtConfiguration,
} from './access-jwt'

export const OPERATOR_GATEWAY_BASE_PATH = '/knowgrph/control-plane/travel/reconciliation'
const CONTROL_CONTRACT = 'knowgrph.travel-reconciliation-control/v1'
const MAX_BODY_BYTES = 16 * 1_024
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CASCADE_IDENTIFIER = /^(?:[A-Za-z0-9]|~)[A-Za-z0-9._:~-]{0,510}$/
const LANES = new Set(['Dev_Lane', 'Staging_Lane', 'Production_Lane'])

type ServiceBinding = Readonly<{ fetch: (request: Request) => Promise<Response> }>

export type OperatorGatewayEnv = Readonly<{
  TRAVEL_COMMERCE_CONTROL?: ServiceBinding
  RECONCILIATION_OPERATOR_TOKEN?: string
  DEPLOY_LANE?: string
  ACCESS_ISSUER?: string
  ACCESS_AUDIENCE?: string
  ACCESS_JWKS_TIMEOUT_MS?: string
  ACCESS_JWKS_CACHE_TTL_MS?: string
  TRAVEL_CONTROL_TIMEOUT_MS?: string
}>

type Dependencies = Readonly<{
  fetchJwks?: (request: Request) => Promise<Response>
  nowMs?: () => number
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const json = (status: number, body: unknown, extra: HeadersInit = {}): Response => Response.json(body, {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    ...extra,
  },
})

const configuredToken = (value: unknown): string | null => {
  const token = typeof value === 'string' ? value.trim() : ''
  return token.length >= 32 && token.length <= 1_024
    && !token.startsWith('replace-with-') ? token : null
}

const configuredTimeout = (value: unknown): number | null => {
  const timeout = value == null || value === '' ? 5_000 : Number(value)
  return Number.isInteger(timeout) && timeout >= 100 && timeout <= 15_000 ? timeout : null
}

const exactConfiguration = (env: OperatorGatewayEnv) => {
  const access = readAccessJwtConfiguration(env)
  const token = configuredToken(env.RECONCILIATION_OPERATOR_TOKEN)
  const timeoutMs = configuredTimeout(env.TRAVEL_CONTROL_TIMEOUT_MS)
  const lane = typeof env.DEPLOY_LANE === 'string' && LANES.has(env.DEPLOY_LANE)
    ? env.DEPLOY_LANE : null
  const service = env.TRAVEL_COMMERCE_CONTROL
  const fields = access.ok ? [] : [...access.fields]
  if (!token) fields.push('RECONCILIATION_OPERATOR_TOKEN')
  if (timeoutMs === null) fields.push('TRAVEL_CONTROL_TIMEOUT_MS')
  if (!lane) fields.push('DEPLOY_LANE')
  if (!service || typeof service.fetch !== 'function') fields.push('TRAVEL_COMMERCE_CONTROL')
  return fields.length > 0 || !access.ok || !token || timeoutMs === null || !lane || !service
    ? Object.freeze({ ok: false as const, fields: Object.freeze(fields) })
    : Object.freeze({
        ok: true as const,
        access: access.value,
        token,
        timeoutMs,
        lane,
        service,
      })
}

const readBoundedJson = async (message: Request | Response): Promise<Record<string, unknown> | null> => {
  const contentType = message.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    if (message instanceof Response && message.body) await message.body.cancel()
    return null
  }
  const declared = Number(message.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    if (message instanceof Response && message.body) await message.body.cancel()
    return null
  }
  const text = await message.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

const pathIdentifiers = (pathname: string): Readonly<{ bundleId: string; cascadeId: string }> | null => {
  if (!pathname.startsWith(`${OPERATOR_GATEWAY_BASE_PATH}/`)) return null
  let segments: string[]
  try {
    segments = pathname.slice(OPERATOR_GATEWAY_BASE_PATH.length).split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  return segments.length === 6 && segments[0] === 'v1' && segments[1] === 'bundles'
    && IDENTIFIER.test(segments[2]) && segments[3] === 'cascades'
    && CASCADE_IDENTIFIER.test(segments[4]) && segments[5] === 'reconciliation'
    ? Object.freeze({ bundleId: segments[2], cascadeId: segments[4] })
    : null
}

const parseDecision = (value: Record<string, unknown> | null) => {
  if (!value) return null
  const allowed = new Set(['decision_id', 'decision', 'reason'])
  const decisionId = value.decision_id
  const decision = value.decision
  const reason = value.reason
  if (Object.keys(value).length !== allowed.size || Object.keys(value).some(key => !allowed.has(key))
    || typeof decisionId !== 'string' || !IDENTIFIER.test(decisionId)
    || (decision !== 'commit' && decision !== 'release')
    || typeof reason !== 'string' || reason.length < 1 || reason.length > 512
    || /[\u0000-\u001f\u007f]/u.test(reason)) return null
  return Object.freeze({ decision_id: decisionId, decision, reason })
}

const operatorId = async (access: AccessJwtConfiguration, sub: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`${access.issuer}\u0000${sub}`),
  )
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `cfaccess_${hex.slice(0, 40)}`
}

const capabilityProbe = async (
  config: Extract<ReturnType<typeof exactConfiguration>, { ok: true }>,
): Promise<boolean> => {
  try {
    const response = await config.service.fetch(new Request(
      'https://knowgrph-travel-commerce.internal/v1/reconciliation/runtime',
      {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    ))
    if (!response.ok) {
      if (response.body) await response.body.cancel()
      return false
    }
    const body = await readBoundedJson(response)
    const expected = new Set(['ok', 'service', 'lane', 'capability', 'contract'])
    return !!body && Object.keys(body).length === expected.size
      && Object.keys(body).every(key => expected.has(key))
      && body.ok === true && body.service === 'knowgrph-travel-commerce'
      && body.lane === config.lane && body.capability === 'resolve-reconciliation'
      && body.contract === CONTROL_CONTRACT
  } catch {
    return false
  }
}

const readiness = async (
  env: OperatorGatewayEnv,
  dependencies: Required<Dependencies>,
): Promise<Response> => {
  const config = exactConfiguration(env)
  if (!config.ok) {
    return json(503, {
      ok: false,
      service: 'knowgrph-travel-operator-gateway',
      code: 'configuration-missing',
      fields: config.fields,
    })
  }
  const [accessReady, travelReady] = await Promise.all([
    probeAccessJwks(config.access, dependencies.fetchJwks, dependencies.nowMs),
    capabilityProbe(config),
  ])
  return accessReady && travelReady
    ? json(200, {
        ok: true,
        service: 'knowgrph-travel-operator-gateway',
        lane: config.lane,
        contract: CONTROL_CONTRACT,
        dependencies: { accessJwks: 'ready', travelControl: 'ready' },
      })
    : json(503, {
        ok: false,
        service: 'knowgrph-travel-operator-gateway',
        code: 'dependency-unavailable',
        dependencies: {
          accessJwks: accessReady ? 'ready' : 'unavailable',
          travelControl: travelReady ? 'ready' : 'unavailable',
        },
      })
}

const forwardDecision = async (
  request: Request,
  identifiers: Readonly<{ bundleId: string; cascadeId: string }>,
  config: Extract<ReturnType<typeof exactConfiguration>, { ok: true }>,
  dependencies: Required<Dependencies>,
): Promise<Response> => {
  const assertion = request.headers.get('cf-access-jwt-assertion') ?? ''
  const verified = await verifyAccessJwt(
    assertion, config.access, dependencies.fetchJwks, dependencies.nowMs,
  )
  if (!verified.ok) return json(401, { ok: false, code: 'access-denied' })
  const decision = parseDecision(await readBoundedJson(request))
  if (!decision) return json(400, { ok: false, code: 'reconciliation-request-malformed' })
  const derivedOperatorId = await operatorId(config.access, verified.sub)
  try {
    const response = await config.service.fetch(new Request(
      `https://knowgrph-travel-commerce.internal/v1/bundles/${encodeURIComponent(identifiers.bundleId)}`
        + `/cascades/${encodeURIComponent(identifiers.cascadeId)}/reconciliation`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...decision, operator_id: derivedOperatorId }),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    ))
    if (![200, 404, 409].includes(response.status)) {
      if (response.body) await response.body.cancel()
      return json(response.status === 503 ? 503 : 502, {
        ok: false,
        code: response.status === 503 ? 'travel-control-unavailable' : 'travel-control-failed',
      })
    }
    const body = await readBoundedJson(response)
    return body ? json(response.status, body) : json(502, { ok: false, code: 'travel-control-malformed' })
  } catch (error) {
    return json(error instanceof DOMException && error.name === 'TimeoutError' ? 504 : 503, {
      ok: false,
      code: error instanceof DOMException && error.name === 'TimeoutError'
        ? 'travel-control-timeout' : 'travel-control-unavailable',
    })
  }
}

export const createTravelOperatorGateway = (dependencies: Dependencies = {}) => {
  const resolved: Required<Dependencies> = {
    fetchJwks: dependencies.fetchJwks ?? fetch,
    nowMs: dependencies.nowMs ?? Date.now,
  }
  return {
    async fetch(request: Request, env: OperatorGatewayEnv): Promise<Response> {
      const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
      if (pathname === `${OPERATOR_GATEWAY_BASE_PATH}/livez`) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'GET, HEAD' })
        }
        return request.method === 'HEAD'
          ? new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } })
          : json(200, { ok: true, service: 'knowgrph-travel-operator-gateway', status: 'live' })
      }
      if (pathname === `${OPERATOR_GATEWAY_BASE_PATH}/readyz`) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'GET, HEAD' })
        }
        const response = await readiness(env, resolved)
        return request.method === 'HEAD'
          ? new Response(null, { status: response.status, headers: response.headers }) : response
      }
      const identifiers = pathIdentifiers(pathname)
      if (!identifiers) return json(404, { ok: false, code: 'not-found' })
      if (request.method !== 'POST') {
        return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'POST' })
      }
      const config = exactConfiguration(env)
      return config.ok
        ? forwardDecision(request, identifiers, config, resolved)
        : json(503, { ok: false, code: 'configuration-missing', fields: config.fields })
    },
  } satisfies ExportedHandler<OperatorGatewayEnv>
}

export default createTravelOperatorGateway()
