export const TRAVEL_BUNDLE_MAP_SCHEMA = 'agenticgraph-shared-canvas-travel-bundle-map/v1'

const DEFAULT_DISPATCH_TIMEOUT_MS = 12_000
const MIN_DISPATCH_TIMEOUT_MS = 100
const MAX_DISPATCH_TIMEOUT_MS = 15_000
const MAX_BUNDLE_MAP_ENTRIES = 256
const MAX_BUNDLE_MAP_BYTES = 256 * 1_024
const MAX_BUNDLE_LEGS = 20
const MAX_BUNDLE_EDGES = 20
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type TravelCommerceServiceBinding = {
  fetch: (request: Request) => Promise<Response>
}

export type TravelMutationTriggerEnv = {
  AGENTICGRAPH_TRAVEL_COMMERCE?: TravelCommerceServiceBinding
  AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN?: string
  SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON?: string
  SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS?: string
}

export type TravelBundleSeedLeg = Readonly<{
  leg_id: string
  category: string
  committed_offer_id: string | null
  committed_amount_minor: number | null
}>

export type TravelBundleSeed = Readonly<{
  principal_id: string
  total_budget_minor: number
  legs: readonly TravelBundleSeedLeg[]
  edges: readonly Readonly<{ from_leg_id: string; to_leg_id: string }>[]
}>

export type TravelBundleMapEntry = Readonly<{
  workspaceId: string
  roomId: string
  nodeId: string
  bundleId: string
  initializationSeed: TravelBundleSeed
}>

export type TravelMutationTriggerReadiness = Readonly<{
  ok: boolean
  serviceBinding: 'ready' | 'missing'
  apiToken: 'ready' | 'missing-or-weak'
  bundleMap: 'ready' | 'missing' | 'invalid'
  dispatchTimeoutMs: number | null
  reasons: readonly string[]
}>

type ParsedBundleMap =
  | Readonly<{ ok: true; entries: ReadonlyMap<string, TravelBundleMapEntry> }>
  | Readonly<{ ok: false; missing: boolean }>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const expected = new Set(keys)
  return Object.keys(value).length === expected.size && Object.keys(value).every(key => expected.has(key))
}

export const readTravelIdentifier = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return IDENTIFIER_PATTERN.test(normalized) ? normalized : null
}

const readLocatorPart = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null
}

export const travelBundleLocatorKey = (value: {
  workspaceId: string
  roomId: string
  nodeId: string
}): string => JSON.stringify([value.workspaceId, value.roomId, value.nodeId])

const parseSeedLeg = (value: unknown): TravelBundleSeedLeg | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'leg_id', 'category', 'committed_offer_id', 'committed_amount_minor',
  ])) return null
  const legId = readTravelIdentifier(value.leg_id)
  const category = readTravelIdentifier(value.category)
  const offerId = value.committed_offer_id === null ? null : readTravelIdentifier(value.committed_offer_id)
  const amount = value.committed_amount_minor
  const amountMinor = amount === null
    ? null
    : typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : null
  if (!legId || !category || (value.committed_offer_id !== null && !offerId)) return null
  if ((offerId === null) !== (amountMinor === null)) return null
  return Object.freeze({
    leg_id: legId,
    category,
    committed_offer_id: offerId,
    committed_amount_minor: amountMinor,
  })
}

const hasCycle = (legIds: readonly string[], edges: TravelBundleSeed['edges']): boolean => {
  const indegree = new Map(legIds.map(legId => [legId, 0]))
  const outbound = new Map(legIds.map(legId => [legId, [] as string[]]))
  for (const edge of edges) {
    indegree.set(edge.to_leg_id, (indegree.get(edge.to_leg_id) ?? 0) + 1)
    outbound.get(edge.from_leg_id)?.push(edge.to_leg_id)
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([legId]) => legId)
  let visited = 0
  for (let index = 0; index < queue.length; index += 1) {
    const legId = queue[index]
    visited += 1
    for (const target of outbound.get(legId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  return visited !== legIds.length
}

const parseInitializationSeed = (value: unknown): TravelBundleSeed | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['principal_id', 'total_budget_minor', 'legs', 'edges'])) return null
  const principalId = readTravelIdentifier(value.principal_id)
  const budget = value.total_budget_minor
  if (!principalId || typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0) return null
  if (!Array.isArray(value.legs) || value.legs.length === 0 || value.legs.length > MAX_BUNDLE_LEGS) return null
  if (!Array.isArray(value.edges) || value.edges.length > MAX_BUNDLE_EDGES) return null
  const legs = value.legs.map(parseSeedLeg)
  if (legs.some(leg => !leg)) return null
  const lockedLegs = legs as TravelBundleSeedLeg[]
  const legIds = new Set(lockedLegs.map(leg => leg.leg_id))
  if (legIds.size !== lockedLegs.length) return null
  const committedTotal = lockedLegs.reduce((sum, leg) => sum + (leg.committed_amount_minor ?? 0), 0)
  if (!Number.isSafeInteger(committedTotal) || committedTotal > budget) return null
  const edges: Array<Readonly<{ from_leg_id: string; to_leg_id: string }>> = []
  const edgeIds = new Set<string>()
  for (const valueEdge of value.edges) {
    if (!isRecord(valueEdge) || !hasExactKeys(valueEdge, ['from_leg_id', 'to_leg_id'])) return null
    const fromLegId = readTravelIdentifier(valueEdge.from_leg_id)
    const toLegId = readTravelIdentifier(valueEdge.to_leg_id)
    if (!fromLegId || !toLegId || fromLegId === toLegId || !legIds.has(fromLegId) || !legIds.has(toLegId)) return null
    const identity = JSON.stringify([fromLegId, toLegId])
    if (edgeIds.has(identity)) return null
    edgeIds.add(identity)
    edges.push(Object.freeze({ from_leg_id: fromLegId, to_leg_id: toLegId }))
  }
  if (hasCycle([...legIds], edges)) return null
  return Object.freeze({
    principal_id: principalId,
    total_budget_minor: budget,
    legs: Object.freeze(lockedLegs),
    edges: Object.freeze(edges),
  })
}

