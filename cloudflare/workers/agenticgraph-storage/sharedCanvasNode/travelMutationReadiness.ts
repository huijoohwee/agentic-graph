import {
  inspectTravelMutationTriggerReadiness,
  type TravelMutationTriggerEnv,
  type TravelMutationTriggerReadiness,
} from './travelMutationConfig'
import { readBoundedJson } from '../../../../src/runtime/bounded-json'

const MAX_READY_BODY_BYTES = 16 * 1_024
// The travel service may spend up to 12s starting/probing its own downstream
// bindings. Reserve a further 3s for the authenticated runtime identity probe.
export const TRAVEL_MUTATION_READINESS_TIMEOUT_MS = 15_000

export type ProbedTravelMutationTriggerReadiness = TravelMutationTriggerReadiness & Readonly<{
  downstream: 'ready' | 'not-probed' | 'not-ready' | 'unreachable'
  downstreamStatus: number | null
}>

const readReadyBody = async (response: Response): Promise<boolean> => {
  const value = await readBoundedJson(response, MAX_READY_BODY_BYTES)
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).ok === true
}

export const probeTravelMutationTriggerReadiness = async (
  env: TravelMutationTriggerEnv,
  nowMs: () => number = Date.now,
): Promise<ProbedTravelMutationTriggerReadiness> => {
  const local = inspectTravelMutationTriggerReadiness(env)
  if (!local.ok || !env.AGENTICGRAPH_TRAVEL_COMMERCE || local.dispatchTimeoutMs == null) {
    return Object.freeze({ ...local, downstream: 'not-probed', downstreamStatus: null })
  }
  try {
    const deadlineAt = nowMs() + TRAVEL_MUTATION_READINESS_TIMEOUT_MS
    const fetchReady = async (path: string, authorization?: string): Promise<Response> => {
      const remainingMs = deadlineAt - nowMs()
      if (remainingMs < 1) throw new DOMException('travel-readiness-timeout', 'TimeoutError')
      const headers = new Headers({ accept: 'application/json' })
      if (authorization) headers.set('authorization', authorization)
      return env.AGENTICGRAPH_TRAVEL_COMMERCE!.fetch(new Request(
        `https://agenticgraph-travel-commerce.internal${path}`,
        { method: 'GET', headers, signal: AbortSignal.timeout(remainingMs) },
      ))
    }
    const response = await fetchReady('/readyz')
    const responseBodyReady = await readReadyBody(response)
    const dependencyReady = response.ok && responseBodyReady
    if (!dependencyReady) {
      const reasons = Object.freeze([...local.reasons, 'travel-service-not-ready'])
      return Object.freeze({
        ...local,
        ok: false,
        reasons,
        downstream: 'not-ready',
        downstreamStatus: response.status,
      })
    }
    const token = env.AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN!.trim()
    const authenticated = await fetchReady('/v1/runtime', `Bearer ${token}`)
    const authenticatedBodyReady = await readReadyBody(authenticated)
    const ready = authenticated.ok && authenticatedBodyReady
    const reasons = ready ? local.reasons : Object.freeze([...local.reasons, 'travel-service-not-ready'])
    return Object.freeze({
      ...local,
      ok: ready,
      reasons,
      downstream: ready ? 'ready' : 'not-ready',
      downstreamStatus: authenticated.status,
    })
  } catch {
    return Object.freeze({
      ...local,
      ok: false,
      reasons: Object.freeze([...local.reasons, 'travel-service-probe-failed']),
      downstream: 'unreachable',
      downstreamStatus: null,
    })
  }
}
