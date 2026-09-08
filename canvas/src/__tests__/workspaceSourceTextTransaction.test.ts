import assert from 'node:assert/strict'
import {
  captureWorkspaceSourceTextRevision,
  enqueueWorkspaceSourceTextTransaction,
  publishWorkspaceSourceTextRevision,
  readWorkspaceSourceTextSnapshot,
} from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { readWorkspaceActiveDocumentObservedText } from '@/features/source-files/sourceFilesRuntimeActive'
import { readCachedWorkspaceSelectionResolvedTextForActivePath, type MarkdownWorkspaceSelectionResolvedTextCache } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionResolvedText'
import { readMarkdownWorkspaceWriteExpectation, resolveMarkdownWorkspaceLoadedSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceWritebackCommit'
import type { MarkdownWorkspaceLoadedSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.types'
import { withLocalDocsMirror } from './helpers/workspaceSeedMirrorHarness'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { writeWorkspaceFileAndSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'

export async function testWorkspaceSourceTextSnapshotRetriesAfterConcurrentPublication() {
  const path = '/notes/source-snapshot-race.md'
  let releaseFirstRead = () => void 0
  const firstReadRelease = new Promise<void>(resolve => {
    releaseFirstRead = resolve
  })
  let readCount = 0
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path,
    read: async () => {
      readCount += 1
      if (readCount === 1) {
        await firstReadRelease
        return 'stale text'
      }
      return 'current text'
    },
  })

  await Promise.resolve()
  publishWorkspaceSourceTextRevision(path)
  releaseFirstRead()
  const snapshot = await snapshotPromise

  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
  assert.equal(readCount, 2)
}

export async function testWorkspaceSourceTextSnapshotWaitsForReservedWrite() {
  const path = '/notes/source-snapshot-pending-write.md'
  let durableText = 'stale text'
  let releaseWrite = () => void 0
  const writeRelease = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const transaction = enqueueWorkspaceSourceTextTransaction({
    path,
    text: 'current text',
    write: async ({ text }) => {
      await writeRelease
      durableText = text
    },
  })
  let snapshotSettled = false
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path,
    read: async () => durableText,
  }).finally(() => {
    snapshotSettled = true
  })

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(snapshotSettled, false)
  releaseWrite()
  const [writeResult, snapshot] = await Promise.all([transaction, snapshotPromise])

  assert.equal(writeResult.accepted, true)
  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
}

export async function testWorkspaceSourceTextSnapshotDoesNotWaitForUnrelatedPath() {
  const pendingPath = '/notes/source-snapshot-pending-other.md'
  const readablePath = '/notes/source-snapshot-current.md'
  let releaseWrite = () => void 0
  const writeRelease = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const transaction = enqueueWorkspaceSourceTextTransaction({
    path: pendingPath,
    text: 'pending text',
    write: async () => {
      await writeRelease
    },
  })
  let snapshotSettled = false
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path: readablePath,
    read: async () => 'current text',
  }).finally(() => {
    snapshotSettled = true
  })

  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const settledBeforeUnrelatedWrite = snapshotSettled
  releaseWrite()
  assert.equal(settledBeforeUnrelatedWrite, true)
  const snapshot = await snapshotPromise
  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
  await transaction
}

export async function testWorkspaceSourceTextTransactionRejectsStaleExpectedRevision() {
  const path = '/notes/source-write-race.md'
  const expectedRevision = captureWorkspaceSourceTextRevision(path)
  publishWorkspaceSourceTextRevision(path)
  let writeCount = 0

  const result = await enqueueWorkspaceSourceTextTransaction({
    path,
    text: 'stale text',
    expectedRevision,
    write: async () => {
      writeCount += 1
    },
  })

  assert.equal(result.accepted, false)
  assert.equal(writeCount, 0)
}

export async function testWorkspaceAutosaveWriteRejectsChangedDurableSourceBase() {
  const path = '/notes/autosave-source-race.md'
  let durableText = 'newer graph text'
  let writeCount = 0
  let inlineText = ''
  const fs: WorkspaceFs = {
    ensureSeed: async () => true,
    listEntries: async () => [],
    readFileText: async () => durableText,
    writeFileText: async (_path, text) => {
      writeCount += 1
      durableText = text
    },
    createFile: async () => '/notes/new.md',
    createFolder: async () => '/notes/new-folder',
    deleteEntry: async () => {},
  }

  const saved = await writeWorkspaceFileAndSync({
    path,
    text: 'stale editor text',
    getFs: async () => fs,
    lastLoadedRef: { current: { path, text: 'older loaded text' } },
    patchWorkspaceEntryInlineText: (_path, text) => {
      inlineText = text
    },
    expectedSourceRevision: captureWorkspaceSourceTextRevision(path),
    expectedWorkspaceText: 'older loaded text',
    resetParsedState: false,
  })

  assert.equal(saved, false)
  assert.equal(writeCount, 0)
  assert.equal(durableText, 'newer graph text')
  assert.equal(inlineText, '')
}

