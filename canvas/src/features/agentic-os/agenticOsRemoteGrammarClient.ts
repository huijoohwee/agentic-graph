import { useEffect, useSyncExternalStore } from 'react'
import { readEnvString } from '@/lib/config.env'
import { isWorkspaceRepoLocalRunReadyBootstrap } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useAgenticOsRemoteGrammarAutoHydration } from './useAgenticOsRemoteGrammarAutoHydration'
import {
  AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH,
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  serializeAgenticCanvasOsDocsCatalogForDigest,
} from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import {
  emptyProgressiveAgentsReadiness,
  normalizeProgressiveAgentsReadiness,
  type AgenticOsProgressiveAgentsReadinessSummary,
} from './agenticOsProgressiveAgentsReadiness'
import { normalizeAgenticOsRemoteGrammarCatalogProvenance } from './agenticOsRemoteGrammarProvenance'
import { extractAgenticOsRemoteGrammarMcpPayload, parseAgenticOsRemoteGrammarMcpResponse } from './agenticOsRemoteGrammarMcpPayload'
import {
  emptyLiveProviderProof,
  normalizeLiveProviderProof,
  type AgenticOsLiveProviderProofSummary,
} from './agenticOsLiveProviderProof'

export type AgenticOsRemoteGrammarCatalogEntry = {
  token: string
  kind?: string
  label?: string
  summary?: string
  intent?: string
  sourcePath?: string
  sourceUrl?: string
  fileName?: string
  keywords?: string[]
}

type AgenticOsRemoteGrammarPayload = {
  ok?: boolean
  catalog?: AgenticOsRemoteGrammarCatalogEntry[]
  sourceRevision?: string
  catalogDigest?: string
  counts?: Partial<Record<'command' | 'semantic' | 'binding', number>>
  liveAgentProviderProof?: unknown
  progressiveAgentsReadiness?: unknown
}

type AgenticOsRemoteGrammarClientOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
}

export type AgenticOsRemoteGrammarSigil = '/' | '#' | '@'

const DEFAULT_KNOWGRPH_AGENT_READY_BASE_URL = 'https://airvio.co/knowgrph'
const REMOTE_GRAMMAR_SIGIL_ORDER: readonly AgenticOsRemoteGrammarSigil[] = ['/', '#', '@'] as const

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeToken = (value: unknown): string => normalizeString(value)
const isLocalhostHost = (value: unknown): boolean => {
  const normalized = normalizeString(value).toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}
const isBareLocalhostOrigin = (value: unknown): boolean => {
  const origin = normalizeString(value)
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    const port = normalizeString(parsed.port)
    return isLocalhostHost(parsed.hostname) && !port
  } catch {
    return false
  }
}
const normalizeSigil = (value: unknown): AgenticOsRemoteGrammarSigil | null => {
  const token = normalizeToken(value)
  return token.startsWith('/') || token.startsWith('#') || token.startsWith('@')
    ? token[0] as AgenticOsRemoteGrammarSigil
    : null
}

const readKnowgrphAgentReadyBaseUrl = (): string => {
  const configuredBaseUrl = normalizeString(readEnvString('VITE_KNOWGRPH_AGENT_READY_BASE_URL', ''))
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const currentOrigin = normalizeString(window.location?.origin)
    if (currentOrigin && (isWorkspaceRepoLocalRunReadyBootstrap() || !isBareLocalhostOrigin(currentOrigin))) {
      return new URL('/knowgrph/', currentOrigin.endsWith('/') ? currentOrigin : `${currentOrigin}/`)
        .toString()
        .replace(/\/+$/, '')
    }
  }
  return DEFAULT_KNOWGRPH_AGENT_READY_BASE_URL
}

const resolveControlPlaneEndpoint = (endpoint?: string): string => {
  const explicitEndpoint = normalizeString(endpoint)
  if (explicitEndpoint) return explicitEndpoint
  const baseUrl = readKnowgrphAgentReadyBaseUrl()
  return `${baseUrl}${AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH.replace(/^\/knowgrph/, '')}`
}

const normalizeCatalogEntry = (entry: AgenticOsRemoteGrammarCatalogEntry): AgenticOsRemoteGrammarCatalogEntry | null => {
  const token = normalizeToken(entry.token)
  const sigil = normalizeSigil(token)
  if (!token || !sigil) return null
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

const digestCatalogEntries = async (
  entries: readonly AgenticOsRemoteGrammarCatalogEntry[],
): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Agentic OS catalog digest verification requires Web Crypto')
  }
  const bytes = new TextEncoder().encode(serializeAgenticCanvasOsDocsCatalogForDigest(entries))
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
  if (missingSigils.length === 0 && remoteGrammarExpectedCounts && countsEqual(actualCounts, remoteGrammarExpectedCounts)) {
    try {
      verifiedDigest = await digestCatalogEntries(entries)
    } catch (error) {
      remoteGrammarHydrationError = error instanceof Error ? error.message : 'Agentic OS catalog digest verification failed'
    }
  }
  const fresh = /^[0-9a-f]{40}$/.test(remoteGrammarSourceRevision)
    && /^[0-9a-f]{64}$/.test(remoteGrammarCatalogDigest)
    && missingSigils.length === 0
    && Boolean(remoteGrammarExpectedCounts && countsEqual(actualCounts, remoteGrammarExpectedCounts))
    && verifiedDigest === remoteGrammarCatalogDigest
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

