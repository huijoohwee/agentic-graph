import { useEffect, useSyncExternalStore } from 'react'
import { useAgenticOsRemoteGrammarAutoHydration } from './useAgenticOsRemoteGrammarAutoHydration'
import {
  AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  serializeAgenticCanvasOsDocsCatalogForDigest,
  serializeAgenticCanvasOsDocsRoutingForDigest,
} from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import {
  emptyProgressiveAgentsReadiness,
  normalizeProgressiveAgentsReadiness,
  type AgenticOsProgressiveAgentsReadinessSummary,
} from './agenticOsProgressiveAgentsReadiness'
import { normalizeAgenticOsRemoteGrammarCatalogProvenance } from './agenticOsRemoteGrammarProvenance'
import {
  createAgenticOsRemoteGrammarClient,
  type AgenticOsRemoteGrammarCatalogEntry,
  type AgenticOsRemoteGrammarPayload,
} from './agenticOsRemoteGrammarMcpClient'
import {
  emptyLiveProviderProof,
  normalizeLiveProviderProof,
  type AgenticOsLiveProviderProofSummary,
} from './agenticOsLiveProviderProof'
export { createAgenticOsRemoteGrammarClient }
export type { AgenticOsRemoteGrammarCatalogEntry }
export type AgenticOsRemoteGrammarSigil = '/' | '#' | '@'
const REMOTE_GRAMMAR_SIGIL_ORDER: readonly AgenticOsRemoteGrammarSigil[] = ['/', '#', '@'] as const
const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeToken = (value: unknown): string => normalizeString(value)
const normalizeRelatedTokens = (value: unknown, sigil: '#' | '@'): string[] => Array.isArray(value)
  ? [...new Set(value.map(normalizeString).filter(token => token.startsWith(sigil) && /^[/#@][A-Za-z0-9_.-]+$/.test(token)))].slice(0, 12)
  : []
const normalizeMcpTools = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.map(normalizeString).filter(tool => /^knowgrph\.[A-Za-z0-9_.-]+$/.test(tool)))].slice(0, 12)
  : []
const normalizeSigil = (value: unknown): AgenticOsRemoteGrammarSigil | null => {
  const token = normalizeToken(value)
  return token.startsWith('/') || token.startsWith('#') || token.startsWith('@')
    ? token[0] as AgenticOsRemoteGrammarSigil
    : null
}
const normalizeCatalogEntry = (entry: AgenticOsRemoteGrammarCatalogEntry): AgenticOsRemoteGrammarCatalogEntry | null => {
  const token = normalizeToken(entry.token)
  const sigil = normalizeSigil(token)
  if (!token || !sigil) return null
  const mcpTools = normalizeMcpTools(entry.mcpTools?.length ? entry.mcpTools : [entry.mcpTool])
  return {
    token,
    kind: normalizeString(entry.kind).toLowerCase(),
    label: normalizeString(entry.label),
    summary: normalizeString(entry.summary),
    intent: normalizeString(entry.intent),
    sourcePath: normalizeString(entry.sourcePath),
    sourceUrl: normalizeString(entry.sourceUrl),
    fileName: normalizeString(entry.fileName),
    keywords: Array.isArray(entry.keywords) ? entry.keywords.map(normalizeString).filter(Boolean) : [],
    mcpTool: mcpTools[0] || '',
    mcpTools,
    semantics: normalizeRelatedTokens(entry.semantics, '#'),
    bindings: normalizeRelatedTokens(entry.bindings, '@'),
  }
}
export type AgenticOsRemoteGrammarHydrationStatus = 'idle' | 'loading' | 'fresh' | 'stale' | 'blocked'
export type AgenticOsRemoteGrammarCatalogCounts = {
  slash: number
  hash: number
  at: number
}

export type AgenticOsRemoteGrammarSnapshot = {
  version: number
  entries: readonly AgenticOsRemoteGrammarCatalogEntry[]
  sourceRevision: string
  catalogDigest: string
  routingSchema: string
  routingDigest: string
  routingVerified: boolean
  hydration: {
    status: AgenticOsRemoteGrammarHydrationStatus
    attempts: number
    error: string
  }
  counts: AgenticOsRemoteGrammarCatalogCounts
  liveAgentProviderProof: AgenticOsLiveProviderProofSummary
  progressiveAgentsReadiness: AgenticOsProgressiveAgentsReadinessSummary
}

let remoteGrammarVersion = 0
let remoteGrammarEntriesByToken = new Map<string, AgenticOsRemoteGrammarCatalogEntry>()
let remoteGrammarSourceRevision = ''
let remoteGrammarCatalogDigest = ''
let remoteGrammarRoutingSchema = ''
let remoteGrammarRoutingDigest = ''
let remoteGrammarRoutingVerified = false
let remoteGrammarExpectedCounts: AgenticOsRemoteGrammarCatalogCounts | null = null
let remoteGrammarHydrationStatus: AgenticOsRemoteGrammarHydrationStatus = 'idle'
let remoteGrammarHydrationAttempts = 0
let remoteGrammarHydrationError = ''
let remoteGrammarHydrationEpoch = 0
let remoteGrammarSuccessfulSigils = new Map<AgenticOsRemoteGrammarSigil, string>()
let remoteGrammarRevisionReconciliations = new Set<string>()
let remoteGrammarLiveAgentProviderProof = emptyLiveProviderProof()
let remoteGrammarProgressiveAgentsReadiness = emptyProgressiveAgentsReadiness()
const emptyCounts = (): AgenticOsRemoteGrammarCatalogCounts => ({ slash: 0, hash: 0, at: 0 })
let remoteGrammarSnapshot: AgenticOsRemoteGrammarSnapshot = {
  version: remoteGrammarVersion,
  entries: [],
  sourceRevision: '',
  catalogDigest: '',
  routingSchema: '',
  routingDigest: '',
  routingVerified: false,
  hydration: { status: 'idle', attempts: 0, error: '' },
  counts: emptyCounts(),
  liveAgentProviderProof: remoteGrammarLiveAgentProviderProof,
  progressiveAgentsReadiness: remoteGrammarProgressiveAgentsReadiness,
}
const remoteGrammarListeners = new Set<() => void>()
const remoteGrammarHydrationPromises = new Map<string, Promise<readonly AgenticOsRemoteGrammarCatalogEntry[]>>()
let sharedAgenticOsRemoteGrammarClient = createAgenticOsRemoteGrammarClient()
const beginRemoteGrammarHydrationCycle = () => {
  remoteGrammarHydrationEpoch += 1
  remoteGrammarRevisionReconciliations = new Set()
  sharedAgenticOsRemoteGrammarClient = createAgenticOsRemoteGrammarClient()
  remoteGrammarHydrationPromises.clear()
}

const countRemoteGrammarEntries = (entries: readonly AgenticOsRemoteGrammarCatalogEntry[]): AgenticOsRemoteGrammarCatalogCounts => entries.reduce((counts, entry) => {
  const sigil = normalizeSigil(entry.token)
  if (sigil === '/') counts.slash += 1
  if (sigil === '#') counts.hash += 1
  if (sigil === '@') counts.at += 1
  return counts
}, emptyCounts())

const countsEqual = (
  left: AgenticOsRemoteGrammarCatalogCounts,
  right: AgenticOsRemoteGrammarCatalogCounts,
): boolean => left.slash === right.slash && left.hash === right.hash && left.at === right.at

const normalizePayloadCounts = (
  value: AgenticOsRemoteGrammarPayload['counts'],
): AgenticOsRemoteGrammarCatalogCounts | null => {
  const command = Number(value?.command)
  const semantic = Number(value?.semantic)
  const binding = Number(value?.binding)
  return [command, semantic, binding].every(count => Number.isInteger(count) && count >= 0)
    ? { slash: command, hash: semantic, at: binding }
    : null
}

const digestSerializedEntries = async (
  entries: readonly AgenticOsRemoteGrammarCatalogEntry[],
  serialize: (catalog: readonly AgenticOsRemoteGrammarCatalogEntry[]) => string,
): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Agentic OS catalog digest verification requires Web Crypto')
  }
  const bytes = new TextEncoder().encode(serialize(entries))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

const emitRemoteGrammarSnapshot = (): void => {
  remoteGrammarVersion += 1
  const entries = [...remoteGrammarEntriesByToken.values()].sort((left, right) => left.token.localeCompare(right.token))
  remoteGrammarSnapshot = {
    version: remoteGrammarVersion,
    entries,
    sourceRevision: remoteGrammarSourceRevision,
    catalogDigest: remoteGrammarCatalogDigest,
    routingSchema: remoteGrammarRoutingSchema,
    routingDigest: remoteGrammarRoutingDigest,
    routingVerified: remoteGrammarRoutingVerified,
    hydration: {
      status: remoteGrammarHydrationStatus,
      attempts: remoteGrammarHydrationAttempts,
      error: remoteGrammarHydrationError,
    },
    counts: countRemoteGrammarEntries(entries),
    liveAgentProviderProof: remoteGrammarLiveAgentProviderProof,
    progressiveAgentsReadiness: remoteGrammarProgressiveAgentsReadiness,
  }
  remoteGrammarListeners.forEach(listener => listener())
}

const finalizeRemoteGrammarHydration = async (hydrationEpoch: number): Promise<void> => {
  if (hydrationEpoch !== remoteGrammarHydrationEpoch) return
  if ([...remoteGrammarHydrationPromises.keys()].some(key => key.startsWith(`${hydrationEpoch}:`))) return
  const missingSigils = REMOTE_GRAMMAR_SIGIL_ORDER.filter(
    sigil => remoteGrammarSuccessfulSigils.get(sigil) !== remoteGrammarSourceRevision,
  )
  const entries = [...remoteGrammarEntriesByToken.values()]
  const actualCounts = countRemoteGrammarEntries(entries)
  let verifiedDigest = ''
  let verifiedRoutingDigest = ''
  if (missingSigils.length === 0 && remoteGrammarExpectedCounts && countsEqual(actualCounts, remoteGrammarExpectedCounts)) {
    try {
      verifiedDigest = await digestSerializedEntries(entries, serializeAgenticCanvasOsDocsCatalogForDigest)
      if (
        remoteGrammarRoutingSchema === AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
        && /^[0-9a-f]{64}$/.test(remoteGrammarRoutingDigest)
      ) {
        verifiedRoutingDigest = await digestSerializedEntries(entries, serializeAgenticCanvasOsDocsRoutingForDigest)
      }
    } catch (error) {
      remoteGrammarHydrationError = error instanceof Error ? error.message : 'Agentic OS catalog digest verification failed'
    }
  }
  const fresh = /^[0-9a-f]{40}$/.test(remoteGrammarSourceRevision)
    && /^[0-9a-f]{64}$/.test(remoteGrammarCatalogDigest)
    && missingSigils.length === 0
    && Boolean(remoteGrammarExpectedCounts && countsEqual(actualCounts, remoteGrammarExpectedCounts))
    && verifiedDigest === remoteGrammarCatalogDigest
  remoteGrammarRoutingVerified = fresh
    && remoteGrammarRoutingSchema === AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
    && verifiedRoutingDigest === remoteGrammarRoutingDigest
  remoteGrammarHydrationStatus = fresh ? 'fresh' : remoteGrammarEntriesByToken.size > 0 ? 'stale' : 'blocked'
  if (fresh) remoteGrammarHydrationError = ''
  else if (!remoteGrammarHydrationError) {
    remoteGrammarHydrationError = missingSigils.length > 0
      ? `Agentic OS remote grammar hydration incomplete for ${missingSigils.join(' ')}`
      : !remoteGrammarExpectedCounts || !countsEqual(actualCounts, remoteGrammarExpectedCounts)
        ? 'Agentic OS remote grammar catalog counts do not match the MCP source catalog'
        : 'Agentic OS remote grammar catalog digest does not match the MCP source catalog'
  }
  emitRemoteGrammarSnapshot()
}

export const hydrateAgenticOsRemoteGrammarCatalogBySigils = async (
  sigils: readonly AgenticOsRemoteGrammarSigil[],
  options: { force?: boolean } = {},
): Promise<void> => {
  const hydrationEpoch = remoteGrammarHydrationEpoch
  const uniqueSigils = sigils.filter((sigil, index) => sigils.indexOf(sigil) === index)
  if (options.force) uniqueSigils.forEach(sigil => remoteGrammarSuccessfulSigils.delete(sigil))
  await Promise.all(uniqueSigils.map(sigil => primeAgenticOsRemoteGrammarCatalogBySigil(sigil, options)))
  if (hydrationEpoch !== remoteGrammarHydrationEpoch) return
  const revision = remoteGrammarSourceRevision
  const rolloverSigils = uniqueSigils.filter(sigil => {
    const successfulRevision = remoteGrammarSuccessfulSigils.get(sigil)
    const reconciliationKey = `${sigil}:${revision}`
    if (!successfulRevision || successfulRevision === revision || remoteGrammarRevisionReconciliations.has(reconciliationKey)) return false
    remoteGrammarRevisionReconciliations.add(reconciliationKey)
    return true
  })
  await Promise.all(rolloverSigils.map(sigil => primeAgenticOsRemoteGrammarCatalogBySigil(sigil, { force: true, maxAttempts: 1 })))
  await finalizeRemoteGrammarHydration(hydrationEpoch)
}

const mergeCatalogEntry = (
  previous: AgenticOsRemoteGrammarCatalogEntry | undefined,
  next: AgenticOsRemoteGrammarCatalogEntry,
): AgenticOsRemoteGrammarCatalogEntry => ({
  token: next.token,
  kind: next.kind || previous?.kind || '',
  label: next.label || previous?.label || '',
  summary: next.summary || previous?.summary || '',
  intent: next.intent || previous?.intent || '',
  sourcePath: next.sourcePath || previous?.sourcePath || '',
  sourceUrl: next.sourceUrl || previous?.sourceUrl || '',
  fileName: next.fileName || previous?.fileName || '',
  keywords: [...new Set([...(previous?.keywords || []), ...(next.keywords || [])])],
  mcpTool: next.mcpTool || previous?.mcpTool || '',
  mcpTools: next.mcpTools?.length ? next.mcpTools : previous?.mcpTools || [],
  semantics: next.semantics?.length ? next.semantics : previous?.semantics || [],
  bindings: next.bindings?.length ? next.bindings : previous?.bindings || [],
})

export function getAgenticOsRemoteGrammarCatalogSnapshot(): AgenticOsRemoteGrammarSnapshot {
  return remoteGrammarSnapshot
}

export function getAgenticOsRemoteGrammarCatalogEntries(): readonly AgenticOsRemoteGrammarCatalogEntry[] {
  return remoteGrammarSnapshot.entries
}

export function registerAgenticOsRemoteGrammarCatalogEntries(
  entries: readonly AgenticOsRemoteGrammarCatalogEntry[],
): readonly AgenticOsRemoteGrammarCatalogEntry[] {
  let changed = false
  const normalizedEntries = entries
    .map(normalizeCatalogEntry)
    .filter(Boolean) as AgenticOsRemoteGrammarCatalogEntry[]
  normalizedEntries.forEach(entry => {
    const previous = remoteGrammarEntriesByToken.get(entry.token)
    const merged = mergeCatalogEntry(previous, entry)
    if (!previous || JSON.stringify(previous) !== JSON.stringify(merged)) {
      remoteGrammarEntriesByToken.set(entry.token, merged)
      changed = true
    }
  })
  if (changed) {
    if (remoteGrammarCatalogDigest && remoteGrammarHydrationStatus === 'fresh') {
      remoteGrammarHydrationStatus = 'stale'
      remoteGrammarRoutingVerified = false
      remoteGrammarHydrationError = 'Agentic OS catalog changed outside the verified MCP hydration cycle'
    }
    emitRemoteGrammarSnapshot()
  }
  return normalizedEntries
}

const replaceRemoteGrammarCatalogSigilEntries = (
  sigil: AgenticOsRemoteGrammarSigil,
  entries: readonly AgenticOsRemoteGrammarCatalogEntry[],
): readonly AgenticOsRemoteGrammarCatalogEntry[] => {
  for (const token of remoteGrammarEntriesByToken.keys()) {
    if (normalizeSigil(token) === sigil) remoteGrammarEntriesByToken.delete(token)
  }
  return registerAgenticOsRemoteGrammarCatalogEntries(entries)
}

export function resetAgenticOsRemoteGrammarCatalogForTests(): void {
  beginRemoteGrammarHydrationCycle()
  remoteGrammarEntriesByToken = new Map()
  remoteGrammarSourceRevision = ''
  remoteGrammarCatalogDigest = ''
  remoteGrammarRoutingSchema = ''
  remoteGrammarRoutingDigest = ''
  remoteGrammarRoutingVerified = false
  remoteGrammarExpectedCounts = null
  remoteGrammarHydrationStatus = 'idle'
  remoteGrammarHydrationAttempts = 0
  remoteGrammarHydrationError = ''
  remoteGrammarSuccessfulSigils = new Map()
  remoteGrammarLiveAgentProviderProof = emptyLiveProviderProof()
  remoteGrammarProgressiveAgentsReadiness = emptyProgressiveAgentsReadiness()
  emitRemoteGrammarSnapshot()
}
export function subscribeAgenticOsRemoteGrammarCatalog(listener: () => void): () => void {
  remoteGrammarListeners.add(listener)
  return () => remoteGrammarListeners.delete(listener)
}

export function useAgenticOsRemoteGrammarCatalog(args: {
  sigils?: readonly AgenticOsRemoteGrammarSigil[]
} = {}): AgenticOsRemoteGrammarSnapshot {
  const sigilSignature = (args.sigils || []).join(',')
  const autoHydrationAllowed = useAgenticOsRemoteGrammarAutoHydration()
  const snapshot = useSyncExternalStore(
    subscribeAgenticOsRemoteGrammarCatalog,
    getAgenticOsRemoteGrammarCatalogSnapshot,
    getAgenticOsRemoteGrammarCatalogSnapshot,
  )
  useEffect(() => {
    const sigils = sigilSignature.split(',').filter((value, index, values) => REMOTE_GRAMMAR_SIGIL_ORDER.includes(value as AgenticOsRemoteGrammarSigil) && values.indexOf(value) === index) as AgenticOsRemoteGrammarSigil[]
    if (!autoHydrationAllowed || sigils.length === 0) return
    void hydrateAgenticOsRemoteGrammarCatalogBySigils(sigils)
  }, [autoHydrationAllowed, sigilSignature])
  return snapshot
}
export async function fetchAgenticOsRemoteGrammarCatalog(
  args: { query: string, signal?: AbortSignal },
): Promise<AgenticOsRemoteGrammarCatalogEntry[]> {
  const hydrationEpoch = remoteGrammarHydrationEpoch, client = sharedAgenticOsRemoteGrammarClient
  const payload = await client.searchCatalogSnapshot(args.query, { signal: args.signal })
  if (hydrationEpoch !== remoteGrammarHydrationEpoch) return []
  if (!/^[0-9a-f]{40}$/.test(payload.sourceRevision)) {
    throw new Error('Agentic OS remote grammar response is missing an exact docs revision')
  }
  if (!/^[0-9a-f]{64}$/.test(payload.catalogDigest)) {
    throw new Error('Agentic OS remote grammar response is missing an exact catalog digest')
  }
  const expectedCounts = normalizePayloadCounts(payload.counts)
  if (!expectedCounts) {
    throw new Error('Agentic OS remote grammar response is missing exact catalog counts')
  }
  const sourceBoundCatalog = normalizeAgenticOsRemoteGrammarCatalogProvenance(
    payload.catalog,
    payload.sourceRevision,
  )
  const revisionChanged = Boolean(
    remoteGrammarSourceRevision && remoteGrammarSourceRevision !== payload.sourceRevision,
  )
  if (revisionChanged) {
    remoteGrammarEntriesByToken = new Map()
    remoteGrammarCatalogDigest = ''
    remoteGrammarRoutingSchema = ''
    remoteGrammarRoutingDigest = ''
    remoteGrammarRoutingVerified = false
    remoteGrammarExpectedCounts = null
    remoteGrammarLiveAgentProviderProof = emptyLiveProviderProof(payload.sourceRevision)
    remoteGrammarProgressiveAgentsReadiness = emptyProgressiveAgentsReadiness(payload.sourceRevision)
  }
  if (remoteGrammarCatalogDigest && remoteGrammarCatalogDigest !== payload.catalogDigest) {
    throw new Error('Agentic OS remote grammar responses disagree on the catalog digest')
  }
  const incomingRoutingSchema = normalizeString(payload.routingSchema)
  const incomingRoutingDigest = normalizeString(payload.routingDigest)
  if (Boolean(incomingRoutingSchema) !== Boolean(incomingRoutingDigest)) {
    throw new Error('Agentic OS remote grammar response has an incomplete routing proof')
  }
  if (
    incomingRoutingSchema
    && (
      incomingRoutingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
      || !/^[0-9a-f]{64}$/.test(incomingRoutingDigest)
    )
  ) {
    throw new Error('Agentic OS remote grammar response has an unsupported routing proof')
  }
  if (
    !revisionChanged
    && remoteGrammarSuccessfulSigils.size > 0
    && (
      remoteGrammarRoutingSchema !== incomingRoutingSchema
      || remoteGrammarRoutingDigest !== incomingRoutingDigest
    )
  ) {
    throw new Error('Agentic OS remote grammar responses disagree on the routing proof')
  }
  if (remoteGrammarExpectedCounts && !countsEqual(remoteGrammarExpectedCounts, expectedCounts)) {
    throw new Error('Agentic OS remote grammar responses disagree on the catalog counts')
  }
  remoteGrammarSourceRevision = payload.sourceRevision
  remoteGrammarCatalogDigest = payload.catalogDigest
  remoteGrammarRoutingSchema = incomingRoutingSchema
  remoteGrammarRoutingDigest = incomingRoutingDigest
  remoteGrammarRoutingVerified = false
  remoteGrammarExpectedCounts = expectedCounts
  remoteGrammarLiveAgentProviderProof = normalizeLiveProviderProof(payload.liveAgentProviderProof, payload.sourceRevision)
  remoteGrammarProgressiveAgentsReadiness = normalizeProgressiveAgentsReadiness(
    payload.progressiveAgentsReadiness,
    payload.sourceRevision,
  )
  const normalizedQuery = normalizeString(args.query)
  const sigil = REMOTE_GRAMMAR_SIGIL_ORDER.includes(normalizedQuery as AgenticOsRemoteGrammarSigil)
    ? normalizedQuery as AgenticOsRemoteGrammarSigil
    : null
  const expectedSigilCount = sigil === '/' ? expectedCounts.slash : sigil === '#' ? expectedCounts.hash : expectedCounts.at
  if (sigil && (
    sourceBoundCatalog.length !== expectedSigilCount
    || new Set(sourceBoundCatalog.map(entry => entry.token)).size !== sourceBoundCatalog.length
    || sourceBoundCatalog.some(entry => normalizeSigil(entry.token) !== sigil)
  )) {
    throw new Error(`Agentic OS remote grammar ${sigil} catalog does not match the MCP source count`)
  }
  const entries = [...(sigil
    ? replaceRemoteGrammarCatalogSigilEntries(sigil, sourceBoundCatalog)
    : registerAgenticOsRemoteGrammarCatalogEntries(sourceBoundCatalog))]
  if (sigil) remoteGrammarSuccessfulSigils.set(sigil, payload.sourceRevision)
  remoteGrammarHydrationError = ''
  remoteGrammarHydrationStatus = 'loading'
  emitRemoteGrammarSnapshot()
  if (!sigil) await hydrateAgenticOsRemoteGrammarCatalogBySigils(REMOTE_GRAMMAR_SIGIL_ORDER)
  return entries
}

export async function primeAgenticOsRemoteGrammarCatalogBySigil(
  sigil: AgenticOsRemoteGrammarSigil,
  options: { force?: boolean, maxAttempts?: 1 | 2 } = {},
): Promise<readonly AgenticOsRemoteGrammarCatalogEntry[]> {
  if (!options.force && remoteGrammarSourceRevision && remoteGrammarSuccessfulSigils.get(sigil) === remoteGrammarSourceRevision) {
    return remoteGrammarSnapshot.entries.filter(entry => normalizeSigil(entry.token) === sigil)
  }
  const hydrationEpoch = remoteGrammarHydrationEpoch, cacheKey = `${hydrationEpoch}:${sigil}`
  if (!remoteGrammarHydrationPromises.has(cacheKey)) {
    const promise = (async () => {
      remoteGrammarHydrationStatus = 'loading'
      remoteGrammarHydrationError = ''
      emitRemoteGrammarSnapshot()
      for (let attempt = 1; attempt <= (options.maxAttempts || 2); attempt += 1) {
        if (hydrationEpoch !== remoteGrammarHydrationEpoch) return []
        remoteGrammarHydrationAttempts = Math.max(remoteGrammarHydrationAttempts, attempt)
        try {
          return await fetchAgenticOsRemoteGrammarCatalog({ query: sigil })
        } catch (error) {
          if (hydrationEpoch !== remoteGrammarHydrationEpoch || (error instanceof DOMException && error.name === 'AbortError')) return []
          remoteGrammarHydrationError = error instanceof Error ? error.message : 'Agentic OS catalog hydration failed'
        }
      }
      if (hydrationEpoch !== remoteGrammarHydrationEpoch) return []
      remoteGrammarHydrationStatus = remoteGrammarSnapshot.entries.length > 0 ? 'stale' : 'blocked'
      emitRemoteGrammarSnapshot()
      return []
    })().finally(() => {
      if (remoteGrammarHydrationPromises.get(cacheKey) === promise) remoteGrammarHydrationPromises.delete(cacheKey)
    })
    remoteGrammarHydrationPromises.set(cacheKey, promise)
  }
  const promise = remoteGrammarHydrationPromises.get(cacheKey)
  return promise || Promise.resolve([])
}

export async function refreshAgenticOsRemoteGrammarCatalog(): Promise<AgenticOsRemoteGrammarSnapshot> {
  beginRemoteGrammarHydrationCycle()
  remoteGrammarSuccessfulSigils = new Map()
  remoteGrammarHydrationAttempts = 0
  remoteGrammarHydrationError = ''
  remoteGrammarHydrationStatus = 'loading'
  emitRemoteGrammarSnapshot()
  await hydrateAgenticOsRemoteGrammarCatalogBySigils(REMOTE_GRAMMAR_SIGIL_ORDER, { force: true })
  return remoteGrammarSnapshot
}