export async function testActiveMarkdownDocumentRejectsStaleSameDocumentRevision() {
  const store = useGraphStore.getState()
  const previousName = store.markdownDocumentName
  const previousText = store.markdownDocumentText
  const previousApplyPreset = store.markdownDocumentApplyViewPreset
  try {
    store.setMarkdownDocument('/notes/revision-race.md', 'current graph text', {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    const accepted = await useGraphStore.getState().setActiveMarkdownDocument({
      name: '/notes/revision-race.md',
      text: 'stale filesystem text',
      expectedCurrentDocumentName: '/notes/revision-race.md',
      expectedCurrentDocumentText: 'older filesystem text',
      normalizeMermaidMmd: false,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })

    assert.equal(accepted, false)
    assert.equal(useGraphStore.getState().markdownDocumentText, 'current graph text')
  } finally {
    useGraphStore.getState().setMarkdownDocument(previousName, previousText, {
      autoEnableFrontmatter: false,
      applyViewPreset: previousApplyPreset,
    })
  }
}

export async function testActiveMarkdownDocumentAllowsExpectedDocumentSwitchRevision() {
  const store = useGraphStore.getState()
  const previousName = store.markdownDocumentName
  const previousText = store.markdownDocumentText
  const previousApplyPreset = store.markdownDocumentApplyViewPreset
  try {
    store.setMarkdownDocument('/notes/previous.md', 'previous text', {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    const accepted = await useGraphStore.getState().setActiveMarkdownDocument({
      name: '/notes/next.md',
      text: 'next text',
      expectedCurrentDocumentName: '/notes/previous.md',
      expectedCurrentDocumentText: 'previous text',
      normalizeMermaidMmd: false,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })

    assert.equal(accepted, true)
    assert.equal(useGraphStore.getState().markdownDocumentName, '/notes/next.md')
    assert.equal(useGraphStore.getState().markdownDocumentText, 'next text')
  } finally {
    useGraphStore.getState().setMarkdownDocument(previousName, previousText, {
      autoEnableFrontmatter: false,
      applyViewPreset: previousApplyPreset,
    })
  }
}

const observedPath = '/docs/observed-baseline.md'
const canonicalText = '# Canonical document\n\nComplete source-owned content.\n'
const rawText = '# Retained raw bytes\n'
const createObservedFs = (text: string | null) => createMemoryWorkspaceFs({ initialEntries: [
  { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
  { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
  ...(text === null ? [] : [{ path: observedPath, parentPath: '/docs', kind: 'file' as const, name: 'observed-baseline.md', text, updatedAtMs: 1 }]),
] })
const readObserved = (fs: WorkspaceFs) => readWorkspaceActiveDocumentObservedText({
  activePath: observedPath, fs, preferCanonicalPathText: true,
})
const boundedObservation = async <T>(operation: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Owned baseline observation did not settle')), 5000)
  })]) } finally { if (timer !== undefined) clearTimeout(timer) }
}

export async function testWorkspaceObservedProjectionCommitsCapturedRawBaseline() {
  await withLocalDocsMirror({ 'observed-baseline.md': canonicalText }, async () => {
    const fs = createObservedFs(rawText), originalWrite = fs.writeFileText.bind(fs)
    let writes = 0
    fs.writeFileText = async (...args) => { writes += 1; await originalWrite(...args) }
    const observed = await readObserved(fs)
    assert.equal(observed.text, canonicalText, 'initial selection retains canonical display priority')
    assert.equal(observed.observedWorkspaceText, rawText)
    assert.equal(observed.observedWorkspaceFs, fs)
    assert.equal(await fs.readFileText(observedPath), rawText)
    assert.equal(writes, 0, 'loading a display projection must never repair disk')
    const lastLoadedRef: { current: MarkdownWorkspaceLoadedSnapshot | null } = { current: { path: observedPath, ...observed } }
    const expected = readMarkdownWorkspaceWriteExpectation(lastLoadedRef.current, observedPath)
    assert.ok(expected)
    const edited = '# Authored keyboard change\n'
    assert.equal(await writeWorkspaceFileAndSync({
      path: observedPath, text: edited, getFs: async () => fs, lastLoadedRef,
      ...expected, resetParsedState: false,
    }), true)
    assert.equal(await fs.readFileText(observedPath), edited)
    assert.equal(lastLoadedRef.current?.text, edited)
    assert.equal(lastLoadedRef.current?.observedWorkspaceText, edited)
    assert.equal(lastLoadedRef.current?.observedWorkspaceFs, fs)
    assert.equal(writes, 1)
    await writeWorkspaceFileAndSync({ path: observedPath, text: '# Display only', getFs: async () => fs, lastLoadedRef, skipWrite: true, resetParsedState: false })
    assert.equal(lastLoadedRef.current?.observedWorkspaceText, edited, 'skipWrite must not authorize unobserved bytes')
    assert.equal(writes, 1)
  })
}

export async function testWorkspaceObservedProjectionRejectsUnseenChangesAndOwnerDrift() {
  await withLocalDocsMirror({ 'observed-baseline.md': canonicalText }, async () => {
    for (const newer of ['# A newer authored edit', '', null]) {
      const fs = createObservedFs(rawText), observed = await readObserved(fs)
      if (newer === null) await fs.deleteEntry(observedPath)
      else await fs.writeFileText(observedPath, newer)
      let writes = 0
      fs.writeFileText = async () => { writes += 1 }
      const lastLoadedRef = { current: { path: observedPath, ...observed } }
      const expected = readMarkdownWorkspaceWriteExpectation(lastLoadedRef.current, observedPath)
      assert.ok(expected)
      assert.equal(await writeWorkspaceFileAndSync({ path: observedPath, text: '# Stale editor', getFs: async () => fs, lastLoadedRef, ...expected, resetParsedState: false }), false)
      assert.equal(await fs.readFileText(observedPath), newer)
      assert.equal(writes, 0)
      assert.equal(lastLoadedRef.current.observedWorkspaceText, rawText)
    }
    for (const [expectedText, actual] of [['', null], [null, '']] as const) {
      const fs = createObservedFs(actual)
      assert.equal(await writeWorkspaceFileAndSync({ path: observedPath, text: '# Unseen replacement', getFs: async () => fs,
        lastLoadedRef: { current: { path: observedPath, text: canonicalText } }, expectedWorkspaceText: expectedText, expectedWorkspaceFs: fs, resetParsedState: false }), false)
      assert.equal(await fs.readFileText(observedPath), actual, 'missing and empty are distinct observations')
    }
    const owner = createObservedFs(rawText), replacement = createObservedFs(rawText)
    assert.equal(await writeWorkspaceFileAndSync({ path: observedPath, text: '# Wrong owner', getFs: async () => replacement,
      lastLoadedRef: { current: { path: observedPath, text: canonicalText } }, expectedWorkspaceText: rawText, expectedWorkspaceFs: owner, resetParsedState: false }), false)
    assert.equal(await replacement.readFileText(observedPath), rawText)
  })
}

export async function testWorkspaceObservedProjectionDropsDelayedCanonicalTextAfterRawDrift() {
  for (const newer of ['# Newer during mirror resolution', '', null]) {
    await withLocalDocsMirror({ 'observed-baseline.md': canonicalText }, async () => {
      const fs = createObservedFs(rawText), originalFetch = globalThis.fetch
      let release = () => {}, started = () => {}
      const gate = new Promise<void>(resolve => { release = resolve })
      const requested = new Promise<void>(resolve => { started = resolve })
      let operation: ReturnType<typeof readObserved> | undefined
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const response = await originalFetch(...args)
        if (response.ok) { started(); await gate }
        return response
      }) as typeof fetch
      try {
        operation = readObserved(fs)
        await boundedObservation(requested)
        if (newer === null) await fs.deleteEntry(observedPath)
        else await fs.writeFileText(observedPath, newer)
        release()
        const result = await boundedObservation(operation)
        assert.equal(result.text, newer ?? '', 'canonical text from the old raw read must not accompany newer bytes')
        assert.equal(result.observedWorkspaceText, newer)
        assert.equal(await fs.readFileText(observedPath), newer)
      } finally {
        release()
        try { if (operation) await Promise.allSettled([operation]) }
        finally { globalThis.fetch = originalFetch }
      }
    })
  }
}