const hydrateRemoteGrammarSigilsBounded = async (
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
    void hydrateRemoteGrammarSigilsBounded(sigils)
  }, [autoHydrationAllowed, sigilSignature])
  return snapshot
}
export function createAgenticOsRemoteGrammarClient(options: AgenticOsRemoteGrammarClientOptions = {}) {
  let nextId = 1
  let mcpSessionId = ''
  let sessionPromise: Promise<string> | null = null

  const postRpc = async (
    body: Record<string, unknown>,
    { signal, sessionId = '' }: { signal?: AbortSignal, sessionId?: string } = {},
  ): Promise<{ rpc: Record<string, unknown>, sessionId: string }> => {
    const response = await (options.fetchImpl || globalThis.fetch)(resolveControlPlaneEndpoint(options.endpoint), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Agentic OS remote grammar responded ${response.status}`)
    }
    const rpc = parseAgenticOsRemoteGrammarMcpResponse(text)
    if (!rpc) {
      throw new Error('Agentic OS remote grammar returned an unreadable MCP payload')
    }
    return {
      rpc,
      sessionId: response.headers.get('mcp-session-id') || sessionId,
    }
  }

  const ensureSession = async ({ signal }: { signal?: AbortSignal } = {}): Promise<string> => {
    if (mcpSessionId) return mcpSessionId
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const initialized = await postRpc({
          jsonrpc: '2.0',
          id: nextId++,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'knowgrph-canvas', version: '0.1.0' },
          },
        }, { signal })
        if (initialized.rpc.error) {
          throw new Error(String((initialized.rpc.error as { message?: unknown }).message || 'Agentic OS remote grammar initialize failed'))
        }
        if (!initialized.sessionId) {
          throw new Error('Agentic OS remote grammar initialize missing mcp-session-id')
        }
        mcpSessionId = initialized.sessionId
        return mcpSessionId
      })().finally(() => {
        sessionPromise = null
      })
    }
    return sessionPromise
  }

  const searchCatalogSnapshot = async (query: string, { signal }: { signal?: AbortSignal } = {}): Promise<{
    catalog: AgenticOsRemoteGrammarCatalogEntry[]
    sourceRevision: string
    catalogDigest: string
    counts: AgenticOsRemoteGrammarPayload['counts']
    liveAgentProviderProof: unknown
    progressiveAgentsReadiness: unknown
  }> => {
      const normalizedQuery = normalizeString(query)
      if (!normalizedQuery) return {
        catalog: [],
        sourceRevision: '',
        catalogDigest: '',
        counts: undefined,
        liveAgentProviderProof: null,
        progressiveAgentsReadiness: null,
      }
      const sessionId = await ensureSession({ signal })
      const invoked = await postRpc({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: {
          name: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
          arguments: { query: normalizedQuery, limit: 500 },
        },
      }, { signal, sessionId })
      if (invoked.rpc.error) {
        throw new Error(String((invoked.rpc.error as { message?: unknown }).message || 'Agentic OS remote grammar tools/call failed'))
      }
      const payload = extractAgenticOsRemoteGrammarMcpPayload<AgenticOsRemoteGrammarPayload>(invoked.rpc)
      return {
        catalog: Array.isArray(payload.catalog) ? payload.catalog : [],
        sourceRevision: normalizeString(payload.sourceRevision),
        catalogDigest: normalizeString(payload.catalogDigest),
        counts: payload.counts,
        liveAgentProviderProof: payload.liveAgentProviderProof,
        progressiveAgentsReadiness: payload.progressiveAgentsReadiness,
      }
  }

  return {
    searchCatalogSnapshot,
    async searchCatalog(query: string, options: { signal?: AbortSignal } = {}): Promise<AgenticOsRemoteGrammarCatalogEntry[]> {
      return (await searchCatalogSnapshot(query, options)).catalog
    },
  }
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
  if (remoteGrammarSourceRevision && remoteGrammarSourceRevision !== payload.sourceRevision) {
    remoteGrammarEntriesByToken = new Map()
    remoteGrammarCatalogDigest = ''
    remoteGrammarExpectedCounts = null
    remoteGrammarLiveAgentProviderProof = emptyLiveProviderProof(payload.sourceRevision)
    remoteGrammarProgressiveAgentsReadiness = emptyProgressiveAgentsReadiness(payload.sourceRevision)
  }
  if (remoteGrammarCatalogDigest && remoteGrammarCatalogDigest !== payload.catalogDigest) {
    throw new Error('Agentic OS remote grammar responses disagree on the catalog digest')
  }
  if (remoteGrammarExpectedCounts && !countsEqual(remoteGrammarExpectedCounts, expectedCounts)) {
    throw new Error('Agentic OS remote grammar responses disagree on the catalog counts')
  }
  remoteGrammarSourceRevision = payload.sourceRevision
  remoteGrammarCatalogDigest = payload.catalogDigest
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
  remoteGrammarHydrationStatus = REMOTE_GRAMMAR_SIGIL_ORDER.every(value => remoteGrammarSuccessfulSigils.get(value) === payload.sourceRevision)
    ? 'fresh'
    : 'loading'
  emitRemoteGrammarSnapshot()
  if (!sigil) await hydrateRemoteGrammarSigilsBounded(REMOTE_GRAMMAR_SIGIL_ORDER)
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
  await hydrateRemoteGrammarSigilsBounded(REMOTE_GRAMMAR_SIGIL_ORDER, { force: true })
  return remoteGrammarSnapshot
}
