import {
  readCachedWorkspaceDocsMirrorEntries,
  resetWorkspaceSeedProviderStorageCacheForTests,
} from '@/features/workspace-fs/workspaceSeedProviderStorageCache'

export async function testWorkspaceDocsMirrorExportCacheReusesFreshEntriesAndExpires() {
  resetWorkspaceSeedProviderStorageCacheForTests()
  const originalNow = Date.now
  try {
    let now = 1_000
    Date.now = () => now
    const loadCounter = { value: 0 }
    const load = async () => {
      loadCounter.value += 1
      return [{
        relPath: 'docs/demo.md',
        text: `# Demo ${loadCounter.value}`,
        updatedAtMs: now,
      }]
    }

    const first = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'docs-root:demo', policy: 'reuse-settled', load })
    const second = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'docs-root:demo', policy: 'reuse-settled', load })
    if (loadCounter.value !== 1) {
      throw new Error(`expected fresh docs mirror cache hit to avoid duplicate loading, got ${loadCounter.value}`)
    }
    if (second[0]?.text !== '# Demo 1') {
      throw new Error(`expected fresh docs mirror cache hit to preserve first loaded text, got ${String(second[0]?.text || '')}`)
    }

    first[0]!.text = '# Mutated caller copy'
    const third = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'docs-root:demo', policy: 'reuse-settled', load })
    if (third[0]?.text !== '# Demo 1') {
      throw new Error('expected docs mirror cache reads to return cloned entries instead of mutable cache memory')
    }

    now += 30_001
    const expired = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'docs-root:demo', policy: 'reuse-settled', load })
    if (Number(loadCounter.value) !== 2 || expired[0]?.text !== '# Demo 2') {
      throw new Error(`expected docs mirror cache to reload after TTL expiry, count=${loadCounter.value}, text=${String(expired[0]?.text || '')}`)
    }
  } finally {
    Date.now = originalNow
    resetWorkspaceSeedProviderStorageCacheForTests()
  }
}

export async function testWorkspaceDocsMirrorExportCacheRevalidatesSequentialReads() {
  resetWorkspaceSeedProviderStorageCacheForTests()
  try {
    let loads = 0
    const load = async () => [{ relPath: 'work.md', text: `revision ${++loads}`, updatedAtMs: loads }]
    const first = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'workspace:fresh', load })
    const second = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: 'workspace:fresh', load })
    if (loads !== 2 || first[0]?.text !== 'revision 1' || second[0]?.text !== 'revision 2') {
      throw new Error('expected sequential workspace reads to revalidate and return independent current snapshots')
    }
  } finally { resetWorkspaceSeedProviderStorageCacheForTests() }
}

export async function testWorkspaceDocsMirrorExportCacheSharesActiveRevalidation() {
  resetWorkspaceSeedProviderStorageCacheForTests()
  type Entries = Array<{ relPath: string; text: string; updatedAtMs: number }>
  const owned: Array<Promise<Entries>> = []
  let complete!: (entries: Entries) => void
  let completeOld!: (entries: Entries) => void
  let completeNew!: (entries: Entries) => void
  const pending = new Promise<Entries>(resolve => { complete = resolve })
  const oldPending = new Promise<Entries>(resolve => { completeOld = resolve })
  const newPending = new Promise<Entries>(resolve => { completeNew = resolve })
  try {
    const cacheKey = 'workspace:active-refresh'
    await readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled',
      load: async () => [{ relPath: 'work.md', text: 'old', updatedAtMs: 1 }] })
    let loads = 0
    const reentrantReads: Array<Promise<Entries>> = []
    const unexpectedLoad = async (): Promise<Entries> => {
      loads += 1
      return [{ relPath: 'work.md', text: 'unexpected duplicate load', updatedAtMs: 99 }]
    }
    const active = readCachedWorkspaceDocsMirrorEntries({ cacheKey, load: () => {
      loads += 1
      const reentrant = readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled', load: unexpectedLoad })
      reentrantReads.push(reentrant)
      owned.push(reentrant)
      return pending
    } })
    owned.push(active)
    const joined = readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled', load: unexpectedLoad })
    owned.push(joined)
    await Promise.resolve()
    if (loads !== 1 || reentrantReads.length !== 1) {
      throw new Error(`expected synchronous reentrant and concurrent readers to share one physical load, got ${loads}`)
    }
    const loaded = [{ relPath: 'work.md', text: 'new refresh \n', updatedAtMs: 2 }]
    complete(loaded)
    const results = await Promise.all([active, joined, ...reentrantReads])
    if (results.length !== 3 || results.some(result => result[0]?.text !== 'new refresh \n' || result[0]?.updatedAtMs !== 2)) {
      throw new Error('expected every active reader to receive the exact refreshed text and timestamp')
    }
    if (results.some(result => result === loaded || result[0] === loaded[0])
      || results[0] === results[1] || results[0]![0] === results[1]![0]
      || results[1] === results[2] || results[1]![0] === results[2]![0]) {
      throw new Error('expected loader, reentrant and concurrent readers to own independent result copies')
    }
    results[0]![0]!.text = 'caller edit'
    loaded[0]!.text = 'loader edit'
    const settled = await readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled', load: unexpectedLoad })
    if (loads !== 1 || settled[0]?.text !== 'new refresh \n'
      || results.slice(1).some(result => result[0]?.text !== 'new refresh \n')) {
      throw new Error('expected caller and loader edits to leave other readers and settled cache unchanged')
    }

    const replacementKey = 'workspace:reentrant-reset'
    let oldLoads = 0, newLoads = 0, duplicateLoads = 0
    const replacements: Array<Promise<Entries>> = []
    const oldRead = readCachedWorkspaceDocsMirrorEntries({ cacheKey: replacementKey, load: () => {
      oldLoads += 1
      resetWorkspaceSeedProviderStorageCacheForTests()
      const replacement = readCachedWorkspaceDocsMirrorEntries({ cacheKey: replacementKey, load: () => {
        newLoads += 1
        return newPending
      } })
      replacements.push(replacement)
      owned.push(replacement)
      return oldPending
    } })
    owned.push(oldRead)
    await Promise.resolve()
    if (oldLoads !== 1 || replacements.length !== 1) throw new Error('expected the old loader to start one replacement after reset')
    completeOld([{ relPath: 'work.md', text: 'retired result', updatedAtMs: 3 }])
    if ((await oldRead)[0]?.text !== 'retired result') throw new Error('expected the retired caller to retain its own result')
    const duplicateReplacement = async (): Promise<Entries> => {
      duplicateLoads += 1
      return [{ relPath: 'work.md', text: 'unexpected replacement load', updatedAtMs: 99 }]
    }
    const joinedReplacement = readCachedWorkspaceDocsMirrorEntries({ cacheKey: replacementKey,
      policy: 'reuse-settled', load: duplicateReplacement })
    owned.push(joinedReplacement)
    completeNew([{ relPath: 'work.md', text: 'current owner result', updatedAtMs: 4 }])
    const replacementResults = await Promise.all([replacements[0]!, joinedReplacement])
    if (newLoads !== 1 || duplicateLoads !== 0
      || replacementResults.some(result => result[0]?.text !== 'current owner result' || result[0]?.updatedAtMs !== 4)) {
      throw new Error('expected retired work neither to overwrite the replacement nor remove its pending ownership')
    }
    replacementResults[0]![0]!.text = 'replacement caller edit'
    const retained = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: replacementKey,
      policy: 'reuse-settled', load: duplicateReplacement })
    if (duplicateLoads !== 0 || retained[0]?.text !== 'current owner result'
      || replacementResults[1]?.[0]?.text !== 'current owner result') {
      throw new Error('expected only the current owner to publish settled bytes with independent caller copies')
    }
  } finally {
    complete([])
    completeOld([])
    completeNew([])
    await Promise.allSettled(owned)
    resetWorkspaceSeedProviderStorageCacheForTests()
  }
}