export async function testWorkspaceObservedReadCoalescingRetainsGenerationAndFsOwnership() {
  await withLocalDocsMirror({ 'observed-baseline.md': canonicalText }, async () => {
    const fs = createObservedFs(rawText), originalFetch = globalThis.fetch
    const cacheRef: { current: MarkdownWorkspaceSelectionResolvedTextCache | null } = { current: null }
    let release = () => {}, started = () => {}, secondRead = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const requested = new Promise<void>(resolve => { started = resolve })
    const secondObserved = new Promise<void>(resolve => { secondRead = resolve })
    const reads: Promise<unknown>[] = []
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args)
      if (response.ok) { started(); await gate }
      return response
    }) as typeof fetch
    try {
      const read = () => readCachedWorkspaceSelectionResolvedTextForActivePath({ activePath: observedPath, fs, cacheRef, preferPathResolvedText: true, observeWorkspaceText: true })
      const first = readWorkspaceSourceTextSnapshot({ path: observedPath, read, maxAttempts: 1 }); reads.push(first)
      await boundedObservation(requested)
      await fs.writeFileText(observedPath, '# New raw generation')
      publishWorkspaceSourceTextRevision(observedPath)
      const nativeRead = fs.readFileText.bind(fs)
      fs.readFileText = async path => { secondRead(); return nativeRead(path) }
      const second = readWorkspaceSourceTextSnapshot({ path: observedPath, read, maxAttempts: 1 }); reads.push(second)
      await boundedObservation(secondObserved)
      const replacement = createObservedFs('# Replacement owner')
      let replacementStarted = () => {}
      const replacementObserved = new Promise<void>(resolve => { replacementStarted = resolve })
      const replacementNativeRead = replacement.readFileText.bind(replacement)
      replacement.readFileText = async path => { replacementStarted(); return replacementNativeRead(path) }
      const replacementReadPromise = readCachedWorkspaceSelectionResolvedTextForActivePath({ activePath: observedPath, fs: replacement, cacheRef, preferPathResolvedText: true, observeWorkspaceText: true })
      reads.push(replacementReadPromise)
      await boundedObservation(replacementObserved)
      release()
      const [oldSnapshot, nextSnapshot] = await boundedObservation(Promise.all([first, second]))
      assert.equal(oldSnapshot.current, false)
      assert.equal(oldSnapshot.value.text, '# New raw generation')
      assert.equal(nextSnapshot.current, true)
      assert.equal(nextSnapshot.value.text, canonicalText, 'new generation must perform its own canonical-priority load')
      assert.equal(nextSnapshot.value.observedWorkspaceText, '# New raw generation')
      const replacementRead = await boundedObservation(replacementReadPromise)
      assert.equal(replacementRead.observedWorkspaceFs, replacement)
      assert.equal(replacementRead.observedWorkspaceText, '# Replacement owner')
      assert.equal(cacheRef.current, null, 'paired observations are never retained after settlement')
    } finally {
      release()
      try { await Promise.allSettled(reads) } finally { globalThis.fetch = originalFetch }
    }
  })
}

