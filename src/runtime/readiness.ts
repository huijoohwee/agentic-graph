import { permittedModelSet } from './model-license-filter'
import { readBoundedJson } from './bounded-json'

export type ReadinessCheck = Readonly<{
  name: string
  ok: boolean
  status: number | null
  elapsedMs: number
  reason: string | null
}>

export type ReadinessReport = Readonly<{
  ok: boolean
  lane: string
  checks: readonly ReadinessCheck[]
  checkedAt: string
}>

// The overflow service performs a bounded 10-second container readiness probe.
// Keep the parent deadline above that child deadline so cold-starting a healthy
// container is not reported as failed merely because the parent gave up first.
const SERVICE_PROBE_TIMEOUT_MS = 12_000
const LOCAL_PROBE_TIMEOUT_MS = 3_000
const READINESS_OBJECT_ID = '__knowgrph_travel_readiness__'
const MAX_READINESS_RESPONSE_BYTES = 64 * 1024

export async function inspectReadiness(env: TravelCommerceEnv): Promise<ReadinessReport> {
  const checks = await Promise.all([
    Promise.resolve(configurationCheck(env)),
    probeBundleGraph(env.BUNDLE_GRAPH),
    probeEnvelopeLedger(env.ENVELOPE_LEDGER),
    probeBalanceCache(env.BALANCE_CACHE),
    probeProvenanceArchive(env.PROVENANCE_ARCHIVE),
    Promise.resolve(bindingCheck('workers-ai', env.AI, 'run')),
    probeService('discovery-service', env.DISCOVERY_SERVICE),
    probeService('issuance-service', env.ISSUANCE_SERVICE),
    probeService('inference-overflow', env.INFERENCE_OVERFLOW),
  ])
  return Object.freeze({
    ok: checks.every((check) => check.ok),
    lane: env.DEPLOY_LANE,
    checks: Object.freeze(checks),
    checkedAt: new Date().toISOString(),
  })
}

async function probeBundleGraph(binding: TravelCommerceEnv['BUNDLE_GRAPH']): Promise<ReadinessCheck> {
  return probeLocalDependency('bundle-graph', async () => {
    const snapshot = await binding.getByName(READINESS_OBJECT_ID).getSnapshot()
    return snapshot === null || (!!snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot))
  })
}

async function probeEnvelopeLedger(binding: TravelCommerceEnv['ENVELOPE_LEDGER']): Promise<ReadinessCheck> {
  return probeLocalDependency('envelope-ledger', async () => {
    const balance = await binding.getByName(READINESS_OBJECT_ID).getAvailableBalance()
    if (!balance || typeof balance !== 'object' || Array.isArray(balance)) return false
    if ('kind' in balance) {
      return balance.kind === 'rejected' && balance.reason === 'envelope-unavailable'
    }
    return typeof balance.principalId === 'string'
      && Number.isSafeInteger(balance.availableBalanceMinor)
      && balance.availableBalanceMinor >= 0
      && typeof balance.revision === 'string'
  })
}

async function probeBalanceCache(binding: TravelCommerceEnv['BALANCE_CACHE']): Promise<ReadinessCheck> {
  return probeLocalDependency('balance-cache', async () => {
    const value = await binding.get(READINESS_OBJECT_ID)
    return value === null || typeof value === 'string'
  })
}

async function probeProvenanceArchive(binding: TravelCommerceEnv['PROVENANCE_ARCHIVE']): Promise<ReadinessCheck> {
  return probeLocalDependency('provenance-archive', async () => {
    const value = await binding.head(READINESS_OBJECT_ID)
    return value === null || (!!value && typeof value === 'object' && !Array.isArray(value))
  })
}

async function probeLocalDependency(name: string, operation: () => Promise<boolean>): Promise<ReadinessCheck> {
  const started = performance.now()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const valid = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new LocalProbeTimeout()), LOCAL_PROBE_TIMEOUT_MS)
      }),
    ])
    return check(name, valid, valid ? 200 : 503, started, valid ? null : 'probe-invalid')
  } catch (error) {
    return check(name, false, null, started, error instanceof LocalProbeTimeout ? 'probe-timeout' : 'probe-failed')
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

class LocalProbeTimeout extends Error {}

function configurationCheck(env: TravelCommerceEnv): ReadinessCheck {
  const started = performance.now()
  const permitted = permittedModelSet(env.MODEL_CATALOG_JSON, env.PERMITTED_MODEL_LICENSES_JSON)
  const wallMs = Number(env.CASCADE_WALL_MS)
  const tokenMinimum = env.DEPLOY_LANE === 'Production_Lane' ? 32 : 16
  const apiToken = typeof env.TRAVEL_COMMERCE_API_TOKEN === 'string' ? env.TRAVEL_COMMERCE_API_TOKEN : ''
  const overflowToken = typeof env.INFERENCE_OVERFLOW_TOKEN === 'string' ? env.INFERENCE_OVERFLOW_TOKEN : ''
  const valid = (
    !('kind' in permitted)
    && permitted.length > 0
    && Number.isSafeInteger(wallMs)
    && wallMs >= 100
    && wallMs <= 30_000
    && /^[A-Z]{3}$/.test(env.SETTLEMENT_CURRENCY)
    && apiToken.length >= tokenMinimum
    && overflowToken.length >= tokenMinimum
  )
  return check('configuration', valid, valid ? 200 : 503, started, valid ? null : 'invalid-or-missing')
}

function bindingCheck(name: string, binding: unknown, method: string): ReadinessCheck {
  const started = performance.now()
  const record = binding && typeof binding === 'object' ? binding as Record<string, unknown> : null
  const valid = typeof record?.[method] === 'function'
  return check(name, valid, valid ? 200 : 503, started, valid ? null : 'binding-unavailable')
}

async function probeService(name: string, binding: Fetcher): Promise<ReadinessCheck> {
  const started = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVICE_PROBE_TIMEOUT_MS)
  try {
    const response = await binding.fetch(new Request('https://service.internal/readyz', {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }))
    const valid = response.ok && await responseSaysReady(response)
    return check(name, valid, response.status, started, valid ? null : 'dependency-not-ready')
  } catch (error) {
    return check(
      name,
      false,
      null,
      started,
      error instanceof DOMException && error.name === 'AbortError' ? 'probe-timeout' : 'probe-failed',
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function responseSaysReady(response: Response): Promise<boolean> {
  const body = await readBoundedJson(response, MAX_READINESS_RESPONSE_BYTES)
  return !!body && typeof body === 'object' && !Array.isArray(body)
    && (body as Record<string, unknown>).ok === true
}

function check(
  name: string,
  ok: boolean,
  status: number | null,
  started: number,
  reason: string | null,
): ReadinessCheck {
  return Object.freeze({
    name,
    ok,
    status,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    reason,
  })
}
