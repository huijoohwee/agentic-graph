import {
  fetchAgenticOsRemoteGrammarCatalog,
  getAgenticOsRemoteGrammarCatalogSnapshot,
  primeAgenticOsRemoteGrammarCatalogBySigil,
  refreshAgenticOsRemoteGrammarCatalog,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { buildAgenticOsTestCatalogMetadata } from '@/__tests__/helpers/agenticOsCatalogDigest'

type GrammarSigil = '/' | '#' | '@'

type GrammarEntry = {
  token: string
  kind: string
  label: string
  sourcePath: string
}

const catalogEntry = (sigil: GrammarSigil, suffix: string): GrammarEntry => {
  const kind = sigil === '/' ? 'command' : sigil === '#' ? 'semantic' : 'binding'
  const dictionary = kind === 'command' ? 'COMMAND' : kind === 'semantic' ? 'SEMANTIC' : 'BINDING'
  const token = `${sigil}${suffix}`
  return {
    token,
    kind,
    label: `Revision ${suffix}`,
    sourcePath: `DICTIONARY-${dictionary}.md#${token}`,
  }
}

const rpcResponse = (id: unknown, result: Record<string, unknown>, sessionId = '') => new Response(
  JSON.stringify({ jsonrpc: '2.0', id, result }),
  {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
  },
)

const catalogResponse = (id: unknown, query: string, sourceRevision: string) => {
  const sigil = query[0] as GrammarSigil
  const catalog = (['/', '#', '@'] as const).map(value => catalogEntry(value, `revision-${sourceRevision[0]}`))
  const entry = query.length === 1
    ? catalog.find(candidate => candidate.token.startsWith(sigil))!
    : catalogEntry(sigil, `${query.slice(1)}revision-${sourceRevision[0]}`)
  return rpcResponse(id, {
    structuredContent: {
      ok: true,
      sourceRevision,
      ...buildAgenticOsTestCatalogMetadata(catalog),
      catalog: [entry],
    },
  })
}

const readQuery = (body: Record<string, unknown>) => String(
  (body.params as { arguments?: { query?: string } })?.arguments?.query || '',
)

export async function testRemoteGrammarRejectsStaleEpochFailureAfterFreshRefresh() {
  const originalFetch = globalThis.fetch
  const sourceRevision = 'd'.repeat(40)
  let deferOldRequest = true
  let freshCycleComplete = false
  let staleRetryCalls = 0
  let rejectOldRequest: ((reason?: unknown) => void) | undefined
  let markOldRequestStarted: (() => void) | undefined
  const oldRequestStarted = new Promise<void>(resolve => { markOldRequestStarted = resolve })
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return rpcResponse(body.id, { protocolVersion: '2024-11-05' }, `epoch-${String(body.id)}`)
    }
    const query = String((body.params as { arguments?: { query?: string } })?.arguments?.query || '')
    if (deferOldRequest) {
      deferOldRequest = false
      markOldRequestStarted?.()
      return new Promise<Response>((_resolve, reject) => { rejectOldRequest = reject })
    }
    if (freshCycleComplete) {
      staleRetryCalls += 1
      throw new Error('stale request retried after the fresh cycle')
    }
    const catalog = (['/', '#', '@'] as const).map(sigil => catalogEntry(sigil, 'epoch-fresh'))
    const entry = catalog.find(candidate => candidate.token.startsWith(query))!
    return rpcResponse(body.id, {
      structuredContent: {
        ok: true,
        sourceRevision,
        ...buildAgenticOsTestCatalogMetadata(catalog),
        catalog: [entry],
      },
    })
  }) as typeof fetch

  try {
    const stalePrime = primeAgenticOsRemoteGrammarCatalogBySigil('/')
    await oldRequestStarted
    const refreshed = await refreshAgenticOsRemoteGrammarCatalog()
    if (refreshed.hydration.status !== 'fresh' || refreshed.sourceRevision !== sourceRevision) {
      throw new Error(`expected replacement hydration cycle to become fresh, got ${JSON.stringify(refreshed)}`)
    }
    freshCycleComplete = true
    rejectOldRequest?.(new Error('old hydration transport failed'))
    await stalePrime

    const settled = getAgenticOsRemoteGrammarCatalogSnapshot()
    if (settled.hydration.status !== 'fresh' || settled.hydration.error || settled.sourceRevision !== sourceRevision) {
      throw new Error(`expected stale rejection to leave the fresh cycle untouched, got ${JSON.stringify(settled)}`)
    }
    if (staleRetryCalls !== 0 || settled.counts.slash !== 1 || settled.counts.hash !== 1 || settled.counts.at !== 1) {
      throw new Error(`expected exactly one fresh entry per sigil and no stale retry, got retries=${staleRetryCalls} counts=${JSON.stringify(settled.counts)}`)
    }
  } finally {
    rejectOldRequest?.(new Error('test cleanup'))
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}