export async function testWorkspaceObservedReadPreservesFallbackWithoutInventingAuthority() {
  await withLocalDocsMirror({ 'observed-baseline.md': canonicalText }, async () => {
    const missing = createObservedFs(null), missingResult = await readObserved(missing)
    assert.equal(missingResult.text, canonicalText)
    assert.equal(missingResult.observedWorkspaceText, null)
    assert.equal(missingResult.observedWorkspaceFs, missing)
    for (const failFirst of [true, false]) {
      const fs = createObservedFs(rawText), read = fs.readFileText.bind(fs)
      let count = 0
      fs.readFileText = async path => { if (failFirst || ++count > 1) throw new Error('Owned FS unavailable'); return read(path) }
      const result = await readObserved(fs)
      assert.equal(result.text, canonicalText)
      assert.equal(Object.hasOwn(result, 'observedWorkspaceText'), true)
      assert.equal(result.observedWorkspaceText, undefined)
      assert.equal(result.observedWorkspaceFs, undefined)
      const previous = { path: observedPath, text: canonicalText, observedWorkspaceText: rawText, observedWorkspaceFs: fs }
      const refreshed = resolveMarkdownWorkspaceLoadedSnapshot({ previous, path: observedPath, ...result })
      assert.equal(readMarkdownWorkspaceWriteExpectation(refreshed, observedPath), null, 'a new failed observation clears previous authority on the same path')
    }
    const fallback = await readWorkspaceActiveDocumentObservedText({ activePath: '/notes/inline-only.md', fs: missing, fallbackText: '# Inline selected entry' })
    assert.equal(fallback.text, '# Inline selected entry')
    assert.equal(fallback.observedWorkspaceText, null)
  })
}
