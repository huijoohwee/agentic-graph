import {
  readCachedConfiguredDocsMirrorEntries as readConfigured,
  resetWorkspaceSeedProviderStorageCacheForTests as resetCache,
} from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import type { WorkspaceDocsMirrorEntry } from '@/features/workspace-fs/workspaceSeedProviderPaths'

type Entries = WorkspaceDocsMirrorEntry[]
const expect = (value: unknown, message: string): void => { if (!value) throw new Error(message) }
const entry = (text: string, relPath = 'docs/note.md'): WorkspaceDocsMirrorEntry => ({ relPath, text, updatedAtMs: 123 })
const mustReuse = async (): Promise<Entries> => { throw new Error('expected the settled cache entry') }

export async function testWorkspaceConfiguredMirrorCacheCoalescesAndClones() {
  resetCache()
  const original = [entry(' \n authored 🙂 text\n')]
  let release!: (entries: Entries) => void
  const held = new Promise<Entries>(resolve => { release = resolve })
  const owned: Array<Promise<Entries>> = []
  let loads = 0
  try {
    owned.push(readConfigured({ cacheKey: '/coalesced', load: () => {
      loads += 1
      owned.push(readConfigured({ cacheKey: '/coalesced', load: mustReuse }))
      return held
    } }))
    owned.push(readConfigured({ cacheKey: '/coalesced', load: mustReuse }))
    expect(loads === 0, 'pending ownership must exist before the loader executes')
    await Promise.resolve()
    expect(loads === 1 && owned.length === 3, 'reentrant and concurrent readers must share one loader')
    release(original)
    const results = await Promise.all(owned)
    expect(results.every(result => result[0]?.text === original[0]!.text), 'coalesced reads must preserve exact text')
    expect(results.every(result => result !== original && result[0] !== original[0]), 'readers must receive shallow clones')
    results[0]![0]!.text = 'caller edit'
    original[0]!.text = 'loader edit after completion'
    const cached = await readConfigured({ cacheKey: '/coalesced', load: mustReuse })
    expect(cached[0]?.text === ' \n authored 🙂 text\n', 'caller and loader mutation must not change cached text')
    expect(results.slice(1).every(result => result[0]?.text === cached[0]?.text), 'coalesced readers must be independent')
    expect(cached[0]?.updatedAtMs === 123, 'entry metadata must survive cloning')
  } finally {
    release([])
    await Promise.allSettled(owned)
    resetCache()
  }
}

export async function testWorkspaceConfiguredMirrorCacheRetainsFourLeastRecentlyUsedRoots() {
  resetCache()
  try {
    for (const key of ['a', 'b', 'c', 'd']) {
      await readConfigured({ cacheKey: key, load: async () => [entry(key)] })
    }
    await readConfigured({ cacheKey: 'a', load: mustReuse })
    await readConfigured({ cacheKey: 'e', load: async () => [entry('e')] })
    for (const key of ['a', 'c', 'd', 'e']) {
      const reused = await readConfigured({ cacheKey: key, load: mustReuse })
      expect(reused[0]?.text === key, 'the most recently used four roots must remain available')
    }
    let reloads = 0
    const evicted = await readConfigured({ cacheKey: 'b', load: async () => {
      reloads += 1
      return [entry('b refreshed')]
    } })
    expect(reloads === 1 && evicted[0]?.text === 'b refreshed', 'the least recently used fifth root must reload')
  } finally { resetCache() }
}

export async function testWorkspaceConfiguredMirrorCacheExpiresAndRetriesRejection() {
  resetCache()
  try {
    let loads = 0
    const load = async () => [entry(`revision ${++loads}`)]
    await readConfigured({ cacheKey: 'ttl', load })
    await readConfigured({ cacheKey: 'ttl', load: mustReuse })
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100))
    const refreshed = await readConfigured({ cacheKey: 'ttl', load })
    expect(loads === 2 && refreshed[0]?.text === 'revision 2', 'the existing one-second TTL must expire')
    const failure = new Error('configured root temporarily unavailable')
    let attempts = 0
    const reject = (): Promise<Entries> => { attempts += 1; throw failure }
    const results = await Promise.allSettled([
      readConfigured({ cacheKey: 'retry', load: reject }),
      readConfigured({ cacheKey: 'retry', load: mustReuse }),
    ])
    expect(attempts === 1 && results.every(result => result.status === 'rejected' && result.reason === failure),
      'all joined readers must observe the actual synchronous loader failure')
    const retried = await readConfigured({ cacheKey: 'retry', load: async () => {
      attempts += 1
      return [entry('recovered')]
    } })
    expect(attempts === 2 && retried[0]?.text === 'recovered', 'failure must retire the pending entry for retry')
  } finally { resetCache() }
}