export async function testRemoteGrammarReconcilesRevisionRolloverWithinBoundedRefresh() {
  const originalFetch = globalThis.fetch
  const oldRevision = 'c'.repeat(40)
  const currentRevision = 'e'.repeat(40)
  const callsBySigil = new Map<string, number>()
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return rpcResponse(body.id, { protocolVersion: '2024-11-05' }, 'revision-rollover')
    }
    const query = String((body.params as { arguments?: { query?: string } })?.arguments?.query || '')
    const calls = (callsBySigil.get(query) || 0) + 1
    callsBySigil.set(query, calls)
    if (query !== '/') await new Promise(resolve => setTimeout(resolve, 5))
    const sourceRevision = query === '/' && calls === 1 ? oldRevision : currentRevision
    const catalog = (['/', '#', '@'] as const).map(sigil => catalogEntry(sigil, 'revision-ready'))
    const entry = catalog.find(candidate => candidate.token.startsWith(query))!
    return rpcResponse(body.id, {
      structuredContent: {
        ok: true,
        sourceRevision,
        ...buildAgenticOsTestCatalogMetadata(catalog),
        catalog: [entry],
      },
    })
  }) as typeof fetch

  try {
    const refreshed = await refreshAgenticOsRemoteGrammarCatalog()
    if (refreshed.hydration.status !== 'fresh' || refreshed.sourceRevision !== currentRevision) {
      throw new Error(`expected bounded revision reconciliation to become fresh, got ${JSON.stringify(refreshed)}`)
    }
    if (callsBySigil.get('/') !== 2 || callsBySigil.get('#') !== 1 || callsBySigil.get('@') !== 1) {
      throw new Error(`expected only the old-revision sigil to reconcile once, got ${JSON.stringify(Object.fromEntries(callsBySigil))}`)
    }
    if (refreshed.counts.slash !== 1 || refreshed.counts.hash !== 1 || refreshed.counts.at !== 1
      || refreshed.entries.some(entry => !entry.sourceUrl.includes(`/blob/${currentRevision}/docs/`))) {
      throw new Error(`expected one exact-revision entry per sigil, got ${JSON.stringify(refreshed)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}

export async function testRemoteGrammarTerminalizesPartialHydrationFailure() {
  const originalFetch = globalThis.fetch
  const sourceRevision = 'b'.repeat(40)
  const calls: Record<GrammarSigil, number> = { '/': 0, '#': 0, '@': 0 }
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return rpcResponse(body.id, { protocolVersion: '2024-11-05' }, 'partial-failure-session')
    }
    const query = readQuery(body) as GrammarSigil
    calls[query] += 1
    if (query === '/') throw new TypeError('slash dictionary unavailable')
    return catalogResponse(body.id, query, sourceRevision)
  }) as typeof fetch

  try {
    const settled = await refreshAgenticOsRemoteGrammarCatalog()
    if (settled.hydration.status !== 'stale' || !settled.hydration.error || settled.sourceRevision !== sourceRevision) {
      throw new Error(`expected partial hydration to settle stale with a readable error, got ${JSON.stringify(settled)}`)
    }
    if (calls['/'] !== 2 || calls['#'] !== 1 || calls['@'] !== 1
      || settled.counts.slash !== 0 || settled.counts.hash !== 1 || settled.counts.at !== 1) {
      throw new Error(`expected bounded partial hydration with no background retry, calls=${JSON.stringify(calls)} snapshot=${JSON.stringify(settled)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}

export async function testRemoteGrammarDirectQueryReconcilesRevisionRollover() {
  const originalFetch = globalThis.fetch
  let sourceRevision = 'a'.repeat(40)
  let toolCalls = 0
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return rpcResponse(body.id, { protocolVersion: '2024-11-05' }, 'direct-query-session')
    }
    toolCalls += 1
    return catalogResponse(body.id, readQuery(body), sourceRevision)
  }) as typeof fetch

  try {
    const initial = await refreshAgenticOsRemoteGrammarCatalog()
    if (initial.hydration.status !== 'fresh') throw new Error(`expected initial revision to hydrate, got ${JSON.stringify(initial)}`)
    sourceRevision = 'b'.repeat(40)
    await fetchAgenticOsRemoteGrammarCatalog({ query: '/direct-query' })
    const settled = getAgenticOsRemoteGrammarCatalogSnapshot()
    if (settled.hydration.status !== 'fresh' || settled.sourceRevision !== sourceRevision
      || settled.entries.some(entry => entry.token.endsWith('revision-a')) || toolCalls !== 7) {
      throw new Error(`expected direct query rollover to await exact-revision reconciliation, calls=${toolCalls} snapshot=${JSON.stringify(settled)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}

export async function testRemoteGrammarRejectsCatalogDigestDrift() {
  const originalFetch = globalThis.fetch
  const sourceRevision = 'f'.repeat(40)
  const catalog = (['/', '#', '@'] as const).map(sigil => catalogEntry(sigil, 'digest-drift'))
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return rpcResponse(body.id, { protocolVersion: '2024-11-05' }, 'digest-drift-session')
    }
    const query = readQuery(body) as GrammarSigil
    return rpcResponse(body.id, {
      structuredContent: {
        ok: true,
        sourceRevision,
        ...buildAgenticOsTestCatalogMetadata(catalog),
        catalogDigest: '0'.repeat(64),
        catalog: catalog.filter(entry => entry.token.startsWith(query)),
      },
    })
  }) as typeof fetch

  try {
    const settled = await refreshAgenticOsRemoteGrammarCatalog()
    if (settled.hydration.status !== 'stale'
      || !/digest does not match/i.test(settled.hydration.error)
      || settled.catalogDigest !== '0'.repeat(64)) {
      throw new Error(`expected catalog digest drift to fail closed, got ${JSON.stringify(settled)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}
