import {
  DISCOVERY_PATH,
  EXPERIENCE_CATEGORY,
  LIVE_PATH,
  MAX_REQUEST_BYTES,
  READY_PATH,
  REGISTRY_COMPONENT,
  parseDiscoveryRequest,
  parseJsonBytes,
  readBoundedBytes,
} from './contract'
import {
  discoverVerifiedExperience,
  probeExperienceCapability,
  readExperienceConfiguration,
  type ExperienceDiscoveryRuntimeEnv,
  type ProviderFetch,
} from './provider'

const SERVICE = 'knowgrph-travel-experience-discovery'

const json = (status: number, body: unknown, headers: HeadersInit = {}): Response => {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('cache-control', 'no-store')
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  responseHeaders.set('x-content-type-options', 'nosniff')
  return Response.json(body, { status, headers: responseHeaders })
}

const headFrom = (response: Response): Response => new Response(null, {
  status: response.status,
  headers: response.headers,
})

const requestJson = async (request: Request): Promise<unknown | null> => {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return null
  const bytes = await readBoundedBytes(
    request.body,
    request.headers.get('content-length'),
    MAX_REQUEST_BYTES,
  )
  return bytes ? parseJsonBytes(bytes) : null
}

const readiness = async (
  env: ExperienceDiscoveryRuntimeEnv,
  fetchProvider: ProviderFetch,
  nowMs: () => number,
): Promise<Response> => {
  const configuration = readExperienceConfiguration(env)
  if (!configuration.ok) return json(503, {
    ok: false,
    service: SERVICE,
    code: 'provider-unconfigured',
    fields: configuration.fields,
    dependencies: { experienceProvider: 'blocked-by-configuration' },
    capabilities: {
      categories: [EXPERIENCE_CATEGORY],
      inventory: 'live-search-and-verify',
      verificationRequired: false,
    },
  })
  const result = await probeExperienceCapability(configuration.config, fetchProvider, nowMs)
  if (!result.ok) return json(503, {
    ok: false,
    service: SERVICE,
    code: `provider-uat-probe-${result.code}`,
    dependencies: { experienceProvider: 'live-search-verify-probe-failed' },
    providerStatus: result.status,
    providerProbe: 'failed',
    capabilities: {
      categories: [EXPERIENCE_CATEGORY],
      inventory: 'live-search-and-verify',
      verificationRequired: false,
    },
  })
  return json(200, {
    ok: true,
    service: SERVICE,
    provider: configuration.config.providerId,
    dependencies: { experienceProvider: 'live-search-verify-probe-passed' },
    configuredRoutes: Object.keys(configuration.config.routes).length,
    providerProbe: 'live-authenticated-search-verify-passed',
    capabilities: {
      categories: [EXPERIENCE_CATEGORY],
      inventory: 'live-search-and-verify',
      verificationRequired: false,
    },
  })
}

const requote = async (
  request: Request,
  env: ExperienceDiscoveryRuntimeEnv,
  fetchProvider: ProviderFetch,
  nowMs: () => number,
): Promise<Response> => {
  if (request.headers.get('x-knowgrph-component') !== REGISTRY_COMPONENT) {
    return json(403, { ok: false, code: 'unauthorized-discovery-caller' })
  }
  const parsed = parseDiscoveryRequest(await requestJson(request))
  if (!parsed) return json(400, { ok: false, code: 'discovery-request-invalid' })
  const configuration = readExperienceConfiguration(env)
  if (!configuration.ok) return json(503, {
    ok: false,
    code: 'provider-unconfigured',
    fields: configuration.fields,
  })
  const result = await discoverVerifiedExperience({
    request: parsed,
    config: configuration.config,
    fetchProvider,
    nowMs,
  })
  console.log(JSON.stringify({
    type: 'travel_experience_discovery_cost_log',
    provider: configuration.config.providerId,
    attempts: result.attempted,
    resolved: result.ok ? 1 : 0,
    receivedOffers: result.receivedOffers ?? 0,
    modelCalls: 0,
    estimatedCostUsd: 0,
    recordedAt: new Date(nowMs()).toISOString(),
  }))
  return result.ok
    ? json(200, result.quote)
    : json(result.status, {
        ok: false,
        code: result.code,
        ...(result.fields ? { fields: result.fields } : {}),
      })
}

export const createExperienceDiscoveryWorker = (
  fetchProvider: ProviderFetch,
  nowMs: () => number = Date.now,
) => ({
  async fetch(request: Request, env: ExperienceDiscoveryRuntimeEnv): Promise<Response> {
    const url = new URL(request.url)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
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
      const requiredCategory = url.searchParams.get('required_category')
      if (requiredCategory !== null && requiredCategory !== EXPERIENCE_CATEGORY) {
        return json(400, { ok: false, code: 'unsupported-required-category' })
      }
      const response = await readiness(env, fetchProvider, nowMs)
      return request.method === 'HEAD' ? headFrom(response) : response
    }
    if (pathname !== DISCOVERY_PATH) return json(404, { ok: false, code: 'route-not-found' })
    if (request.method !== 'POST') {
      return json(405, { ok: false, code: 'method-not-allowed' }, { allow: 'POST' })
    }
    try {
      return await requote(request, env, fetchProvider, nowMs)
    } catch (error) {
      console.error(JSON.stringify({
        type: 'travel_experience_discovery_error',
        code: 'unexpected-adapter-failure',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }))
      return json(503, { ok: false, code: 'provider-unavailable' })
    }
  },
})

const worker = createExperienceDiscoveryWorker((request) => fetch(request))

export default worker satisfies ExportedHandler<ExperienceDiscoveryRuntimeEnv>
