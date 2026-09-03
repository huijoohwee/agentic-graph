import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { DIGEST, SHA, digest, seal } from './travel-mesh-release-plan.mjs'

export const LEGACY_WORKER_RETIREMENT_SCHEMA = 'agentic-os-legacy-worker-retirement/v1'
const PAYMENT_READINESS_SCHEMA = 'agentic-os-payment-live-readiness/v1'
const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1_000

const exposure = ({ routes = [], domains = [], workersDev = false }) => Object.freeze({
  routes: Object.freeze(routes.map(item => Object.freeze({ ...item }))),
  domains: Object.freeze(domains.map(item => Object.freeze({ ...item }))),
  workersDev: Object.freeze({ enabled: workersDev }),
})
const target = value => Object.freeze({
  ...value,
  continuity: Object.freeze([...value.continuity]),
  successorExposure: exposure(value.successorExposure),
})
export const LEGACY_WORKER_RETIREMENT_TARGETS = Object.freeze([
  target({
    id: 'storage', legacyWorker: 'agentic-graph-storage', successorWorker: 'agentic-storage',
    config: 'cloudflare/workers/agentic-graph-storage/wrangler.toml', environment: null,
    continuity: ['d1-reuse', 'r2-copy-or-equality', 'durable-object-transfer-or-export'], handoff: 'route-and-domain',
    successorExposure: {
      routes: [{ pattern: 'airvio.co/api/storage/*', zoneName: 'airvio.co' }],
      domains: [{ hostname: 'storage.airvio.co' }],
    },
  }),
  target({
    id: 'mcp', legacyWorker: 'agentic-graph-mcp', successorWorker: 'agentic-mcp',
    config: 'cloudflare/workers/agentic-graph-mcp/wrangler.toml', environment: null,
    continuity: ['kv', 'r2-copy-or-equality', 'durable-object-transfer-or-export'], handoff: 'route',
    successorExposure: { routes: [
      { pattern: 'airvio.co/agentic-os/control-plane/agents', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/agentic-os/control-plane/agents/*', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/agentic-os/control-plane/mcp', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/agentic-os/control-plane/mcp/*', zoneName: 'airvio.co' },
    ] },
  }),
  target({
    id: 'mcp-dev', legacyWorker: 'agentic-graph-mcp-dev', successorWorker: 'agentic-mcp-dev',
    config: 'cloudflare/workers/agentic-graph-mcp/wrangler.toml', environment: 'dev',
    continuity: ['kv', 'durable-object-transfer-or-export'], handoff: 'workers-dev',
    successorExposure: { workersDev: true },
  }),
  target({
    id: 'payment', legacyWorker: 'agentic-graph-payment', successorWorker: 'agentic-payment',
    config: 'cloudflare/workers/agentic-graph-payment/wrangler.toml', environment: null,
    continuity: ['d1-reuse', 'kv-reuse', 'r2-copy-or-equality', 'queue-drain', 'durable-object-transfer-or-export'], handoff: 'route',
    successorExposure: { routes: [
      { pattern: 'airvio.co/.well-known/acp-config', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/api', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/api/payments/*', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/api/strytree*', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/api/v1', zoneName: 'airvio.co' },
      { pattern: 'airvio.co/checkout/sessions*', zoneName: 'airvio.co' },
    ] },
  }),
])

export const legacyWorkerRetirementPlanDigest = () => digest(LEGACY_WORKER_RETIREMENT_TARGETS)

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} must be exact non-empty text`)
  return value
}
const digestText = (value, label) => {
  const normalized = text(value, label)
  if (!DIGEST.test(normalized)) throw new Error(`${label} must be a SHA-256 digest`)
  return normalized
}
const exactKeys = (value, keys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort(), expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys are not exact`)
  }
  return value
}
const exactIds = (records, ids, label) => {
  if (!Array.isArray(records) || records.length !== ids.length) throw new Error(`${label} must contain every target exactly once`)
  const seen = new Set()
  for (const record of records) {
    const id = text(record?.id, `${label} id`)
    if (!ids.includes(id) || seen.has(id)) throw new Error(`${label} target identity is invalid or duplicated`)
    seen.add(id)
  }
  return records
}
const date = (value, label) => {
  const normalized = text(value, label), milliseconds = Date.parse(normalized)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) throw new Error(`${label} must be an exact ISO timestamp`)
  return milliseconds
}
const targetById = new Map(LEGACY_WORKER_RETIREMENT_TARGETS.map(item => [item.id, item]))
const targetIds = LEGACY_WORKER_RETIREMENT_TARGETS.map(item => item.id)

const deployment = (value, label) => {
  exactKeys(value, ['percentage', 'versionId'], label)
  if (value.percentage !== 100) throw new Error(`${label} must be weighted at 100 percent`)
  text(value.versionId, `${label} versionId`)
}
const workerInventory = (value, expectedWorker, label) => {
  exactKeys(value, [
    'bindingsDigest', 'deployment', 'domainsDigest', 'previewUrlsEnabled', 'routesDigest', 'secretNamesDigest', 'subdomainEnabled', 'worker',
  ], label)
  if (value.worker !== expectedWorker) throw new Error(`${label} Worker identity is not exact`)
  deployment(value.deployment, `${label} deployment`)
  for (const key of ['bindingsDigest', 'domainsDigest', 'routesDigest', 'secretNamesDigest']) digestText(value[key], `${label} ${key}`)
  for (const key of ['previewUrlsEnabled', 'subdomainEnabled']) if (typeof value[key] !== 'boolean') throw new Error(`${label} ${key} must be boolean`)
}
const inventory = value => {
  exactKeys(value, ['firstDigest', 'secondDigest', 'targets'], 'retirement inventory')
  const firstDigest = digestText(value.firstDigest, 'retirement inventory firstDigest')
  if (firstDigest !== digestText(value.secondDigest, 'retirement inventory secondDigest')) {
    throw new Error('retirement inventory is not stable across the required double read')
  }
  exactIds(value.targets, targetIds, 'retirement inventory')
  for (const record of value.targets) {
    exactKeys(record, ['id', 'legacy', 'successor'], `retirement inventory ${record.id}`)
    const item = targetById.get(record.id)
    workerInventory(record.legacy, item.legacyWorker, `retirement inventory ${record.id} legacy`)
    workerInventory(record.successor, item.successorWorker, `retirement inventory ${record.id} successor`)
  }
  if (firstDigest !== digest(value.targets)) throw new Error('retirement inventory digest does not bind the exact target snapshots')
  return value
}
const continuity = (value, inventoryValue) => {
  if (!Array.isArray(value)) throw new Error('retirement continuity must be an array')
  const expected = LEGACY_WORKER_RETIREMENT_TARGETS.flatMap(item => item.continuity.map(kind => `${item.id}\0${kind}`)).sort()
  const actual = []
  for (const record of value) {
    exactKeys(record, ['id', 'kind', 'legacyVersionId', 'receiptDigest', 'status', 'successorVersionId'], 'retirement continuity record')
    const item = targetById.get(text(record.id, 'retirement continuity id'))
    const kind = text(record.kind, 'retirement continuity kind')
    if (!item || !item.continuity.includes(kind) || record.status !== 'passed') throw new Error('retirement continuity is incomplete')
    const targetInventory = inventoryValue.targets.find(target => target.id === item.id)
    if (record.legacyVersionId !== targetInventory.legacy.deployment.versionId || record.successorVersionId !== targetInventory.successor.deployment.versionId) {
      throw new Error(`retirement continuity ${item.id} deployment version drifted`)
    }
    text(record.legacyVersionId, 'retirement continuity legacyVersionId')
    text(record.successorVersionId, 'retirement continuity successorVersionId')
    digestText(record.receiptDigest, 'retirement continuity receiptDigest')
    actual.push(`${item.id}\0${kind}`)
  }
  if (actual.length !== expected.length || actual.sort().some((key, index) => key !== expected[index])) {
    throw new Error('retirement continuity does not exactly cover the required state transitions')
  }
}
const routeRef = value => `route:${value.zoneName}\u0000${value.pattern}`
const domainRef = value => `domain:${value.hostname}`
const refKind = value => value.startsWith('route:') ? 'route' : value.startsWith('domain:') ? 'domain' : value === 'workers-dev' ? 'workers-dev' : ''
const sortedUnique = (refs, label) => {
  if (refs.some((value, index) => index > 0 && refs[index - 1] >= value)) throw new Error(`${label} must be sorted and unique`)
  return refs
}
const exposures = (value, label) => {
  exactKeys(value, ['domains', 'routes', 'workersDev'], label)
  if (!Array.isArray(value.routes) || !Array.isArray(value.domains)) throw new Error(`${label} routes and domains must be arrays`)
  const routes = value.routes.map((route, index) => {
    exactKeys(route, ['pattern', 'zoneName'], `${label} route ${index}`)
    text(route.pattern, `${label} route ${index} pattern`)
    text(route.zoneName, `${label} route ${index} zoneName`)
    return routeRef(route)
  })
  const domains = value.domains.map((domain, index) => {
    exactKeys(domain, ['hostname'], `${label} domain ${index}`)
    text(domain.hostname, `${label} domain ${index} hostname`)
    return domainRef(domain)
  })
  exactKeys(value.workersDev, ['enabled'], `${label} Workers.dev`)
  if (typeof value.workersDev.enabled !== 'boolean') throw new Error(`${label} Workers.dev enabled must be boolean`)
  sortedUnique(routes, `${label} routes`)
  sortedUnique(domains, `${label} domains`)
  const refs = [...routes, ...domains, ...(value.workersDev.enabled ? ['workers-dev'] : [])]
  return Object.freeze({ refs: Object.freeze(refs), routes: Object.freeze(routes), domains: Object.freeze(domains), workersDev: value.workersDev.enabled })
}
const exactExposure = (value, expected, label) => {
  const actual = exposures(value, label), required = exposures(expected, `${label} expected`)
  if (actual.refs.length !== required.refs.length || actual.refs.some((ref, index) => ref !== required.refs[index])) {
    throw new Error(`${label} does not exactly match the committed successor exposure`)
  }
  return actual
}
const mappings = (value, legacy, successor, label, status) => {
  if (!Array.isArray(value)) throw new Error(`${label} mappings must be an array`)
  if (status === 'detached') {
    if (value.length !== 0) throw new Error(`${label} detached mappings must be empty`)
    return
  }
  const seen = new Set()
  for (const record of value) {
    exactKeys(record, ['kind', 'legacyRef', 'successorRef'], `${label} mapping`)
    const kind = text(record.kind, `${label} mapping kind`)
    const legacyRef = text(record.legacyRef, `${label} mapping legacyRef`)
    const successorRef = text(record.successorRef, `${label} mapping successorRef`)
    if (!['route', 'domain', 'workers-dev'].includes(kind) || refKind(legacyRef) !== kind || refKind(successorRef) !== kind) {
      throw new Error(`${label} mapping kind is invalid`)
    }
    if (!legacy.refs.includes(legacyRef) || !successor.refs.includes(successorRef) || seen.has(legacyRef)) {
      throw new Error(`${label} mapping is not an exact live-to-successor exposure`)
    }
    seen.add(legacyRef)
  }
  if (seen.size !== legacy.refs.length) throw new Error(`${label} mappings do not cover every legacy exposure exactly once`)
}
const handoffs = (value, status, inventoryValue) => {
  exactIds(value, targetIds, 'retirement handoffs')
  for (const record of value) {
    exactKeys(record, ['id', 'legacy', 'mappings', 'receiptDigest', 'status', 'successor'], `retirement handoff ${record.id}`)
    const item = targetById.get(record.id)
    if (record.status !== (status === 'detached' ? 'detached' : 'prepared')) throw new Error(`retirement handoff ${item.id} status is invalid`)
    const legacy = exposures(record.legacy, `retirement handoff ${item.id} legacy`)
    const successor = exactExposure(record.successor, item.successorExposure, `retirement handoff ${item.id} successor`)
    const targetInventory = inventoryValue.targets.find(target => target.id === item.id)
    if (targetInventory.legacy.routesDigest !== digest(record.legacy.routes) || targetInventory.legacy.domainsDigest !== digest(record.legacy.domains) || targetInventory.legacy.subdomainEnabled !== legacy.workersDev) {
      throw new Error(`retirement handoff ${item.id} legacy exposure is not bound to the observed inventory`)
    }
    if (targetInventory.successor.routesDigest !== digest(record.successor.routes) || targetInventory.successor.domainsDigest !== digest(record.successor.domains) || targetInventory.successor.subdomainEnabled !== successor.workersDev) {
      throw new Error(`retirement handoff ${item.id} successor exposure is not bound to the observed inventory`)
    }
    digestText(record.receiptDigest, `retirement handoff ${item.id} receiptDigest`)
    if (status === 'preflight-passed') {
      if (item.handoff.includes('route') && legacy.routes.length === 0) throw new Error(`retirement handoff ${item.id} lacks legacy route evidence`)
      if (item.handoff === 'route-and-domain' && legacy.domains.length === 0) throw new Error(`retirement handoff ${item.id} lacks legacy domain evidence`)
      if (item.handoff === 'workers-dev' && !legacy.workersDev) throw new Error(`retirement handoff ${item.id} lacks legacy Workers.dev evidence`)
    }
    if (status === 'detached' && (legacy.refs.length !== 0 || legacy.workersDev)) {
      throw new Error(`retirement handoff ${item.id} retains a legacy exposure`)
    }
    mappings(record.mappings, legacy, successor, `retirement handoff ${item.id}`, status)
  }
}
const probes = (value, inventoryValue, observedAt, expiresAt) => {
  exactIds(value, targetIds, 'retirement functional probes')
  for (const record of value) {
    exactKeys(record, ['httpStatus', 'id', 'observedAt', 'receiptDigest', 'status', 'successorVersionId'], `retirement functional probe ${record.id}`)
    if (record.status !== 'passed') throw new Error(`retirement functional probe ${record.id} did not pass`)
    if (!Number.isSafeInteger(record.httpStatus) || record.httpStatus < 200 || record.httpStatus > 299) throw new Error(`retirement functional probe ${record.id} did not return a successful HTTP status`)
    const targetInventory = inventoryValue.targets.find(item => item.id === record.id)
    if (record.successorVersionId !== targetInventory.successor.deployment.versionId) throw new Error(`retirement functional probe ${record.id} successor version drifted`)
    const probeAt = date(record.observedAt, `retirement functional probe ${record.id} observedAt`)
    if (probeAt < observedAt || probeAt > expiresAt) throw new Error(`retirement functional probe ${record.id} observation is outside the evidence window`)
    digestText(record.receiptDigest, `retirement functional probe ${record.id} receiptDigest`)
  }
}
const rollback = (value, inventoryValue) => {
  exactIds(value, targetIds, 'retirement rollback evidence')
  for (const record of value) {
    exactKeys(record, ['id', 'legacyVersionId', 'receiptDigest', 'status', 'successorVersionId'], `retirement rollback ${record.id}`)
    if (record.status !== 'proved') throw new Error(`retirement rollback ${record.id} is not proved`)
    const targetInventory = inventoryValue.targets.find(item => item.id === record.id)
    text(record.legacyVersionId, `retirement rollback ${record.id} legacyVersionId`)
    text(record.successorVersionId, `retirement rollback ${record.id} successorVersionId`)
    if (record.legacyVersionId !== targetInventory.legacy.deployment.versionId || record.successorVersionId !== targetInventory.successor.deployment.versionId) {
      throw new Error(`retirement rollback ${record.id} deployment version drifted`)
    }
    digestText(record.receiptDigest, `retirement rollback ${record.id} receiptDigest`)
  }
}
const paymentReadiness = (value, inventoryValue) => {
  exactKeys(value, ['asset', 'configurationDigest', 'network', 'operatorAuthorizationReceiptDigest', 'receiptDigest', 'schema', 'status', 'versionId', 'worker', 'x402PayToAddress'], 'payment retirement readiness')
  if (value.schema !== PAYMENT_READINESS_SCHEMA || value.status !== 'ready') throw new Error('payment retirement readiness is not ready')
  if (value.worker !== 'agentic-payment' || value.versionId !== inventoryValue.targets.find(item => item.id === 'payment').successor.deployment.versionId) {
    throw new Error('payment retirement readiness is not bound to the observed successor deployment')
  }
  text(value.network, 'payment retirement readiness network')
  text(value.asset, 'payment retirement readiness asset')
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.x402PayToAddress) || /^0x0{40}$/i.test(value.x402PayToAddress)) {
    throw new Error('payment retirement readiness requires a non-placeholder operator x402 payee')
  }
  digestText(value.configurationDigest, 'payment retirement readiness configurationDigest')
  digestText(value.operatorAuthorizationReceiptDigest, 'payment retirement readiness operatorAuthorizationReceiptDigest')
  digestText(value.receiptDigest, 'payment retirement readiness receiptDigest')
}

const validateDraft = (value, { now = new Date(), sourceRevision } = {}) => {
  if (!isRecord(value) || !['preflight-passed', 'detached'].includes(value.status)) throw new Error('legacy Worker retirement status is invalid')
  const statusKeys = value.status === 'detached' ? ['preflightInventoryDigest', 'preflightReceiptDigest'] : []
  exactKeys(value, [
    'continuity', 'expiresAt', 'handoffs', 'inventory', 'observedAt', 'paymentReadiness', 'planDigest', 'probes', 'rollback',
    'schema', 'sourceRevision', 'status', ...statusKeys,
  ], 'legacy Worker retirement evidence')
  if (value.schema !== LEGACY_WORKER_RETIREMENT_SCHEMA) throw new Error('legacy Worker retirement schema is invalid')
  if (!SHA.test(value.sourceRevision) || (sourceRevision && value.sourceRevision !== sourceRevision)) throw new Error('legacy Worker retirement source revision is invalid')
  if (value.planDigest !== legacyWorkerRetirementPlanDigest()) throw new Error('legacy Worker retirement plan digest drifted')
  const observedAt = date(value.observedAt, 'legacy Worker retirement observedAt')
  const expiresAt = date(value.expiresAt, 'legacy Worker retirement expiresAt')
  if (observedAt > now.getTime() || expiresAt <= observedAt || expiresAt - observedAt > MAX_EVIDENCE_AGE_MS || expiresAt < now.getTime()) {
    throw new Error('legacy Worker retirement evidence is expired or exceeds its bounded lifetime')
  }
  const inspectedInventory = inventory(value.inventory)
  if (value.status === 'detached') {
    digestText(value.preflightReceiptDigest, 'legacy Worker retirement preflightReceiptDigest')
    digestText(value.preflightInventoryDigest, 'legacy Worker retirement preflightInventoryDigest')
  }
  continuity(value.continuity, inspectedInventory)
  handoffs(value.handoffs, value.status, inspectedInventory)
  probes(value.probes, inspectedInventory, observedAt, expiresAt)
  rollback(value.rollback, inspectedInventory)
  paymentReadiness(value.paymentReadiness, inspectedInventory)
  return Object.freeze({ ...value })
}

const assertReceipt = (receipt, options) => {
  if (!isRecord(receipt) || !DIGEST.test(receipt.receiptDigest ?? '')) throw new Error('legacy Worker retirement receipt is missing its digest')
  const { receiptDigest, ...evidence } = receipt
  if (digest(evidence) !== receiptDigest) throw new Error('legacy Worker retirement receipt digest drifted')
  validateDraft(evidence, options)
  return Object.freeze({ ...receipt })
}
export const sealLegacyWorkerRetirementPreflight = (evidence, options) => {
  const validated = validateDraft(evidence, options)
  if (validated.status !== 'preflight-passed') throw new Error('legacy Worker retirement preflight must not claim detachment')
  return seal(validated)
}
export const assertLegacyWorkerRetirementEvidence = (receipt, options) => {
  const validated = assertReceipt(receipt, options)
  if (validated.status !== 'preflight-passed') throw new Error('legacy Worker retirement receipt is not a preflight')
  return validated
}
export const sealLegacyWorkerRetirementDetached = (evidence, preflight, options) => {
  const prior = assertLegacyWorkerRetirementEvidence(preflight, options)
  const validated = validateDraft(evidence, options)
  if (validated.status !== 'detached') throw new Error('legacy Worker retirement detached receipt must claim detachment')
  if (validated.preflightReceiptDigest !== prior.receiptDigest || validated.preflightInventoryDigest !== prior.inventory.firstDigest) {
    throw new Error('legacy Worker retirement detached receipt is not bound to its exact preflight')
  }
  if (validated.inventory.firstDigest === prior.inventory.firstDigest) throw new Error('legacy Worker retirement detached inventory was not freshly observed')
  return seal(validated)
}
export const assertLegacyWorkerRetirementDetached = (receipt, preflight, options) => {
  const validated = assertReceipt(receipt, options)
  if (validated.status !== 'detached') throw new Error('legacy Worker retirement receipt is not a detached handoff')
  const prior = assertLegacyWorkerRetirementEvidence(preflight, options)
  if (validated.preflightReceiptDigest !== prior.receiptDigest || validated.preflightInventoryDigest !== prior.inventory.firstDigest) {
    throw new Error('legacy Worker retirement detached receipt is not bound to its exact preflight')
  }
  if (validated.inventory.firstDigest === prior.inventory.firstDigest) throw new Error('legacy Worker retirement detached inventory was not freshly observed')
  return validated
}

const argumentValue = (args, name) => {
  const prefix = `${name}=`
  const match = args.find(value => value.startsWith(prefix))
  return match ? match.slice(prefix.length) : ''
}
const main = () => {
  const [command, ...args] = process.argv.slice(2)
  if (command !== 'validate') throw new Error('usage: legacy-worker-retirement.mjs validate --receipt=PATH --source-sha=SHA')
  const receiptPath = path.resolve(text(argumentValue(args, '--receipt'), '--receipt'))
  const sourceRevision = text(argumentValue(args, '--source-sha'), '--source-sha')
  let receipt
  try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) } catch { throw new Error('legacy Worker retirement receipt must be readable JSON') }
  const validated = assertLegacyWorkerRetirementEvidence(receipt, { sourceRevision })
  process.stdout.write(`${JSON.stringify({ schema: `${LEGACY_WORKER_RETIREMENT_SCHEMA}/validation`, status: 'passed', receiptDigest: validated.receiptDigest })}\n`)
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main()
