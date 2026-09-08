import assert from 'node:assert/strict'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import {
  hydrateWorkspaceEntriesInlineText,
  readProvidedActiveWorkspaceEntriesSnapshot,
  readWorkspaceActiveDocumentResolvedText,
  readWorkspaceActiveEntrySnapshot,
} from '@/features/source-files/sourceFilesRuntimeActive'
import { invalidateCachedWorkspaceActiveEntrySnapshot as invalidate } from '@/features/source-files/workspaceActiveEntryCache'
import { pruneWorkspaceEntriesForInlineSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.shared'
import { withFetchAndEnv } from './helpers/workspaceSeedMirrorHarness'

const activePath = '/notes/active-entry-cache-fixture.md'
const entry = (text: string, updatedAtMs = 71): WorkspaceEntry => ({
  path: activePath, parentPath: '/notes', kind: 'file', name: 'active-entry-cache-fixture.md', text, updatedAtMs,
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
const createFs = (read: () => Promise<string | null>) => {
  let reads = 0
  const unexpected: string[] = []
  const reject = async (method: string): Promise<never> => {
    unexpected.push(method)
    throw new Error(`Unexpected active-entry fixture operation: ${method}`)
  }
  const fs: WorkspaceFs = {
    ensureSeed: () => reject('ensureSeed'), listEntries: () => reject('listEntries'),
    readFileText: async path => { assert.equal(path, activePath); reads += 1; return read() },
    writeFileText: () => reject('writeFileText'), createFile: () => reject('createFile'),
    createFolder: () => reject('createFolder'), deleteEntry: () => reject('deleteEntry'),
  }
  return { fs, unexpected, get reads() { return reads } }
}
const withFixture = async (run: () => Promise<void>) => {
  const requests: string[] = []
  invalidate()
  try {
    await withFetchAndEnv({ VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: '1', VITE_AGENTIC_OS_STORAGE_BASE_URL: '' }, async input => {
      requests.push(String(input))
      throw new Error('Active-entry cache fixtures must not fetch')
    }, run)
    assert.deepEqual(requests, [], 'Local active-entry reads must not issue network requests')
  } finally { invalidate() }
}
const readSnapshot = (fs: WorkspaceFs, workspaceEntries?: WorkspaceEntry[]) => (
  readWorkspaceActiveEntrySnapshot({ fs, activePath, workspaceEntries })
)

export async function testActiveEntryCacheSeparatesFilesystemOwners() {
  await withFixture(async () => {
    const a = createFs(async () => '# workspace A'), b = createFs(async () => '# workspace B')
    assert.equal((await readSnapshot(a.fs))[0].text, '# workspace A')
    assert.equal((await readSnapshot(b.fs))[0].text, '# workspace B', 'equal paths do not identify equal workspaces')
    assert.equal(a.reads, 1); assert.equal(b.reads, 1)
    assert.deepEqual([...a.unexpected, ...b.unexpected], [])
  })
}

export async function testActiveEntryCacheReturnsIndependentArrays() {
  await withFixture(async () => {
    const owned = createFs(async () => '# original')
    const first = await readSnapshot(owned.fs)
    first.push({ ...entry('# injected'), path: '/notes/injected.md' })
    const second = await readSnapshot(owned.fs)
    assert.equal(second.length, 1, 'caller array mutations must not become retained workspace content')
    assert.notEqual(first, second)
    assert.equal(second[0].text, '# original'); assert.equal(owned.reads, 1)
    assert.deepEqual(owned.unexpected, [])
  })
}

export async function testActiveEntryCacheReturnsIndependentEntries() {
  await withFixture(async () => {
    const owned = createFs(async () => '# original')
    const first = await readSnapshot(owned.fs)
    first[0].text = '# caller mutation'; first[0].name = 'mutated.md'
    const second = await readSnapshot(owned.fs)
    assert.equal(second[0].text, '# original'); assert.equal(second[0].name, 'active-entry-cache-fixture.md')
    const provided = entry('# supplied source')
    const snapshot = readProvidedActiveWorkspaceEntriesSnapshot({ activePath, activeWorkspaceEntriesSnapshot: [provided] })
    assert.ok(snapshot)
    snapshot[0].text = '# supplied result mutation'
    assert.equal(provided.text, '# supplied source', 'a returned active snapshot cannot mutate its source observation')
    assert.equal(owned.reads, 1); assert.deepEqual(owned.unexpected, [])
  })
}

const assertProvidedBlankWins = async (text: string) => withFixture(async () => {
  const owned = createFs(async () => '# older cached document')
  await readSnapshot(owned.fs)
  const snapshot = await readSnapshot(owned.fs, [entry(text)])
  assert.equal(snapshot[0].text, text, 'an explicit text value must win over an older cached document')
  assert.equal(snapshot[0].updatedAtMs, 71)
  assert.equal(owned.reads, 1, 'an explicit blank snapshot is complete and requires no filesystem hydration')
  const provided = readProvidedActiveWorkspaceEntriesSnapshot({ activePath, activeWorkspaceEntriesSnapshot: [entry(text)] })
  assert.equal(provided?.[0]?.text, text)
  assert.deepEqual(owned.unexpected, [])
})

export async function testActiveEntryCachePreservesExplicitEmptyDocument() {
  await assertProvidedBlankWins('')
}

export async function testActiveEntryCachePreservesExplicitWhitespaceDocument() {
  await assertProvidedBlankWins(' \t\r\n  ')
}

export async function testActiveEntryCacheHydratesOmittedInlineText() {
  await withFixture(async () => {
    const text = '# full content\n' + '🧭'.repeat(30)
    const observed = entry(text), projected = pruneWorkspaceEntriesForInlineSnapshot([observed], 10)
    assert.equal(projected[0].text, undefined, 'the native inline cap expresses omission with undefined')
    assert.equal(observed.text, text)
    const owned = createFs(async () => text)
    const snapshot = await readSnapshot(owned.fs, projected)
    assert.equal(snapshot[0].text, text); assert.equal(owned.reads, 1)
    assert.deepEqual(owned.unexpected, [])
  })
}

export async function testActiveEntryCacheReusesSameFilesystemOwner() {
  await withFixture(async () => {
    const owned = createFs(async () => '# one owned read')
    assert.equal((await readSnapshot(owned.fs))[0].text, '# one owned read')
    assert.equal((await readSnapshot(owned.fs))[0].text, '# one owned read')
    assert.equal(owned.reads, 1)
    assert.deepEqual(owned.unexpected, [])
  })
}

const assertLateReadCannotReplaceNewer = async (invalidation: 'path' | 'all' | 'none') => withFixture(async () => {
  const entered = deferred<void>(), firstText = deferred<string>()
  let calls = 0, first: Promise<WorkspaceEntry[]> | undefined
  const owned = createFs(async () => {
    calls += 1
    if (calls === 1) { entered.resolve(); return firstText.promise }
    return '# newer completed read'
  })
  try {
    first = readSnapshot(owned.fs)
    void first.catch(() => void 0)
    await entered.promise
    if (invalidation === 'path') invalidate(activePath)
    if (invalidation === 'all') invalidate()
    assert.equal((await readSnapshot(owned.fs))[0].text, '# newer completed read')
    firstText.resolve('# older delayed read')
    await first
    assert.equal((await readSnapshot(owned.fs))[0].text, '# newer completed read', 'late read cannot repopulate stale retained text')
    assert.equal(owned.reads, 2, 'the newer retained result should remain reusable')
    assert.deepEqual(owned.unexpected, [])
  } finally {
    firstText.resolve('# older delayed read')
    if (first) await first.catch(() => void 0)
  }
})

export async function testActiveEntryCacheInvalidationFencesDelayedRead() {
  await assertLateReadCannotReplaceNewer('path')
}

export async function testActiveEntryCacheNewestReadOwnsRetention() {
  await assertLateReadCannotReplaceNewer('none')
}

export async function testActiveEntryResolverPreservesSuccessfulFilesystemBlanks() {
  await withFixture(async () => {
    for (const text of ['', ' \t\r\n  ']) {
      const owned = createFs(async () => text)
      assert.equal(await readWorkspaceActiveDocumentResolvedText({ activePath, fs: owned.fs }), text)
      assert.equal(owned.reads, 1); assert.deepEqual(owned.unexpected, [])
    }
  })
}

export async function testActiveEntryHydrationKeepsPresentInlineBlanks() {
  await withFixture(async () => {
    for (const text of ['', ' \t\r\n  ']) {
      const observed = entry(text), owned = createFs(async () => '# stale fallback')
      const hydrated = await hydrateWorkspaceEntriesInlineText({ fs: owned.fs, workspaceEntries: [observed], forceIncludePaths: [activePath] })
      assert.equal(hydrated[0].text, text)
      assert.equal(observed.text, text)
      assert.equal(owned.reads, 0, 'only omitted inline text should be hydrated')
      assert.deepEqual(owned.unexpected, [])
    }
  })
}

export async function testActiveEntryCacheRetriesMissingFileWithoutInvalidation() {
  await withFixture(async () => {
    let created = false
    const owned = createFs(async () => created ? '# newly created file' : null)
    const missing = await readSnapshot(owned.fs)
    assert.equal(missing[0]?.text, undefined, 'a missing snapshot must not masquerade as an authoritative empty file')
    created = true
    assert.equal((await readSnapshot(owned.fs, missing))[0].text, '# newly created file', 'reusing the missing snapshot must still allow hydration')
    assert.equal(owned.reads, 2, 'missing content cannot install a settled empty cache hit')
    const omitted = entry('placeholder'); delete omitted.text
    const stillMissing = createFs(async () => null)
    const hydrated = await hydrateWorkspaceEntriesInlineText({ fs: stillMissing.fs, workspaceEntries: [omitted] })
    assert.equal(hydrated[0].text, undefined, 'failed hydration must retain omitted text rather than fabricate an empty file')
    assert.deepEqual([...owned.unexpected, ...stillMissing.unexpected], [])
  })
}

export async function testActiveEntryCacheBoundsOwnersAndOversizedRetention() {
  await withFixture(async () => {
    const owners = Array.from({ length: 13 }, (_, index) => createFs(async () => `# owner ${index}`))
    for (let index = 0; index < owners.length; index += 1) {
      assert.equal((await readSnapshot(owners[index].fs))[0].text, `# owner ${index}`)
    }
    await readSnapshot(owners[12].fs)
    assert.equal(owners[12].reads, 1, 'most recent owner remains reusable')
    assert.equal((await readSnapshot(owners[0].fs))[0].text, '# owner 0')
    assert.equal(owners[0].reads, 2, 'retention remains bounded across filesystem owners')
    const text = 'x'.repeat(500_001), oversized = createFs(async () => text)
    assert.equal((await readSnapshot(oversized.fs))[0].text, text)
    assert.equal((await readSnapshot(oversized.fs))[0].text, text)
    assert.equal(oversized.reads, 2, 'oversized source remains complete without settled retention')
    assert.deepEqual([...owners.flatMap(owner => owner.unexpected), ...oversized.unexpected], [])
  })
}

export async function testActiveEntryCacheGlobalInvalidationFencesDelayedRead() {
  await assertLateReadCannotReplaceNewer('all')
}

export async function testActiveEntryCacheCapturesMetadataBeforeAsyncRepair() {
  await withFixture(async () => {
    for (const source of ['provided', 'returned-cache']) {
      invalidate()
      const owned = createFs(async () => '# captured content')
      const provided = source === 'provided' ? [entry('# captured content')] : await readSnapshot(owned.fs)
      const expected = { ...provided[0] }
      // The native canonical-repair await yields even when repo-local repair is
      // disabled. Mutate synchronously after invocation, before that continuation.
      const pending = readSnapshot(owned.fs, provided)
      provided[0].updatedAtMs = 999_999
      provided[0].path = '/notes/caller-mutated.md'
      provided[0].name = 'caller-mutated.md'
      provided[0].text = '# caller-mutated content'
      const result = await pending
      assert.deepEqual(result[0], expected, 'each invocation must own its observed entry metadata across await')
      assert.deepEqual((await readSnapshot(owned.fs))[0], expected, 'caller mutations must not poison subsequent cache reads')
      assert.equal(owned.reads, source === 'provided' ? 0 : 1)
      assert.deepEqual(owned.unexpected, [])
    }
  })
}

export async function testActiveEntryCacheBoundsCombinedRetainedCharacters() {
  await withFixture(async () => {
    const texts = Array.from({ length: 4 }, (_, index) => `${index}:` + 'x'.repeat(399_998))
    const owners = texts.map(text => createFs(async () => text))
    for (let index = 0; index < owners.length; index += 1) {
      assert.equal((await readSnapshot(owners[index].fs))[0].text, texts[index])
    }
    assert.equal((await readSnapshot(owners[3].fs))[0].text, texts[3])
    assert.equal(owners[3].reads, 1, 'the newest complete 400k document remains reusable')
    assert.equal((await readSnapshot(owners[0].fs))[0].text, texts[0])
    assert.equal(owners[0].reads, 2, 'four 400k documents must not exceed the global 1.5M-character retention bound')
    assert.deepEqual(owners.flatMap(owner => owner.unexpected), [])
  })
}