export async function testWorkspaceDocsMirrorExportCacheRetriesFailedRevalidation() {
  resetWorkspaceSeedProviderStorageCacheForTests()
  const owned: Array<Promise<unknown>> = []
  let reject!: (error: Error) => void
  const pending = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise })
  const failure = new Error('export unavailable')
  try {
    const cacheKey = 'workspace:retry'
    await readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled',
      load: async () => [{ relPath: 'work.md', text: 'old', updatedAtMs: 1 }] })
    let loads = 0
    const active = readCachedWorkspaceDocsMirrorEntries({ cacheKey, load: () => { loads += 1; return pending } })
    const joined = readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled', load: async () => {
      throw new Error('failure must be shared without starting a second request')
    } })
    owned.push(active, joined)
    const completion = Promise.allSettled([active, joined])
    reject(failure)
    const results = await completion
    if (loads !== 1 || results.some(result => result.status !== 'rejected' || result.reason !== failure)) {
      throw new Error('expected every coalesced reader to observe the actual revalidation failure')
    }
    const retried = await readCachedWorkspaceDocsMirrorEntries({ cacheKey, policy: 'reuse-settled', load: async () => {
      loads += 1
      return [{ relPath: 'work.md', text: 'recovered', updatedAtMs: 3 }]
    } })
    if (Number(loads) !== 2 || retried[0]?.text !== 'recovered') {
      throw new Error('expected failed refresh to permit retry without reviving stale settled bytes')
    }

    const syncKey = 'workspace:sync-retry'
    await readCachedWorkspaceDocsMirrorEntries({ cacheKey: syncKey, policy: 'reuse-settled',
      load: async () => [{ relPath: 'work.md', text: 'before synchronous failure', updatedAtMs: 4 }] })
    const syncFailure = new Error('synchronous export failure')
    let syncLoads = 0
    const syncLoad = (): Promise<Array<{ relPath: string; text: string; updatedAtMs: number }>> => {
      syncLoads += 1
      throw syncFailure
    }
    const syncReads = [
      readCachedWorkspaceDocsMirrorEntries({ cacheKey: syncKey, load: syncLoad }),
      readCachedWorkspaceDocsMirrorEntries({ cacheKey: syncKey, policy: 'reuse-settled', load: syncLoad }),
    ]
    owned.push(...syncReads)
    const syncResults = await Promise.allSettled(syncReads)
    if (syncLoads !== 1 || syncResults.some(result => result.status !== 'rejected' || result.reason !== syncFailure)) {
      throw new Error('expected synchronous loader failure to be shared by both readers from one physical load')
    }
    const recovered = await readCachedWorkspaceDocsMirrorEntries({ cacheKey: syncKey, policy: 'reuse-settled', load: async () => {
      syncLoads += 1
      return [{ relPath: 'work.md', text: 'synchronous failure recovered', updatedAtMs: 5 }]
    } })
    if (Number(syncLoads) !== 2 || recovered[0]?.text !== 'synchronous failure recovered' || recovered[0]?.updatedAtMs !== 5) {
      throw new Error('expected synchronous failure to retire ownership and retry without returning old settled bytes')
    }
  } finally {
    reject(failure)
    await Promise.allSettled([pending, ...owned])
    resetWorkspaceSeedProviderStorageCacheForTests()
  }
}