const expectCompleteUncachedReads = async (cacheKey: string, expected: Entries): Promise<void> => {
  let loads = 0
  const load = async () => { loads += 1; return expected }
  for (let read = 0; read < 2; read += 1) {
    const result = await readConfigured({ cacheKey, load })
    expect(result.length === expected.length, 'cache admission must not truncate the result array')
    expect(result.every((item, index) => item.relPath === expected[index]!.relPath
      && item.text === expected[index]!.text && item.updatedAtMs === expected[index]!.updatedAtMs),
    'cache admission must preserve every accepted path, text and timestamp')
    expect(result !== expected && result.every((item, index) => item !== expected[index]), 'uncached readers still need independent clones')
  }
  expect(loads === 2, 'an over-budget dataset must pass through without settled retention')
}

export async function testWorkspaceConfiguredMirrorCacheBoundsTextAndPathRetention() {
  resetCache()
  try {
    const limit = 1024 * 1024
    const relPath = 'boundary.md'
    const units = limit - relPath.length
    const boundaryText = '🙂'.repeat(Math.floor(units / 2)) + (units % 2 ? 'x' : '')
    await readConfigured({ cacheKey: 'boundary', load: async () => [entry(boundaryText, relPath)] })
    const reused = await readConfigured({ cacheKey: 'boundary', load: mustReuse })
    expect(reused[0]?.text === boundaryText, 'the exact UTF-16 code-unit boundary must remain cacheable')
    await expectCompleteUncachedReads('aggregate-text', [
      entry('x'.repeat(limit / 2), 'left.md'), entry('y'.repeat(limit / 2), 'right.md'),
    ])
    await expectCompleteUncachedReads('unicode-units', [entry('🙂'.repeat(limit / 2))])
    await expectCompleteUncachedReads('path-budget', [entry('authored body', 'p'.repeat(limit))])
  } finally { resetCache() }
}

export async function testWorkspaceConfiguredMirrorCacheBoundsRetainedEntryCount() {
  resetCache()
  try {
    const accepted = Array.from({ length: 500 }, (_, index) => entry(`body ${index}`, `notes/${index}.md`))
    await readConfigured({ cacheKey: 'count-boundary', load: async () => accepted })
    const reused = await readConfigured({ cacheKey: 'count-boundary', load: mustReuse })
    expect(reused.length === 500 && reused[499]?.text === 'body 499', 'all 500 accepted entries must remain cacheable')
    await expectCompleteUncachedReads('count-overflow', [...accepted, entry('last authored body', 'notes/500.md')])
  } finally { resetCache() }
}

export async function testWorkspaceConfiguredMirrorCacheRetiresOnlyItsOwnPromise() {
  resetCache()
  let releaseOld!: (entries: Entries) => void
  let releaseNew!: (entries: Entries) => void
  const oldValue = new Promise<Entries>(resolve => { releaseOld = resolve })
  const newValue = new Promise<Entries>(resolve => { releaseNew = resolve })
  const owned: Array<Promise<Entries>> = []
  try {
    const oldRead = readConfigured({ cacheKey: 'replaced', load: () => oldValue })
    owned.push(oldRead)
    await Promise.resolve()
    resetCache()
    const newRead = readConfigured({ cacheKey: 'replaced', load: () => newValue })
    owned.push(newRead)
    await Promise.resolve()
    releaseOld([entry('old result')])
    expect((await oldRead)[0]?.text === 'old result', 'a retired caller must keep its completed result')
    const joined = readConfigured({ cacheKey: 'replaced', load: mustReuse })
    owned.push(joined)
    releaseNew([entry('new result')])
    const [fresh, shared] = await Promise.all([newRead, joined])
    expect(fresh[0]?.text === 'new result' && shared[0]?.text === 'new result',
      'retiring old work must neither publish its cache entry nor delete newer pending ownership')
    const cached = await readConfigured({ cacheKey: 'replaced', load: mustReuse })
    expect(cached[0]?.text === 'new result', 'only the current promise may publish settled data')
  } finally {
    releaseOld([])
    releaseNew([])
    await Promise.allSettled(owned)
    resetCache()
  }
}