export const parseTravelBundleMap = (value: unknown): ParsedBundleMap => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { ok: false, missing: true }
  if (new TextEncoder().encode(text).byteLength > MAX_BUNDLE_MAP_BYTES) return { ok: false, missing: false }
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    return { ok: false, missing: false }
  }
  if (!isRecord(decoded) || !hasExactKeys(decoded, ['schema', 'revision', 'entries'])
    || decoded.schema !== TRAVEL_BUNDLE_MAP_SCHEMA || !readTravelIdentifier(decoded.revision)
    || !Array.isArray(decoded.entries) || decoded.entries.length === 0
    || decoded.entries.length > MAX_BUNDLE_MAP_ENTRIES) return { ok: false, missing: false }
  const entries = new Map<string, TravelBundleMapEntry>()
  const bundleSeeds = new Map<string, string>()
  const bundleSeedValues = new Map<string, TravelBundleSeed>()
  for (const valueEntry of decoded.entries) {
    if (!isRecord(valueEntry) || !hasExactKeys(valueEntry, [
      'workspace_id', 'room_id', 'node_id', 'bundle_id', 'initialization_seed',
    ])) return { ok: false, missing: false }
    const workspaceId = readLocatorPart(valueEntry.workspace_id)
    const roomId = readLocatorPart(valueEntry.room_id)
    const nodeId = readTravelIdentifier(valueEntry.node_id)
    const bundleId = readTravelIdentifier(valueEntry.bundle_id)
    const initializationSeed = parseInitializationSeed(valueEntry.initialization_seed)
    if (!workspaceId || !roomId || !nodeId || !bundleId || !initializationSeed) return { ok: false, missing: false }
    const entry = Object.freeze({ workspaceId, roomId, nodeId, bundleId, initializationSeed })
    const locator = travelBundleLocatorKey(entry)
    if (entries.has(locator)) return { ok: false, missing: false }
    const canonicalSeed = JSON.stringify(initializationSeed)
    const priorSeed = bundleSeeds.get(bundleId)
    if (priorSeed && priorSeed !== canonicalSeed) return { ok: false, missing: false }
    bundleSeeds.set(bundleId, canonicalSeed)
    bundleSeedValues.set(bundleId, initializationSeed)
    entries.set(locator, entry)
  }
  const envelopes = new Map<string, { budget: number; committed: number }>()
  for (const seed of bundleSeedValues.values()) {
    const current = envelopes.get(seed.principal_id) ?? { budget: seed.total_budget_minor, committed: 0 }
    if (current.budget !== seed.total_budget_minor) return { ok: false, missing: false }
    current.committed += seed.legs.reduce((sum, leg) => sum + (leg.committed_amount_minor ?? 0), 0)
    if (!Number.isSafeInteger(current.committed) || current.committed > current.budget) {
      return { ok: false, missing: false }
    }
    envelopes.set(seed.principal_id, current)
  }
  return { ok: true, entries }
}

export const parseTravelDispatchTimeoutMs = (value: unknown): number | null => {
  if (value == null || String(value).trim() === '') return DEFAULT_DISPATCH_TIMEOUT_MS
  const parsed = Number(String(value).trim())
  return Number.isInteger(parsed) && parsed >= MIN_DISPATCH_TIMEOUT_MS && parsed <= MAX_DISPATCH_TIMEOUT_MS
    ? parsed
    : null
}

export const hasTravelServiceBinding = (value: unknown): value is TravelCommerceServiceBinding =>
  isRecord(value) && typeof value.fetch === 'function'

export const isConfiguredTravelToken = (value: string): boolean =>
  value.length >= 32 && !/^(?:replace-with|<)/i.test(value)

export const inspectTravelMutationTriggerReadiness = (
  env: TravelMutationTriggerEnv,
): TravelMutationTriggerReadiness => {
  const serviceBinding = hasTravelServiceBinding(env.AGENTICGRAPH_TRAVEL_COMMERCE) ? 'ready' : 'missing'
  const token = typeof env.AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN === 'string'
    ? env.AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN.trim()
    : ''
  const apiToken = isConfiguredTravelToken(token) ? 'ready' : 'missing-or-weak'
  const parsedMap = parseTravelBundleMap(env.SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON)
  const bundleMap = parsedMap.ok ? 'ready' : 'missing' in parsedMap && parsedMap.missing ? 'missing' : 'invalid'
  const dispatchTimeoutMs = parseTravelDispatchTimeoutMs(env.SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS)
  const reasons = [
    ...(serviceBinding === 'ready' ? [] : ['travel-service-binding-missing']),
    ...(apiToken === 'ready' ? [] : ['travel-service-token-missing-or-weak']),
    ...(bundleMap === 'ready' ? [] : [bundleMap === 'missing' ? 'travel-bundle-map-missing' : 'travel-bundle-map-invalid']),
    ...(dispatchTimeoutMs == null ? ['travel-dispatch-timeout-invalid'] : []),
  ]
  return Object.freeze({
    ok: reasons.length === 0,
    serviceBinding,
    apiToken,
    bundleMap,
    dispatchTimeoutMs,
    reasons: Object.freeze(reasons),
  })
}
